export interface PromptCachingConfig {
  enabled: boolean;
  maxCachedSystemLength: number;
}

const DEFAULT_CONFIG: PromptCachingConfig = {
  enabled: true,
  maxCachedSystemLength: 50000,
};

export class PromptCaching {
  private config: PromptCachingConfig;

  constructor(config: Partial<PromptCachingConfig> = {}, private logger?: any) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  injectCacheControl(body: any): any {
    if (!this.config.enabled || !body) return body;

    const system = body.system;
    if (!system) return body;

    if (typeof system === "string") {
      if (system.length > 500) {
        body.system = [
          { type: "text", text: system, cache_control: { type: "ephemeral" } },
        ];
        this.logger?.debug("PromptCaching: wrapped string system with cache_control");
      }
      return body;
    }

    if (Array.isArray(system)) {
      let modified = false;
      const enhanced = system.map((block: any, index: number) => {
        if (block.type === "text" && !block.cache_control) {
          const textLen = (block.text || "").length;
          if (textLen > 500 || (index === 0 && textLen > 100)) {
            modified = true;
            return { ...block, cache_control: { type: "ephemeral" } };
          }
        }
        return block;
      });

      if (modified) {
        body.system = enhanced;
        this.logger?.debug("PromptCaching: injected cache_control into system blocks");
      }
    }

    if (body.tools && Array.isArray(body.tools)) {
      const toolsLen = JSON.stringify(body.tools).length;
      if (toolsLen > 1000) {
        const lastTool = body.tools[body.tools.length - 1];
        if (lastTool && !lastTool.cache_control) {
          body.tools[body.tools.length - 1] = {
            ...lastTool,
            cache_control: { type: "ephemeral" },
          };
          this.logger?.debug("PromptCaching: injected cache_control into last tool");
        }
      }
    }

    if (body.messages && Array.isArray(body.messages)) {
      const firstMsg = body.messages[0];
      if (firstMsg && firstMsg.content) {
        if (typeof firstMsg.content === "string" && firstMsg.content.length > 500) {
          body.messages[0] = {
            ...firstMsg,
            content: [
              { type: "text", text: firstMsg.content, cache_control: { type: "ephemeral" } },
            ],
          };
        } else if (Array.isArray(firstMsg.content)) {
          const lastBlock = firstMsg.content[firstMsg.content.length - 1];
          if (lastBlock && lastBlock.type === "text" && !lastBlock.cache_control) {
            firstMsg.content[firstMsg.content.length - 1] = {
              ...lastBlock,
              cache_control: { type: "ephemeral" },
            };
          }
        }
      }
    }

    return body;
  }

  getStats(): { enabled: boolean } {
    return { enabled: this.config.enabled };
  }
}
