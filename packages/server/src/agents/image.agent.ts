import { IAgent, ITool } from "./type";
import { createHash } from "crypto";
import * as LRU from "lru-cache";
import { inflateSync, deflateSync } from "zlib";

const MIN_IMAGE_DIM = 56; // qwen3-vl crashes on images smaller than ~56x56

/**
 * Read PNG dimensions from IHDR chunk without full decode.
 * Returns null if the buffer is not a valid PNG.
 */
function getPngDimensions(base64Data: string): { w: number; h: number } | null {
  try {
    const buf = Buffer.from(base64Data, "base64");
    if (buf.length < 24 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47)
      return null;
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  } catch {
    return null;
  }
}

/**
 * Pad a small PNG onto a white canvas of at least MIN_IMAGE_DIM x MIN_IMAGE_DIM.
 * Only handles 8-bit RGB PNGs (the format we create in tests and Claude Code screenshots).
 * Returns the original source unchanged if padding is not needed or the format is unsupported.
 */
function padImageIfNeeded(source: any): any {
  if (!source || source.type !== "base64" || !source.media_type?.includes("png"))
    return source;
  const dims = getPngDimensions(source.data);
  if (!dims || (dims.w >= MIN_IMAGE_DIM && dims.h >= MIN_IMAGE_DIM))
    return source;

  try {
    const buf = Buffer.from(source.data, "base64");
    // Validate: 8-bit RGB (bit depth at byte 24, color type at byte 25)
    if (buf[24] !== 8 || buf[25] !== 2) return source;

    const srcW = dims.w;
    const srcH = dims.h;
    const dstW = Math.max(srcW, MIN_IMAGE_DIM);
    const dstH = Math.max(srcH, MIN_IMAGE_DIM);

    // Decode original IDAT (collect all IDAT chunks, then inflate)
    let idatRaw = Buffer.alloc(0);
    let pos = 8;
    while (pos + 12 <= buf.length) {
      const chunkLen = buf.readUInt32BE(pos);
      const chunkType = buf.subarray(pos + 4, pos + 8).toString("ascii");
      if (chunkType === "IDAT") {
        idatRaw = Buffer.concat([idatRaw, buf.subarray(pos + 8, pos + 8 + chunkLen)]);
      } else if (chunkType === "IEND") break;
      pos += 12 + chunkLen;
    }
    const rawPixels = inflateSync(idatRaw);

    // Read source pixels row by row (each row: 1 filter byte + w*3 RGB bytes)
    const srcPixels: number[][][] = [];
    for (let y = 0; y < srcH; y++) {
      const rowOffset = y * (1 + srcW * 3);
      const filter = rawPixels[rowOffset];
      // Only handle filter type 0 (None)
      if (filter !== 0) return source;
      const row: number[][] = [];
      for (let x = 0; x < srcW; x++) {
        const base = rowOffset + 1 + x * 3;
        row.push([rawPixels[base], rawPixels[base + 1], rawPixels[base + 2]]);
      }
      srcPixels.push(row);
    }

    // Build new raw pixel data: white background, original image in top-left
    let newRaw = Buffer.alloc(dstH * (1 + dstW * 3));
    let writePos = 0;
    for (let y = 0; y < dstH; y++) {
      newRaw[writePos++] = 0; // filter: None
      for (let x = 0; x < dstW; x++) {
        const pixel = y < srcH && x < srcW ? srcPixels[y][x] : [255, 255, 255];
        newRaw[writePos++] = pixel[0];
        newRaw[writePos++] = pixel[1];
        newRaw[writePos++] = pixel[2];
      }
    }

    // Build new PNG
    function pngChunk(type: string, data: Buffer): Buffer {
      const typeBytes = Buffer.from(type, "ascii");
      const lenBuf = Buffer.alloc(4);
      lenBuf.writeUInt32BE(data.length, 0);
      const crcBuf = Buffer.alloc(4);
      const crc = require("zlib").crc32(Buffer.concat([typeBytes, data])) >>> 0;
      crcBuf.writeUInt32BE(crc, 0);
      return Buffer.concat([lenBuf, typeBytes, data, crcBuf]);
    }

    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(dstW, 0);
    ihdr.writeUInt32BE(dstH, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 2; // color type: RGB
    ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

    const compressed = deflateSync(newRaw);
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      pngChunk("IHDR", ihdr),
      pngChunk("IDAT", compressed),
      pngChunk("IEND", Buffer.alloc(0)),
    ]);

    return { ...source, data: png.toString("base64") };
  } catch {
    return source; // On any error, fall back to original
  }
}

interface ImageCacheEntry {
  source: any;
  timestamp: number;
}

class ImageCache {
  private cache: any;

  constructor(maxSize = 100) {
    const CacheClass: any = (LRU as any).LRUCache || (LRU as any);
    this.cache = new CacheClass({
      max: maxSize,
      ttl: 5 * 60 * 1000, // 5 minutes
    });
  }

  storeImage(id: string, source: any): void {
    if (this.hasImage(id)) return;
    this.cache.set(id, {
      source,
      timestamp: Date.now(),
    });
  }

  getImage(id: string): any {
    const entry = this.cache.get(id);
    return entry ? entry.source : null;
  }

  hasImage(hash: string): boolean {
    return this.cache.has(hash);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

const imageCache = new ImageCache();

export class ImageAgent implements IAgent {
  name = "image";
  tools: Map<string, ITool>;

  constructor() {
    this.tools = new Map<string, ITool>();
    this.appendTools();
  }

  shouldHandle(req: any, config: any): boolean {
    if (!config.Router.image || req.body.model === config.Router.image)
      return false;
    const lastMessage = req.body.messages[req.body.messages.length - 1];
    if (
      !config.forceUseImageAgent &&
      lastMessage.role === "user" &&
      Array.isArray(lastMessage.content) &&
      lastMessage.content.find(
        (item: any) =>
          item.type === "image" ||
          (Array.isArray(item?.content) &&
            item.content.some((sub: any) => sub.type === "image"))
      )
    ) {
      req.body.model = config.Router.image;
      const images: any[] = [];
      lastMessage.content
        .filter((item: any) => item.type === "tool_result")
        .forEach((item: any) => {
          if (Array.isArray(item.content)) {
            item.content.forEach((element: any) => {
              if (element.type === "image") {
                images.push(element);
              }
            });
            item.content = "read image successfully";
          }
        });
      lastMessage.content.push(...images);
      return false;
    }
    return req.body.messages.some(
      (msg: any) =>
        msg.role === "user" &&
        Array.isArray(msg.content) &&
        msg.content.some(
          (item: any) =>
            item.type === "image" ||
            (Array.isArray(item?.content) &&
              item.content.some((sub: any) => sub.type === "image"))
        )
    );
  }

  appendTools() {
    this.tools.set("analyzeImage", {
      name: "analyzeImage",
      description:
        "Analyse image or images by ID and extract information such as OCR text, objects, layout, colors, or safety signals.",
      input_schema: {
        type: "object",
        properties: {
          imageId: {
            type: "array",
            description: "an array of IDs to analyse",
            items: {
              type: "string",
            },
          },
          task: {
            type: "string",
            description:
              "Details of task to perform on the image.The more detailed, the better",
          },
          regions: {
            type: "array",
            description: "Optional regions of interest within the image",
            items: {
              type: "object",
              properties: {
                name: {
                  type: "string",
                  description: "Optional label for the region",
                },
                x: { type: "number", description: "X coordinate" },
                y: { type: "number", description: "Y coordinate" },
                w: { type: "number", description: "Width of the region" },
                h: { type: "number", description: "Height of the region" },
                units: {
                  type: "string",
                  enum: ["px", "pct"],
                  description: "Units for coordinates and size",
                },
              },
              required: ["x", "y", "w", "h", "units"],
            },
          },
        },
        required: ["imageId", "task"],
      },
      handler: async (args, context) => {
        const imageMessages = [];
        let imageId;

        // Create image messages from cached images
        // Use stable session key (metadata.user_id) so images cached in one request
        // can be found by follow-up requests in the same session.
        // Send in Anthropic format — the local server's transformer converts to OpenAI for the provider.
        const sessionKey = context.req.body?.metadata?.user_id || context.req.id;
        if (args.imageId) {
          const imgIds = Array.isArray(args.imageId) ? args.imageId : [args.imageId];
          for (const imgId of imgIds) {
            const image = imageCache.getImage(
              `${sessionKey}_Image#${imgId}`
            );
            if (image) {
              imageMessages.push({ type: "image", source: padImageIfNeeded(image) });
            }
          }
          delete args.imageId;
        }

        const userMessage =
          context.req.body.messages[context.req.body.messages.length - 1];
        if (userMessage.role === "user" && Array.isArray(userMessage.content)) {
          const msgs = userMessage.content.filter(
            (item: any) =>
              item.type === "text" &&
              !item.text.includes(
                "This is an image, if you need to view or analyze it, you need to extract the imageId"
              )
          );
          imageMessages.push(...msgs);
        }

        // Extract images from tool_result content and add to messages
        const extractImagesFromToolResults = (content: any) => {
          if (!content || !Array.isArray(content)) return;
          for (const item of content) {
            if (item.type === "image" && item.source) {
              imageMessages.push({ type: "image", source: padImageIfNeeded(item.source) });
            }
          }
        };

        // Check all messages for tool_result with images
        for (const msg of context.req.body.messages) {
          if (msg.role === "user" && Array.isArray(msg.content)) {
            for (const item of msg.content) {
              if (item.type === "tool_result" && item.content) {
                extractImagesFromToolResults(item.content);
              }
            }
          }
        }

        if (Object.keys(args).length > 0) {
          imageMessages.push({
            type: "text",
            text: JSON.stringify(args),
          });
        }

        // Send to analysis agent and get response
        const agentResponse = await fetch(
          `http://127.0.0.1:${context.config.PORT || 3456}/v1/messages`,
          {
            method: "POST",
            headers: {
              "x-api-key": context.config.APIKEY,
              "content-type": "application/json",
            },
            body: JSON.stringify({
              model: context.config.Router.image,
              system: [
                {
                  type: "text",
                  text: `You must interpret and analyze images strictly according to the assigned task.  
When an image placeholder is provided, your role is to parse the image content only within the scope of the user’s instructions.  
Do not ignore or deviate from the task.  
Always ensure that your response reflects a clear, accurate interpretation of the image aligned with the given objective.`,
                },
              ],
              messages: [
                {
                  role: "user",
                  content: imageMessages,
                },
              ],
              stream: false,
            }),
          }
        )
          .then((res) => res.json())
          .catch((err) => {
            return null;
          });
        if (!agentResponse || !agentResponse.content) {
          return "analyzeImage Error";
        }
        return agentResponse.content[0].text;
      },
    });
  }

  reqHandler(req: any, _config: any) {
    // Ensure system is an array so we can push to it
    if (!req.body.system) {
      req.body.system = [];
    } else if (typeof req.body.system === "string") {
      req.body.system = [{ type: "text", text: req.body.system }];
    }

    req.body.system.push({
      type: "text",
      _agentInjected: true,
      text: `CRITICAL INSTRUCTION - IMAGE ANALYSIS:
You are a text-only language model. You CANNOT see images directly.

When you see a message containing [Image #N] (where N is a number), it means an image is present.
You MUST call the analyzeImage tool to process it. Do NOT respond without calling the tool.

HOW TO USE analyzeImage:
- Extract the number N from the placeholder [Image #N]
- Call: analyzeImage(imageId: ["N"], task: "<describe what analysis is needed>")
- Example: if you see "[Image #1]", call analyzeImage with imageId: ["1"]
- Example: if you see "[Image #2]", call analyzeImage with imageId: ["2"]

RULES:
- Never describe or analyze an image without calling analyzeImage first
- Always call analyzeImage when image placeholders are present
- The imageId is always the number inside [Image #N]`,
    });

    const lastMessage = req.body.messages[req.body.messages.length - 1];
    const imageContents = req.body.messages.filter((item: any) => {
      return (
        item.role === "user" &&
        Array.isArray(item.content) &&
        item.content.some(
          (msg: any) =>
            msg.type === "image" ||
            (Array.isArray(msg.content) &&
              msg.content.some((sub: any) => sub.type === "image"))
        )
      );
    });

    const sessionKey = req.body?.metadata?.user_id || req.id;
    let imgId = 1;
    let lastMessageHasNewImage = false;
    imageContents.forEach((item: any) => {
      if (!Array.isArray(item.content)) return;
      const isLastMessage = item === lastMessage;
      item.content.forEach((msg: any) => {
        if (msg.type === "image") {
          imageCache.storeImage(`${sessionKey}_Image#${imgId}`, msg.source);
          msg.type = "text";
          delete msg.source;
          msg.text = `[Image #${imgId}] <<IMAGE PLACEHOLDER: imageId="${imgId}". Call analyzeImage(imageId=["${imgId}"]) to view this image.>>`;
          if (isLastMessage) lastMessageHasNewImage = true;
          imgId++;
        } else if (msg.type === "text" && msg.text.includes("[Image #")) {
          msg.text = msg.text.replace(/\[Image #\d+\]/g, "");
        } else if (msg.type === "tool_result") {
          if (
            Array.isArray(msg.content) &&
            msg.content.some((ele: any) => ele.type === "image")
          ) {
            imageCache.storeImage(
              `${sessionKey}_Image#${imgId}`,
              msg.content[0].source
            );
            msg.content = `[Image #${imgId}] <<IMAGE PLACEHOLDER: imageId="${imgId}". Call analyzeImage(imageId=["${imgId}"]) to view this image.>>`;
            if (isLastMessage) lastMessageHasNewImage = true;
            imgId++;
          }
        }
      });
    });

    // Force the model to call analyzeImage when the current message has a new image.
    // Using {type:"tool", name:"analyzeImage"} which the Anthropic transformer converts to
    // OpenAI format: {type:"function", function:{name:"analyzeImage"}} — valid for all providers.
    if (lastMessageHasNewImage) {
      req.body.tool_choice = { type: "tool", name: "analyzeImage" };
    }
  }
}

export const imageAgent = new ImageAgent();
