import Server from "@musistudio/llms";
import OpenAI from "openai";

export const createServer = (config: any): Server => {
  const server = new Server(config);
  const openai = new OpenAI({
    apiKey: config.openai?.apiKey || process.env.OPENAI_API_KEY
  });

  server.post("/upload-image", async (req: any, res: any) => {
    try {
      const { imageData, mimeType } = req.body;
      if (!imageData) {
        return res.status(400).json({ error: "No image data provided" });
      }

      const response = await openai.chat.completions.create({
        model: "gpt-4-vision-preview",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType || 'image/jpeg'};base64,${imageData}`
                }
              }
            ]
          }
        ],
        max_tokens: 300
      });

      return res.json(response);
    } catch (error) {
      console.error("Image upload error:", error);
      return res.status(500).json({ error: "Failed to process image" });
    }
  });

  return server;
};
