import { execSync } from "child_process";
import { createHash } from "crypto";
import os from "os";

/**
 * 跨平台获取系统UUID
 * @returns 系统UUID字符串
 */
export async function getSystemUUID(): Promise<string> {
  const platform = os.platform();
  
  try {
    let uuid: string;
    
    switch (platform) {
      case "win32": // Windows
        uuid = execSync("wmic csproduct get UUID", { encoding: "utf8" })
          .split("\n")[1]
          .trim();
        break;
        
      case "darwin": // macOS
        uuid = execSync(
          "system_profiler SPHardwareDataType | grep 'Hardware UUID'",
          { encoding: "utf8" }
        )
          .split(":")[1]
          .trim();
        break;
        
      case "linux": // Linux
        // 尝试使用 dmidecode (需要 root 权限)
        try {
          uuid = execSync("dmidecode -s system-uuid", { encoding: "utf8" }).trim();
        } catch (dmidecodeError) {
          // 如果 dmidecode 失败，尝试读取 sysfs (不需要 root 权限，但可能没有权限)
          try {
            uuid = execSync("cat /sys/class/dmi/id/product_uuid", { encoding: "utf8" }).trim();
          } catch (sysfsError) {
            throw new Error("无法在Linux系统上获取系统UUID，可能需要root权限");
          }
        }
        break;
        
      default:
        throw new Error(`不支持的操作系统: ${platform}`);
    }
    
    return uuid;
  } catch (error) {
    throw new Error(`获取系统UUID失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 基于系统UUID生成固定的临时API密钥
 * @param systemUUID 系统UUID
 * @returns 生成的API密钥
 */
export function generateTempAPIKey(systemUUID: string): string {
  // 使用SHA-256哈希算法确保一致性
  const hash = createHash("sha256");
  hash.update(systemUUID);
  // 添加盐值以增加安全性
  hash.update("claude-code-router-temp-key-salt");
  // 生成32字符的十六进制字符串
  return hash.digest("hex").substring(0, 32);
}

/**
 * 获取临时API密钥（完整的便利函数）
 * @returns 临时API密钥
 */
export async function getTempAPIKey(): Promise<string> {
  const uuid = await getSystemUUID();
  return generateTempAPIKey(uuid);
}