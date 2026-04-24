/**
 * 工业级请求追踪与防重入工具
 * 用于解决超大上下文场景下，客户端重试导致的重复生成和内容回滚问题
 */
export class RequestTracker {
  // Key: sessionId, Value: AbortController
  private static activeSessions = new Map<string, AbortController>();

  /**
   * 注册并追踪一个新请求
   * 如果发现同会话已有活跃请求，将自动中止旧请求，确保最新请求独占资源
   */
  static track(sessionId: string): AbortController {
    // 1. 检查并清理旧请求
    const existing = this.activeSessions.get(sessionId);
    if (existing) {
      console.log(`[RequestTracker] Detected duplicate session ${sessionId}. Aborting previous request to prevent looping.`);
      existing.abort("DUPLICATE_REQUEST");
      this.activeSessions.delete(sessionId);
    }

    // 2. 创建新控制器
    const controller = new AbortController();
    this.activeSessions.set(sessionId, controller);
    return controller;
  }

  /**
   * 释放请求追踪
   */
  static release(sessionId: string) {
    this.activeSessions.delete(sessionId);
  }
}
