/**
 * WebSocket Push - 主动异常推送
 *
 * Pushes risk events and alerts to connected clients via WebSocket.
 * Supports: risk alerts, budget warnings, provider health changes.
 *
 * Design: Zero external dependencies. Uses Node.js ws module (optional).
 */

export interface WsPushConfig {
  enabled: boolean;
  port: number;
  path: string;
}

export class WsPush {
  private config: WsPushConfig;
  private logger?: any;
  private wss: any = null;
  private clients: Set<any> = new Set();

  constructor(config: Partial<WsPushConfig> = {}, logger?: any) {
    this.config = { enabled: false, port: 3457, path: '/ws', ...config };
    this.logger = logger;
  }

  async start(): Promise<boolean> {
    if (!this.config.enabled) return false;
    try {
      const { WebSocketServer } = require('ws');
      this.wss = new WebSocketServer({ port: this.config.port, path: this.config.path });
      this.wss.on('connection', (ws: any) => {
        this.clients.add(ws);
        ws.on('close', () => this.clients.delete(ws));
      });
      this.logger?.info(`WsPush: listening on port ${this.config.port}`);
      return true;
    } catch { return false; }
  }

  broadcast(event: string, data: any): void {
    const message = JSON.stringify({ event, data, timestamp: Date.now() });
    for (const client of this.clients) {
      try { client.send(message); } catch {}
    }
  }

  getStats(): { clients: number; enabled: boolean } {
    return { clients: this.clients.size, enabled: this.config.enabled };
  }

  async stop(): Promise<void> {
    if (this.wss) { this.wss.close(); this.wss = null; }
  }
}

let globalWs: WsPush | null = null;
export function getWsPush(config?: Partial<WsPushConfig>, logger?: any): WsPush {
  if (!globalWs) globalWs = new WsPush(config, logger);
  return globalWs;
}
