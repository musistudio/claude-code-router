export interface ToolCompressorConfig {
  enabled: boolean;
  maxToolResultLength: number;
  truncateTo: number;
  fileHeadLines: number;
  fileTailLines: number;
}

const DEFAULT_CONFIG: ToolCompressorConfig = {
  enabled: true,
  maxToolResultLength: 2000,
  truncateTo: 1500,
  fileHeadLines: 50,
  fileTailLines: 50,
};

export class ToolCompressor {
  private config: ToolCompressorConfig;

  constructor(config: Partial<ToolCompressorConfig> = {}, private logger?: any) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  compressRequest(body: any): any {
    if (!this.config.enabled || !body?.messages) return body;

    const compressed = { ...body, messages: body.messages.map((msg: any) => this.compressMessage(msg)) };
    return compressed;
  }

  getStats(): { compressedCount: number; savedChars: number } {
    return { compressedCount: this._compressedCount, savedChars: this._savedChars };
  }

  resetStats(): void {
    this._compressedCount = 0;
    this._savedChars = 0;
  }

  private _compressedCount = 0;
  private _savedChars = 0;

  private compressMessage(msg: any): any {
    if (msg.role !== "tool" && !this.isToolResultMessage(msg)) return msg;

    const content = msg.content;
    if (!content) return msg;

    if (typeof content === "string") {
      const compressed = this.compressTextContent(content);
      if (compressed !== content) {
        this._compressedCount++;
        this._savedChars += content.length - compressed.length;
      }
      return { ...msg, content: compressed };
    }

    if (Array.isArray(content)) {
      const compressedBlocks = content.map((block: any) => this.compressContentBlock(block));
      return { ...msg, content: compressedBlocks };
    }

    return msg;
  }

  private isToolResultMessage(msg: any): boolean {
    return msg.role === "assistant" && Array.isArray(msg.content) &&
      msg.content.some((block: any) => block.type === "tool_result");
  }

  private compressContentBlock(block: any): any {
    if (block.type === "tool_result") {
      if (block.is_error) return block;
      return { ...block, content: this.compressBlockContent(block.content) };
    }
    return block;
  }

  private compressBlockContent(content: any): any {
    if (typeof content === "string") {
      return this.compressTextContent(content);
    }
    if (Array.isArray(content)) {
      return content.map((block: any) => {
        if (block.type === "text") {
          return { ...block, text: this.compressTextContent(block.text) };
        }
        if (block.type === "image" || block.type === "image_url") {
          return this.compressImageBlock(block);
        }
        return block;
      });
    }
    return content;
  }

  private compressTextContent(text: string): string {
    if (!text || text.length <= this.config.maxToolResultLength) return text;

    const looksLikeFile = text.includes("\n") && text.split("\n").length > 20;

    if (looksLikeFile) {
      return this.compressFileContent(text);
    }

    const truncated = text.slice(0, this.config.truncateTo);
    const removedCount = text.length - this.config.truncateTo;
    return `${truncated}\n[...truncated ${removedCount} chars]`;
  }

  private compressFileContent(text: string): string {
    const lines = text.split("\n");
    const totalLines = lines.length;

    if (totalLines <= this.config.fileHeadLines + this.config.fileTailLines + 10) {
      return text;
    }

    const head = lines.slice(0, this.config.fileHeadLines);
    const tail = lines.slice(-this.config.fileTailLines);
    const omitted = totalLines - head.length - tail.length;

    return [...head, `[...${omitted} lines omitted...]`, ...tail].join("\n");
  }

  private compressImageBlock(block: any): string {
    const source = block.source || block.image_url?.url;
    if (!source) return "[image: details unavailable]";

    if (typeof source === "string" && source.startsWith("data:")) {
      const match = source.match(/^data:image\/(\w+);/);
      const format = match ? match[1] : "unknown";
      return `[image: format=${format}]`;
    }

    return "[image: external URL]";
  }
}
