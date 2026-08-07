export type AgentClawDocModule = {
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

export const zhAgentClawDocs = import.meta.glob<AgentClawDocModule>(
  "./content/docs/zh/agentclaw/*.md",
  { eager: true }
);

export const enAgentClawDocs = import.meta.glob<AgentClawDocModule>(
  "./content/docs/en/agentclaw/*.md",
  { eager: true }
);

export const AGENTCLAW_DOC_ORDER = [
  "setup",
  "slack",
  "discord",
  "telegram",
  "line",
  "weixin-ilink",
  "wecom",
  "feishu",
  "dingtalk",
] as const;

export type AgentClawDocSlug = (typeof AGENTCLAW_DOC_ORDER)[number];

export function agentClawSlugFromPath(filePath: string): string {
  const file = filePath.split("/").pop() ?? filePath;
  return file.replace(/\.md$/, "");
}
