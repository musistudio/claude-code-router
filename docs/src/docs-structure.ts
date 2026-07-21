import type { SectionDocModule } from "./section-docs";

export type Locale = "zh" | "en";

export type DocSectionKey =
  | "documentation"
  | "guides"
  | "configuration"
  | "fusion"
  | "toolhub"
  | "routing"
  | "providerImport"
  | "extensions"
  | "agentclaw"
  | "troubleshooting";

type LocaleText = Record<Locale, string>;

export interface DocPageDef {
  key: string;
  section: DocSectionKey;
  label: LocaleText;
  path: LocaleText;
  /** Markdown file relative to `src/content/docs/{locale}/`. */
  source: LocaleText;
}

export type SidebarItemDef =
  | { page: string }
  | { key: string; label: LocaleText; anchor: true };

export interface SidebarGroupDef {
  key: string;
  icon: "rocket" | "book" | "wand" | "pen";
  label: LocaleText;
  activeItem?: string;
  items: SidebarItemDef[];
}

export interface DocSectionDef {
  key: DocSectionKey;
  navLabel: LocaleText;
  navPath: LocaleText;
  feature?: { key: string; label: LocaleText; featured?: boolean };
  /** Section index markdown when the index is not served as a page itself. */
  indexSource?: LocaleText;
  /** Standalone feature sections render a flat, section-only sidebar. */
  standalone?: boolean;
  /** Sections listed in the cross-section sidebar tree. */
  inSidebarTree?: boolean;
  groups: SidebarGroupDef[];
}

/**
 * Every doc page, keyed by a stable slug. Sidebar items reference these keys,
 * so item identity never depends on translated heading text.
 */
export const docPages: DocPageDef[] = [
  {
    key: "documentation",
    section: "documentation",
    label: { zh: "文档", en: "Documentation" },
    path: { zh: "/", en: "/en/" },
    source: { zh: "index.md", en: "index.md" },
  },
  {
    key: "guides",
    section: "guides",
    label: { zh: "快速开始", en: "Quick start" },
    path: { zh: "/guides/", en: "/en/guides/" },
    source: { zh: "guides.md", en: "guides.md" },
  },
  {
    key: "guides/install",
    section: "guides",
    label: { zh: "安装并启动 CCR", en: "Install and start CCR" },
    path: { zh: "/guides/install/", en: "/en/guides/install/" },
    source: { zh: "guides/install.md", en: "guides/install.md" },
  },
  {
    key: "guides/cli",
    section: "guides",
    label: { zh: "CLI 安装与命令参考", en: "CLI installation and command reference" },
    path: { zh: "/guides/cli/", en: "/en/guides/cli/" },
    source: { zh: "guides/cli.md", en: "guides/cli.md" },
  },
  {
    key: "guides/docker",
    section: "guides",
    label: { zh: "Docker 部署", en: "Docker deployment" },
    path: { zh: "/guides/docker/", en: "/en/guides/docker/" },
    source: { zh: "guides/docker.md", en: "guides/docker.md" },
  },
  {
    key: "guides/provider",
    section: "guides",
    label: { zh: "接入供应商", en: "Add a provider" },
    path: { zh: "/guides/provider/", en: "/en/guides/provider/" },
    source: { zh: "guides/provider.md", en: "guides/provider.md" },
  },
  {
    key: "guides/agent-profile",
    section: "guides",
    label: { zh: "接入 Agent 配置", en: "Connect Agent Config" },
    path: { zh: "/guides/agent-profile/", en: "/en/guides/agent-profile/" },
    source: { zh: "guides/agent-profile.md", en: "guides/agent-profile.md" },
  },
  {
    key: "guides/observability",
    section: "guides",
    label: { zh: "开启日志与观测", en: "Enable logging and observability" },
    path: { zh: "/guides/observability/", en: "/en/guides/observability/" },
    source: { zh: "guides/observability.md", en: "guides/observability.md" },
  },
  {
    key: "configuration/overview",
    section: "configuration",
    label: { zh: "概览仪表盘", en: "Overview dashboard" },
    path: { zh: "/configuration/overview/", en: "/en/configuration/overview/" },
    source: { zh: "configuration/overview.md", en: "configuration/overview.md" },
  },
  {
    key: "configuration/provider",
    section: "configuration",
    label: { zh: "供应商配置", en: "Provider config" },
    path: { zh: "/configuration/providers/", en: "/en/configuration/providers/" },
    source: { zh: "configuration/providers.md", en: "configuration/providers.md" },
  },
  {
    key: "configuration/profile",
    section: "configuration",
    label: { zh: "Agent 配置", en: "Agent Config" },
    path: { zh: "/configuration/profiles/", en: "/en/configuration/profiles/" },
    source: { zh: "configuration/profiles.md", en: "configuration/profiles.md" },
  },
  {
    key: "configuration/api-keys",
    section: "configuration",
    label: { zh: "API 密钥", en: "API keys" },
    path: { zh: "/configuration/api-keys/", en: "/en/configuration/api-keys/" },
    source: { zh: "configuration/api-keys.md", en: "configuration/api-keys.md" },
  },
  {
    key: "configuration/observability",
    section: "configuration",
    label: { zh: "日志与可观测性", en: "Logs and observability" },
    path: { zh: "/configuration/observability/", en: "/en/configuration/observability/" },
    source: { zh: "configuration/observability.md", en: "configuration/observability.md" },
  },
  {
    key: "configuration/server",
    section: "configuration",
    label: { zh: "服务配置", en: "Server" },
    path: { zh: "/configuration/server/", en: "/en/configuration/server/" },
    source: { zh: "configuration/server.md", en: "configuration/server.md" },
  },
  {
    key: "configuration/config-file",
    section: "configuration",
    label: { zh: "配置数据库位置", en: "Config database location" },
    path: { zh: "/configuration/configuration-file/", en: "/en/configuration/configuration-file/" },
    source: { zh: "configuration/configuration-file.md", en: "configuration/configuration-file.md" },
  },
  {
    key: "configuration/tray",
    section: "configuration",
    label: { zh: "托盘配置", en: "Tray configuration" },
    path: { zh: "/configuration/tray/", en: "/en/configuration/tray/" },
    source: { zh: "configuration/tray.md", en: "configuration/tray.md" },
  },
  {
    key: "fusion",
    section: "fusion",
    label: { zh: "Fusion 组合模型", en: "Fusion models" },
    path: { zh: "/fusion/", en: "/en/fusion/" },
    source: { zh: "configuration/fusion.md", en: "configuration/fusion-models.md" },
  },
  {
    key: "fusion/vision",
    section: "fusion",
    label: { zh: "内置图像能力", en: "Built-in vision" },
    path: { zh: "/fusion/vision/", en: "/en/fusion/vision/" },
    source: { zh: "configuration/fusion-vision.md", en: "configuration/fusion-vision.md" },
  },
  {
    key: "fusion/web-search",
    section: "fusion",
    label: { zh: "内置联网搜索", en: "Built-in web search" },
    path: { zh: "/fusion/web-search/", en: "/en/fusion/web-search/" },
    source: { zh: "configuration/fusion-web-search.md", en: "configuration/fusion-web-search.md" },
  },
  {
    key: "fusion/image-generation",
    section: "fusion",
    label: { zh: "生图工具", en: "Image generation tool" },
    path: { zh: "/fusion/image-generation/", en: "/en/fusion/image-generation/" },
    source: { zh: "fusion/image-generation.md", en: "fusion/image-generation.md" },
  },
  {
    key: "fusion/video-generation",
    section: "fusion",
    label: { zh: "生视频工具", en: "Video generation tool" },
    path: { zh: "/fusion/video-generation/", en: "/en/fusion/video-generation/" },
    source: { zh: "fusion/video-generation.md", en: "fusion/video-generation.md" },
  },
  {
    key: "fusion/mcp-tool",
    section: "fusion",
    label: { zh: "自定义 MCP 工具", en: "Custom MCP tool" },
    path: { zh: "/fusion/mcp-tool/", en: "/en/fusion/mcp-tool/" },
    source: { zh: "configuration/fusion-mcp-tool.md", en: "configuration/fusion-mcp-tool.md" },
  },
  {
    key: "toolhub",
    section: "toolhub",
    label: { zh: "ToolHub", en: "ToolHub" },
    path: { zh: "/toolhub/", en: "/en/toolhub/" },
    source: { zh: "configuration/toolhub.md", en: "configuration/toolhub.md" },
  },
  {
    key: "routing",
    section: "routing",
    label: { zh: "智能路由", en: "Routing" },
    path: { zh: "/routing/", en: "/en/routing/" },
    source: { zh: "configuration/routing.md", en: "configuration/routing.md" },
  },
  {
    key: "providerImport",
    section: "providerImport",
    label: { zh: "一键导入供应商", en: "One-click import" },
    path: { zh: "/provider-import/", en: "/en/provider-import/" },
    source: { zh: "configuration/provider-deeplink.md", en: "configuration/provider-deeplink.md" },
  },
  {
    key: "extensions",
    section: "extensions",
    label: { zh: "扩展机制", en: "Extension mechanism" },
    path: { zh: "/extensions/", en: "/en/extensions/" },
    source: { zh: "configuration/extensions.md", en: "configuration/extensions.md" },
  },
  {
    key: "agentclaw",
    section: "agentclaw",
    label: { zh: "AgentClaw 总览", en: "Overview" },
    path: { zh: "/agentclaw/", en: "/en/agentclaw/" },
    source: { zh: "agentclaw.md", en: "agentclaw.md" },
  },
  {
    key: "agentclaw/setup",
    section: "agentclaw",
    label: { zh: "使用与配置", en: "Usage and configuration" },
    path: { zh: "/agentclaw/setup/", en: "/en/agentclaw/setup/" },
    source: { zh: "agentclaw/setup.md", en: "agentclaw/setup.md" },
  },
  {
    key: "agentclaw/slack",
    section: "agentclaw",
    label: { zh: "Slack", en: "Slack" },
    path: { zh: "/agentclaw/slack/", en: "/en/agentclaw/slack/" },
    source: { zh: "agentclaw/slack.md", en: "agentclaw/slack.md" },
  },
  {
    key: "agentclaw/discord",
    section: "agentclaw",
    label: { zh: "Discord", en: "Discord" },
    path: { zh: "/agentclaw/discord/", en: "/en/agentclaw/discord/" },
    source: { zh: "agentclaw/discord.md", en: "agentclaw/discord.md" },
  },
  {
    key: "agentclaw/telegram",
    section: "agentclaw",
    label: { zh: "Telegram", en: "Telegram" },
    path: { zh: "/agentclaw/telegram/", en: "/en/agentclaw/telegram/" },
    source: { zh: "agentclaw/telegram.md", en: "agentclaw/telegram.md" },
  },
  {
    key: "agentclaw/line",
    section: "agentclaw",
    label: { zh: "LINE", en: "LINE" },
    path: { zh: "/agentclaw/line/", en: "/en/agentclaw/line/" },
    source: { zh: "agentclaw/line.md", en: "agentclaw/line.md" },
  },
  {
    key: "agentclaw/weixin-ilink",
    section: "agentclaw",
    label: { zh: "微信", en: "Weixin" },
    path: { zh: "/agentclaw/weixin-ilink/", en: "/en/agentclaw/weixin-ilink/" },
    source: { zh: "agentclaw/weixin-ilink.md", en: "agentclaw/weixin-ilink.md" },
  },
  {
    key: "agentclaw/wecom",
    section: "agentclaw",
    label: { zh: "企业微信", en: "WeCom" },
    path: { zh: "/agentclaw/wecom/", en: "/en/agentclaw/wecom/" },
    source: { zh: "agentclaw/wecom.md", en: "agentclaw/wecom.md" },
  },
  {
    key: "agentclaw/feishu",
    section: "agentclaw",
    label: { zh: "飞书", en: "Feishu" },
    path: { zh: "/agentclaw/feishu/", en: "/en/agentclaw/feishu/" },
    source: { zh: "agentclaw/feishu.md", en: "agentclaw/feishu.md" },
  },
  {
    key: "agentclaw/dingtalk",
    section: "agentclaw",
    label: { zh: "钉钉", en: "DingTalk" },
    path: { zh: "/agentclaw/dingtalk/", en: "/en/agentclaw/dingtalk/" },
    source: { zh: "agentclaw/dingtalk.md", en: "agentclaw/dingtalk.md" },
  },
  {
    key: "troubleshooting",
    section: "troubleshooting",
    label: { zh: "Q&A", en: "Q&A" },
    path: { zh: "/troubleshooting/", en: "/en/troubleshooting/" },
    source: { zh: "troubleshooting.md", en: "troubleshooting.md" },
  },
];

const pageItem = (key: string): SidebarItemDef => ({ page: key });

/** Sections in topbar order; each owns its sidebar groups. */
export const docSections: DocSectionDef[] = [
  {
    key: "documentation",
    navLabel: { zh: "文档", en: "Documentation" },
    navPath: { zh: "/", en: "/en/" },
    inSidebarTree: true,
    groups: [
      {
        key: "documentation",
        icon: "rocket",
        label: { zh: "文档", en: "Documentation" },
        activeItem: "documentation/capabilities",
        items: [
          {
            key: "documentation/capabilities",
            label: { zh: "CCR 能帮你做什么", en: "What CCR can do" },
            anchor: true,
          },
          {
            key: "documentation/structure",
            label: { zh: "文档结构", en: "Documentation structure" },
            anchor: true,
          },
          {
            key: "documentation/reading-path",
            label: { zh: "阅读路径", en: "Reading path" },
            anchor: true,
          },
        ],
      },
    ],
  },
  {
    key: "guides",
    navLabel: { zh: "快速开始", en: "Quick start" },
    navPath: { zh: "/guides/", en: "/en/guides/" },
    feature: { key: "docs", label: { zh: "指南", en: "Guides" } },
    inSidebarTree: true,
    groups: [
      {
        key: "guides",
        icon: "book",
        label: { zh: "快速开始", en: "Quick start" },
        activeItem: "guides/install",
        items: [
          pageItem("guides/install"),
          pageItem("guides/cli"),
          pageItem("guides/docker"),
          pageItem("guides/provider"),
          pageItem("guides/agent-profile"),
          pageItem("guides/observability"),
        ],
      },
    ],
  },
  {
    key: "configuration",
    navLabel: { zh: "详细配置", en: "Detailed configuration" },
    navPath: { zh: "/configuration/overview/", en: "/en/configuration/overview/" },
    feature: { key: "configuration", label: { zh: "详细配置", en: "Detailed configuration" } },
    indexSource: { zh: "configuration.md", en: "configuration.md" },
    standalone: true,
    inSidebarTree: true,
    groups: [
      {
        key: "main",
        icon: "wand",
        label: { zh: "主页面", en: "Main pages" },
        activeItem: "configuration/overview",
        items: [
          pageItem("configuration/overview"),
          pageItem("configuration/provider"),
          pageItem("configuration/profile"),
          pageItem("configuration/api-keys"),
          pageItem("configuration/observability"),
          pageItem("configuration/server"),
        ],
      },
      {
        key: "settings",
        icon: "book",
        label: { zh: "设置页", en: "Settings pages" },
        items: [pageItem("configuration/config-file"), pageItem("configuration/tray")],
      },
    ],
  },
  {
    key: "fusion",
    navLabel: { zh: "Fusion", en: "Fusion" },
    navPath: { zh: "/fusion/", en: "/en/fusion/" },
    feature: { key: "fusion", label: { zh: "Fusion", en: "Fusion" }, featured: true },
    standalone: true,
    groups: [
      {
        key: "fusion",
        icon: "wand",
        label: { zh: "Fusion", en: "Fusion" },
        activeItem: "fusion",
        items: [
          pageItem("fusion"),
          pageItem("fusion/vision"),
          pageItem("fusion/web-search"),
          pageItem("fusion/image-generation"),
          pageItem("fusion/video-generation"),
          pageItem("fusion/mcp-tool"),
        ],
      },
    ],
  },
  {
    key: "toolhub",
    navLabel: { zh: "ToolHub", en: "ToolHub" },
    navPath: { zh: "/toolhub/", en: "/en/toolhub/" },
    feature: { key: "toolhub", label: { zh: "ToolHub", en: "ToolHub" }, featured: true },
    standalone: true,
    groups: [
      {
        key: "toolhub",
        icon: "wand",
        label: { zh: "ToolHub", en: "ToolHub" },
        activeItem: "toolhub",
        items: [pageItem("toolhub")],
      },
    ],
  },
  {
    key: "routing",
    navLabel: { zh: "智能路由", en: "Routing" },
    navPath: { zh: "/routing/", en: "/en/routing/" },
    feature: { key: "routing", label: { zh: "智能路由", en: "Routing" }, featured: true },
    standalone: true,
    groups: [
      {
        key: "routing",
        icon: "wand",
        label: { zh: "智能路由", en: "Routing" },
        activeItem: "routing",
        items: [pageItem("routing")],
      },
    ],
  },
  {
    key: "providerImport",
    navLabel: { zh: "一键导入", en: "One-click import" },
    navPath: { zh: "/provider-import/", en: "/en/provider-import/" },
    feature: { key: "providerImport", label: { zh: "一键导入", en: "One-click import" }, featured: true },
    standalone: true,
    groups: [
      {
        key: "providerImport",
        icon: "wand",
        label: { zh: "一键导入", en: "One-click import" },
        activeItem: "providerImport",
        items: [pageItem("providerImport")],
      },
    ],
  },
  {
    key: "extensions",
    navLabel: { zh: "扩展", en: "Extensions" },
    navPath: { zh: "/extensions/", en: "/en/extensions/" },
    feature: { key: "extensions", label: { zh: "扩展", en: "Extensions" }, featured: true },
    standalone: true,
    groups: [
      {
        key: "extensions",
        icon: "wand",
        label: { zh: "扩展", en: "Extensions" },
        activeItem: "extensions",
        items: [pageItem("extensions")],
      },
    ],
  },
  {
    key: "agentclaw",
    navLabel: { zh: "AgentClaw", en: "AgentClaw" },
    navPath: { zh: "/agentclaw/", en: "/en/agentclaw/" },
    feature: { key: "agentclaw", label: { zh: "AgentClaw", en: "AgentClaw" }, featured: true },
    standalone: true,
    groups: [
      {
        key: "agentclaw",
        icon: "wand",
        label: { zh: "AgentClaw", en: "AgentClaw" },
        activeItem: "agentclaw",
        items: [pageItem("agentclaw"), pageItem("agentclaw/setup")],
      },
      {
        key: "platforms",
        icon: "book",
        label: { zh: "IM 平台", en: "IM platforms" },
        items: [
          pageItem("agentclaw/slack"),
          pageItem("agentclaw/discord"),
          pageItem("agentclaw/telegram"),
          pageItem("agentclaw/line"),
          pageItem("agentclaw/weixin-ilink"),
          pageItem("agentclaw/wecom"),
          pageItem("agentclaw/feishu"),
          pageItem("agentclaw/dingtalk"),
        ],
      },
    ],
  },
  {
    key: "troubleshooting",
    navLabel: { zh: "Q&A", en: "Q&A" },
    navPath: { zh: "/troubleshooting/", en: "/en/troubleshooting/" },
    feature: { key: "troubleshooting", label: { zh: "Q&A", en: "Q&A" } },
    inSidebarTree: true,
    groups: [],
  },
];

const sectionsByKey = new Map(docSections.map((section) => [section.key, section]));
const pagesByKey = new Map(docPages.map((page) => [page.key, page]));

export function getSection(key: DocSectionKey): DocSectionDef {
  const section = sectionsByKey.get(key);
  if (!section) throw new Error(`Unknown doc section: ${key}`);
  return section;
}

export function getPage(key: string): DocPageDef | undefined {
  return pagesByKey.get(key);
}

/** Previous/next pages of a page key, limited to pages in the same section. */
export function getPrevNext(key: string): { prev?: DocPageDef; next?: DocPageDef } {
  const index = docPages.findIndex((page) => page.key === key);
  if (index === -1) return {};

  const section = docPages[index].section;
  const prev = docPages[index - 1];
  const next = docPages[index + 1];

  return {
    prev: prev?.section === section ? prev : undefined,
    next: next?.section === section ? next : undefined,
  };
}

/** Markdown source of a section's index doc, whether or not it is served as a page. */
export function sectionIndexSource(section: DocSectionDef): LocaleText {
  const indexPage = pagesByKey.get(section.key);
  const source = indexPage?.source ?? section.indexSource;
  if (!source) throw new Error(`Section ${section.key} has no index doc`);
  return source;
}

const zhDocModules = import.meta.glob<SectionDocModule>("./content/docs/zh/**/*.md", {
  eager: true,
});
const enDocModules = import.meta.glob<SectionDocModule>("./content/docs/en/**/*.md", {
  eager: true,
});

export function docModule(locale: Locale, source: string): SectionDocModule {
  const modules = locale === "en" ? enDocModules : zhDocModules;
  const mod = modules[`./content/docs/${locale}/${source}`];
  if (!mod) throw new Error(`Doc module not found: ${locale}/${source}`);
  return mod;
}

export function urlSlugFromPath(path: string): string {
  return path.split("/").filter(Boolean).pop() ?? "";
}

/** Find a page key from the last URL segment used by a locale (e.g. "providers" → "configuration/provider"). */
export function pageKeyFromSlug(
  sectionKey: DocSectionKey,
  locale: Locale,
  slug: string
): string | undefined {
  return docPages.find(
    (page) => page.section === sectionKey && urlSlugFromPath(page.path[locale]) === slug
  )?.key;
}

export interface ResolvedSidebarItem {
  key: string;
  label: string;
  path?: string;
  anchor?: boolean;
}

export interface ResolvedSidebarGroup {
  key: string;
  icon: SidebarGroupDef["icon"];
  label: string;
  activeItem?: string;
  items: ResolvedSidebarItem[];
}

/** Sidebar groups of a section with page references resolved to labels and paths. */
export function resolveSidebarGroups(
  sectionKey: DocSectionKey,
  locale: Locale
): ResolvedSidebarGroup[] {
  return getSection(sectionKey).groups
    .filter((group) => group.items.length > 0)
    .map((group) => ({
      key: group.key,
      icon: group.icon,
      label: group.label[locale],
      activeItem: group.activeItem,
      items: group.items.map((item) => {
        if ("page" in item) {
          const page = pagesByKey.get(item.page);
          if (!page) throw new Error(`Unknown sidebar page: ${item.page}`);
          return { key: page.key, label: page.label[locale], path: page.path[locale] };
        }

        return { key: item.key, label: item.label[locale], anchor: true };
      }),
    }));
}

export function navItems(locale: Locale) {
  return docSections.map((section) => ({
    label: section.navLabel[locale],
    href: section.navPath[locale],
    pageKey: section.key,
  }));
}

export function featureNavItems(locale: Locale) {
  return docSections
    .filter((section) => section.feature)
    .map((section) => ({
      label: section.feature!.label[locale],
      href: section.navPath[locale],
      featureKey: section.feature!.key,
      featured: section.feature!.featured,
    }));
}

/** zh path → en path for every served page (drives the language switcher). */
export const zhToEnPath: Record<string, string> = Object.fromEntries(
  docPages.map((page) => [page.path.zh, page.path.en])
);

/** en path → zh path for every served page (drives the language switcher). */
export const enToZhPath: Record<string, string> = Object.fromEntries(
  docPages.map((page) => [page.path.en, page.path.zh])
);
