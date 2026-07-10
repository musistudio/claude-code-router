import type { CSSProperties } from "react";
import {
  Activity,
  AlertCircle,
  BarChart3,
  Bot,
  CheckCircle2,
  Circle,
  Cloud,
  Copy,
  Database,
  FileText,
  Files,
  Folder,
  Gauge,
  GitBranch,
  HardDriveUpload,
  KeyRound,
  Mail,
  MessageSquare,
  Mic,
  Search,
  SendHorizontal,
  Settings,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Terminal,
  Workflow,
  Zap,
  type LucideIcon
} from "lucide-react";

export type HomeThemeStyle = Record<string, number | string>;

export type HomeThemeSectionId =
  | "assistantMessage"
  | "chatbot"
  | "chatbotScroll"
  | "home"
  | "hero"
  | "composer"
  | "composerToolbar"
  | "connectionGrid"
  | "markdown"
  | "messages"
  | "userMessage"
  | "email"
  | "files";

export type HomeThemeSectionConfig = {
  className?: string;
  connectedIcon?: HomeIconName;
  descriptionClassName?: string;
  descriptionStyle?: HomeThemeStyle;
  icon?: HomeIconName;
  iconClassName?: string;
  iconStyle?: HomeThemeStyle;
  style?: HomeThemeStyle;
  titleClassName?: string;
  titleStyle?: HomeThemeStyle;
};

export type HomeThemeConfig = {
  colors?: HomeThemeStyle;
  sections?: Partial<Record<HomeThemeSectionId, HomeThemeSectionConfig>>;
  variables?: HomeThemeStyle;
};

export type ResolvedHomeTheme = {
  colors: HomeThemeStyle;
  sections: Record<HomeThemeSectionId, HomeThemeSectionConfig>;
  variables: HomeThemeStyle;
};

const homeThemeSectionIds: HomeThemeSectionId[] = [
  "assistantMessage",
  "chatbot",
  "chatbotScroll",
  "home",
  "hero",
  "composer",
  "composerToolbar",
  "connectionGrid",
  "markdown",
  "messages",
  "userMessage",
  "email",
  "files"
];

const homeThemeSectionIdSet = new Set<string>(homeThemeSectionIds);

const homeIconRegistry = {
  Activity,
  AlertCircle,
  BarChart3,
  Bot,
  CheckCircle2,
  Circle,
  Cloud,
  Copy,
  Database,
  FileText,
  Files,
  Folder,
  Gauge,
  GitBranch,
  HardDriveUpload,
  KeyRound,
  Mail,
  MessageSquare,
  Mic,
  Search,
  SendHorizontal,
  Settings,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Terminal,
  Workflow,
  Zap
} satisfies Record<string, LucideIcon>;

export type HomeIconName = keyof typeof homeIconRegistry;

export const homeThemeIconNames = Object.keys(homeIconRegistry).sort() as HomeIconName[];

export const defaultHomeThemeConfig: ResolvedHomeTheme = {
  colors: {},
  sections: {
    assistantMessage: {},
    chatbot: {},
    chatbotScroll: {},
    composer: {},
    composerToolbar: {},
    connectionGrid: {},
    email: {
      icon: "Mail",
      style: {
        "--home-section-icon-background": "#fff4f2",
        "--home-section-icon-color": "#ea4335"
      }
    },
    files: {
      icon: "Cloud",
      style: {
        "--home-section-icon-background": "#eef7ff",
        "--home-section-icon-color": "#1a73e8"
      }
    },
    hero: {},
    home: {},
    markdown: {},
    messages: {
      connectedIcon: "CheckCircle2",
      icon: "MessageSquare",
      style: {
        "--home-section-icon-background": "#eef7ff",
        "--home-section-icon-color": "#2563eb"
      }
    },
    userMessage: {}
  },
  variables: {}
};

export const defaultHomeThemeConfigText = JSON.stringify(defaultHomeThemeConfig, null, 2);

const homeThemeColorVariableMap = {
  "button.background": ["--primary"],
  "button.foreground": ["--primary-foreground"],
  "chat.background": ["--chatbot-background"],
  "chat.foreground": ["--chatbot-foreground"],
  "chat.markdown.blockquoteBorder": ["--markdown-blockquote-border"],
  "chat.markdown.blockquoteForeground": ["--markdown-blockquote-foreground"],
  "chat.markdown.codeBackground": ["--markdown-inline-code-background"],
  "chat.markdown.codeBlockBackground": ["--markdown-code-block-background"],
  "chat.markdown.codeBlockBorder": ["--markdown-code-block-border"],
  "chat.markdown.codeBlockForeground": ["--markdown-code-block-foreground"],
  "chat.markdown.codeForeground": ["--markdown-inline-code-foreground"],
  "chat.markdown.foreground": ["--markdown-foreground"],
  "chat.markdown.headingForeground": ["--markdown-heading-foreground"],
  "chat.markdown.linkForeground": ["--markdown-link-foreground"],
  "chat.markdown.separator": ["--markdown-separator"],
  "chat.markdown.streamAccent": ["--markdown-stream-accent"],
  "chat.markdown.tableBorder": ["--markdown-table-border"],
  "chat.markdown.tableHeaderBackground": ["--markdown-table-header-background"],
  "chat.markdown.tableHeaderForeground": ["--markdown-table-header-foreground"],
  "chat.userMessage.background": ["--chatbot-user-message-background"],
  "chat.userMessage.foreground": ["--chatbot-user-message-foreground"],
  descriptionForeground: ["--muted-foreground"],
  "editor.background": ["--background"],
  "editor.foreground": ["--foreground"],
  "editorWidget.background": ["--card"],
  "editorWidget.foreground": ["--card-foreground"],
  focusBorder: ["--ring"],
  foreground: ["--foreground"],
  "input.background": ["--card"],
  "input.border": ["--input"],
  "input.foreground": ["--foreground"],
  "sideBar.background": ["--sidebar"],
  "sideBar.foreground": ["--sidebar-foreground"],
  "textLink.activeForeground": ["--primary"],
  "textLink.foreground": ["--primary", "--markdown-link-foreground"],
  "widget.border": ["--border"]
} satisfies Record<string, readonly string[]>;

export const homeThemeColorNames = Object.keys(homeThemeColorVariableMap).sort();

export function resolveHomeIcon(iconName: string | undefined, fallback: LucideIcon = Circle): LucideIcon {
  if (iconName && Object.prototype.hasOwnProperty.call(homeIconRegistry, iconName)) {
    return homeIconRegistry[iconName as HomeIconName];
  }
  return fallback;
}

export function resolveHomeThemeConfig(configText: string, pluginThemes: unknown[] = []): ResolvedHomeTheme {
  const baseTheme = pluginThemes.reduce<ResolvedHomeTheme>((currentTheme, pluginTheme) => {
    return mergeHomeThemeConfig(currentTheme, normalizeHomeThemeConfig(pluginTheme));
  }, defaultHomeThemeConfig);
  const override = parseHomeThemeConfig(configText);
  return mergeHomeThemeConfig(baseTheme, override);
}

export function getHomeThemeConfigError(configText: string): string | null {
  if (!configText.trim()) return null;

  try {
    const parsed = JSON.parse(configText) as unknown;
    if (!isPlainRecord(parsed)) return "Theme config must be a JSON object.";
    normalizeHomeThemeConfig(parsed);
    return null;
  } catch (error) {
    return error instanceof Error && error.message ? error.message : "Invalid JSON.";
  }
}

export function toHomeThemeStyle(style: HomeThemeStyle | undefined): CSSProperties | undefined {
  if (!style || Object.keys(style).length === 0) return undefined;
  return style as CSSProperties;
}

export function toHomeThemeRootStyle(theme: Pick<ResolvedHomeTheme, "colors" | "variables">): CSSProperties | undefined {
  return toHomeThemeStyle({
    ...resolveHomeThemeColorVariables(theme.colors),
    ...theme.variables
  });
}

function parseHomeThemeConfig(configText: string): HomeThemeConfig {
  if (!configText.trim()) return {};

  try {
    const parsed = JSON.parse(configText) as unknown;
    return normalizeHomeThemeConfig(parsed);
  } catch {
    return {};
  }
}

function normalizeHomeThemeConfig(value: unknown): HomeThemeConfig {
  const record = isPlainRecord(value) ? value : {};

  return {
    colors: normalizeHomeThemeColors(record.colors),
    sections: normalizeHomeThemeSections(record.sections),
    variables: normalizeHomeThemeStyle(record.variables)
  };
}

function normalizeHomeThemeSections(value: unknown): Partial<Record<HomeThemeSectionId, HomeThemeSectionConfig>> {
  const record = isPlainRecord(value) ? value : {};
  const sections: Partial<Record<HomeThemeSectionId, HomeThemeSectionConfig>> = {};

  for (const [sectionId, rawSection] of Object.entries(record)) {
    if (!homeThemeSectionIdSet.has(sectionId)) continue;
    sections[sectionId as HomeThemeSectionId] = normalizeHomeThemeSection(rawSection);
  }

  return sections;
}

function normalizeHomeThemeSection(value: unknown): HomeThemeSectionConfig {
  const record = isPlainRecord(value) ? value : {};

  return {
    className: getOptionalString(record.className),
    connectedIcon: normalizeHomeIconName(record.connectedIcon),
    descriptionClassName: getOptionalString(record.descriptionClassName),
    descriptionStyle: normalizeHomeThemeStyle(record.descriptionStyle),
    icon: normalizeHomeIconName(record.icon),
    iconClassName: getOptionalString(record.iconClassName),
    iconStyle: normalizeHomeThemeStyle(record.iconStyle),
    style: normalizeHomeThemeStyle(record.style),
    titleClassName: getOptionalString(record.titleClassName),
    titleStyle: normalizeHomeThemeStyle(record.titleStyle)
  };
}

function normalizeHomeThemeStyle(value: unknown): HomeThemeStyle | undefined {
  const record = isPlainRecord(value) ? value : {};
  const style: HomeThemeStyle = {};

  for (const [key, rawValue] of Object.entries(record)) {
    if (typeof rawValue !== "string" && typeof rawValue !== "number") continue;
    const normalizedKey = key.trim();
    if (!normalizedKey) continue;
    style[normalizedKey] = rawValue;
  }

  return Object.keys(style).length ? style : undefined;
}

function normalizeHomeThemeColors(value: unknown): HomeThemeStyle | undefined {
  const record = isPlainRecord(value) ? value : {};
  const colors: HomeThemeStyle = {};

  for (const [key, rawValue] of Object.entries(record)) {
    if (typeof rawValue !== "string" && typeof rawValue !== "number") continue;
    const normalizedKey = key.trim();
    if (!/^(--[A-Za-z0-9_-]+|[A-Za-z][A-Za-z0-9._-]{0,80})$/.test(normalizedKey)) continue;
    colors[normalizedKey] = rawValue;
  }

  return Object.keys(colors).length ? colors : undefined;
}

function resolveHomeThemeColorVariables(colors: HomeThemeStyle | undefined): HomeThemeStyle {
  if (!colors) return {};

  const variables: HomeThemeStyle = {};
  for (const [colorId, value] of Object.entries(colors)) {
    if (colorId.startsWith("--")) {
      variables[colorId] = value;
      continue;
    }

    const variableNames = homeThemeColorVariableMap[colorId as keyof typeof homeThemeColorVariableMap];
    if (!variableNames) continue;

    for (const variableName of variableNames) {
      variables[variableName] = value;
    }
  }

  return variables;
}

function mergeHomeThemeConfig(base: ResolvedHomeTheme, override: HomeThemeConfig): ResolvedHomeTheme {
  const sections: Record<HomeThemeSectionId, HomeThemeSectionConfig> = { ...base.sections };

  for (const sectionId of homeThemeSectionIds) {
    sections[sectionId] = mergeHomeThemeSection(base.sections[sectionId], override.sections?.[sectionId]);
  }

  return {
    colors: {
      ...base.colors,
      ...override.colors
    },
    sections,
    variables: {
      ...base.variables,
      ...override.variables
    }
  };
}

function mergeHomeThemeSection(base: HomeThemeSectionConfig, override: HomeThemeSectionConfig | undefined): HomeThemeSectionConfig {
  if (!override) return base;

  return {
    ...base,
    ...override,
    descriptionStyle: {
      ...base.descriptionStyle,
      ...override.descriptionStyle
    },
    iconStyle: {
      ...base.iconStyle,
      ...override.iconStyle
    },
    style: {
      ...base.style,
      ...override.style
    },
    titleStyle: {
      ...base.titleStyle,
      ...override.titleStyle
    }
  };
}

function normalizeHomeIconName(value: unknown): HomeIconName | undefined {
  if (typeof value !== "string") return undefined;
  const iconName = value.trim();
  if (!Object.prototype.hasOwnProperty.call(homeIconRegistry, iconName)) return undefined;
  return iconName as HomeIconName;
}

function getOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmedValue = value.trim();
  return trimmedValue || undefined;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
