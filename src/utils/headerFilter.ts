import { IncomingHttpHeaders } from 'http';

/**
 * 提取需要转发的客户端 headers
 * 用于从客户端请求中筛选可以转发给下游服务的 headers
 */

// 默认允许转发的 headers（白名单）
const DEFAULT_FORWARD_HEADERS = [
  'x-request-id',
  'x-trace-id',
  'x-correlation-id',
  'user-agent',
  'x-forwarded-for',
  'x-real-ip',
  'accept-language',
];

/**
 * 从客户端请求 headers 中提取允许转发的 headers
 * @param headers - 客户端请求的原始 headers
 * @returns 过滤后的 headers 对象
 */
export function extractForwardHeaders(
  headers: IncomingHttpHeaders
): Record<string, string> {
  const forwarded: Record<string, string> = {};
  
  // 从环境变量读取白名单（如果有配置）
  const allowList = process.env.FORWARD_HEADERS
    ? process.env.FORWARD_HEADERS.split(',').map(h => h.trim().toLowerCase())
    : DEFAULT_FORWARD_HEADERS;

  allowList.forEach((name) => {
    const value = headers[name.toLowerCase()];
    if (value && typeof value === 'string') {
      forwarded[name] = value;
    } else if (Array.isArray(value) && value.length > 0) {
      forwarded[name] = value[0];
    }
  });

  return forwarded;
}
