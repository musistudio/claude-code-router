export type BotPlatformModule = {
  Content: any;
  frontmatter: {
    title?: string;
    pageTitle?: string;
    eyebrow?: string;
    lead?: string;
    [key: string]: unknown;
  };
  getHeadings: () => { depth: number; slug: string; text: string }[];
  rawContent: () => string;
};

export const zhBotDocs = import.meta.glob<BotPlatformModule>(
  "./content/docs/zh/bots/*.md",
  { eager: true }
);

export const enBotDocs = import.meta.glob<BotPlatformModule>(
  "./content/docs/en/bots/*.md",
  { eager: true }
);

export const BOT_PLATFORM_ORDER = [
  "slack",
  "discord",
  "telegram",
  "line",
  "weixin-ilink",
  "wecom",
  "feishu",
  "dingtalk",
] as const;

export type BotPlatformSlug = (typeof BOT_PLATFORM_ORDER)[number];

export const BOT_PLATFORM_LABELS_ZH: Record<BotPlatformSlug, string> = {
  slack: "Slack",
  discord: "Discord",
  telegram: "Telegram",
  line: "LINE",
  "weixin-ilink": "微信",
  wecom: "企业微信",
  feishu: "飞书",
  dingtalk: "钉钉",
};

export const BOT_PLATFORM_LABELS_EN: Record<BotPlatformSlug, string> = {
  slack: "Slack",
  discord: "Discord",
  telegram: "Telegram",
  line: "LINE",
  "weixin-ilink": "Weixin",
  wecom: "WeCom",
  feishu: "Feishu",
  dingtalk: "DingTalk",
};

export function botPlatformFromPath(filePath: string): string {
  const file = filePath.split("/").pop() ?? filePath;
  return file.replace(/\.md$/, "");
}
