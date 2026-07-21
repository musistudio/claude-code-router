import { featureNavItems, navItems, type DocSectionKey, type Locale } from "../docs-structure";

export type { DocSectionKey, Locale };
export type DocPageKey = DocSectionKey;

const languageOptions = [
  { locale: "zh", label: "中文", href: "/" },
  { locale: "en", label: "English", href: "/en/" },
] as const;

export const docsContent = {
  zh: {
    htmlLang: "zh-CN",
    pageTitle: "文档",
    metaDescription: "Claude Code Router（CCR）文档：安装、配置、供应商接入与故障排查指南。",
    languageLabel: "中文",
    languageOptions,
    navItems: navItems("zh"),
    featureNavItems: featureNavItems("zh"),
    tocTitle: "本页内容",
    ui: {
      searchLabel: "搜索文档",
      searchPlaceholder: "搜索…",
      searchLoading: "正在加载搜索索引…",
      copyPage: "复制页面",
      copied: "已复制",
      copyFailed: "复制失败",
      downloadLabel: "下载",
      githubLabel: "GitHub 仓库",
      themeLabel: "主题",
      starsFallback: "Stars",
      copyCode: "复制代码",
      copiedCode: "代码已复制",
      copyCodeFailed: "代码复制失败",
      prevPage: "上一页",
      nextPage: "下一页",
      pageNavLabel: "页面导航",
      editPage: "在 GitHub 上编辑此页",
    },
  },
  en: {
    htmlLang: "en",
    pageTitle: "Documentation",
    metaDescription: "Claude Code Router (CCR) documentation: installation, configuration, provider setup, and troubleshooting guides.",
    languageLabel: "English",
    languageOptions,
    navItems: navItems("en"),
    featureNavItems: featureNavItems("en"),
    tocTitle: "On this page",
    ui: {
      searchLabel: "Search docs",
      searchPlaceholder: "Search…",
      searchLoading: "Loading search index…",
      copyPage: "Copy page",
      copied: "Copied",
      copyFailed: "Copy failed",
      downloadLabel: "Download",
      githubLabel: "GitHub repository",
      themeLabel: "Theme",
      starsFallback: "Stars",
      copyCode: "Copy code",
      copiedCode: "Copied code",
      copyCodeFailed: "Copy failed",
      prevPage: "Previous",
      nextPage: "Next",
      pageNavLabel: "Page navigation",
      editPage: "Edit this page on GitHub",
    },
  },
} as const;
