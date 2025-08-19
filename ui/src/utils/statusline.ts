import type { StatusLineConfig, StatusLineModuleConfig } from "@/types";

// 验证结果（保留接口但不使用）
export interface ValidationResult {
  isValid: boolean;
  errors: any[];
}

/**
 * 验证StatusLine配置 - 已移除所有验证
 * @param config 要验证的配置对象
 * @returns 始终返回验证通过
 */
export function validateStatusLineConfig(config: unknown): ValidationResult {
  // 不再执行任何验证
  return { isValid: true, errors: [] };
}


/**
 * 格式化错误信息（支持国际化）- 不再使用
 */
export function formatValidationError(error: unknown, t: (key: string, options?: Record<string, unknown>) => string): string {
  return t("statusline.validation.unknown_error");
}

/**
 * 解析颜色值，支持十六进制和内置颜色名称
 * @param color 颜色值（可以是颜色名称或十六进制值）
 * @param defaultColor 默认颜色（十六进制）
 * @returns 十六进制颜色值
 */
export function parseColorValue(color: string | undefined, defaultColor: string = "#ffffff"): string {
  if (!color) {
    return defaultColor;
  }
  
  // 如果是十六进制颜色值（以#开头）
  if (color.startsWith('#')) {
    return color;
  }
  
  // 如果是已知的颜色名称，返回对应的十六进制值
  return COLOR_HEX_MAP[color] || defaultColor;
}

/**
 * 判断是否为有效的十六进制颜色值
 * @param color 要检查的颜色值
 * @returns 是否为有效的十六进制颜色值
 */
export function isHexColor(color: string): boolean {
  return /^#([0-9A-F]{3}){1,2}$/i.test(color);
}

// 颜色枚举到十六进制的映射
export const COLOR_HEX_MAP: Record<string, string> = {
  black: "#000000",
  red: "#cd0000",
  green: "#00cd00",
  yellow: "#cdcd00",
  blue: "#0000ee",
  magenta: "#cd00cd",
  cyan: "#00cdcd",
  white: "#e5e5e5",
  bright_black: "#7f7f7f",
  bright_red: "#ff0000",
  bright_green: "#00ff00",
  bright_yellow: "#ffff00",
  bright_blue: "#5c5cff",
  bright_magenta: "#ff00ff",
  bright_cyan: "#00ffff",
  bright_white: "#ffffff",
  bg_black: "#000000",
  bg_red: "#cd0000",
  bg_green: "#00cd00",
  bg_yellow: "#cdcd00",
  bg_blue: "#0000ee",
  bg_magenta: "#cd00cd",
  bg_cyan: "#00cdcd",
  bg_white: "#e5e5e5",
  bg_bright_black: "#7f7f7f",
  bg_bright_red: "#ff0000",
  bg_bright_green: "#00ff00",
  bg_bright_yellow: "#ffff00",
  bg_bright_blue: "#5c5cff",
  bg_bright_magenta: "#ff00ff",
  bg_bright_cyan: "#00ffff",
  bg_bright_white: "#ffffff"
};

/**
 * 创建默认的StatusLine配置
 */
export function createDefaultStatusLineConfig(): StatusLineConfig {
  return {
    enabled: false,
    currentStyle: "default",
    default: { 
      modules: [
        { type: "workDir", icon: "󰉋", text: "{{workDirName}}", color: "bright_blue" },
        { type: "gitBranch", icon: "", text: "{{gitBranch}}", color: "bright_magenta" },
        { type: "model", icon: "󰚩", text: "{{model}}", color: "bright_cyan" },
        { type: "usage", icon: "↑", text: "{{inputTokens}}", color: "bright_green" },
        { type: "usage", icon: "↓", text: "{{outputTokens}}", color: "bright_yellow" }
      ] 
    },
    powerline: { 
      modules: [
        { type: "workDir", icon: "󰉋", text: "{{workDirName}}", color: "white", background: "bg_bright_blue" },
        { type: "gitBranch", icon: "", text: "{{gitBranch}}", color: "white", background: "bg_bright_magenta" },
        { type: "model", icon: "󰚩", text: "{{model}}", color: "white", background: "bg_bright_cyan" },
        { type: "usage", icon: "↑", text: "{{inputTokens}}", color: "white", background: "bg_bright_green" },
        { type: "usage", icon: "↓", text: "{{outputTokens}}", color: "white", background: "bg_bright_yellow" }
      ] 
    }
  };
}

/**
 * 创建配置备份
 */
export function backupConfig(config: StatusLineConfig): string {
  const backup = {
    config,
    timestamp: new Date().toISOString(),
    version: "1.0"
  };
  return JSON.stringify(backup, null, 2);
}

/**
 * 从备份恢复配置
 */
export function restoreConfig(backupStr: string): StatusLineConfig | null {
  try {
    const backup = JSON.parse(backupStr);
    if (backup && backup.config && backup.timestamp) {
      return backup.config as StatusLineConfig;
    }
    return null;
  } catch (error) {
    console.error("Failed to restore config from backup:", error);
    return null;
  }
}
