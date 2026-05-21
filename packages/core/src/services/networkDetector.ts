import { resolve4 } from 'dns/promises';

export type NetworkState = 'intranet' | 'external' | 'unknown';

export interface NetworkRouterState {
  Router?: Record<string, string>;
  fallback?: Record<string, string[]>;
}

export interface NetworkRouterConfig {
  enabled?: boolean;
  checkInterval?: number;
  hostname?: string;
  intranetPattern?: string;
  states?: {
    intranet?: NetworkRouterState;
    external?: NetworkRouterState;
  };
}

export class NetworkDetector {
  private currentState: NetworkState = 'unknown';
  private timer: NodeJS.Timer | null = null;
  private networkConfig: NetworkRouterConfig = {};
  private originalRouter: any;
  private originalFallback: any;

  constructor(
    private readonly configService: any,
    private readonly logger: any
  ) {}

  async start(): Promise<void> {
    this.networkConfig = this.configService.get('NetworkRouter');
    if (!this.networkConfig?.enabled) return;

    this.originalRouter = this.configService.get('Router');
    this.originalFallback = this.configService.get('fallback');

    this.logger.info(
      `NetworkRouter enabled, monitoring ${this.networkConfig.hostname || 'w3.huawei.com'} ` +
      `every ${this.networkConfig.checkInterval || 30}s`
    );

    await this.check();

    const interval = (this.networkConfig.checkInterval || 30) * 1000;
    this.timer = setInterval(async () => {
      try {
        await this.check();
      } catch (e: any) {
        this.logger.error(`Network detection error: ${e.message}`);
      }
    }, interval);

    if (this.timer && typeof this.timer === 'object' && 'unref' in this.timer) {
      (this.timer as any).unref();
    }
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer as any);
      this.timer = null;
    }
    if (this.originalRouter !== undefined) {
      this.configService.set('Router', this.originalRouter);
    }
    if (this.originalFallback !== undefined) {
      this.configService.set('fallback', this.originalFallback);
    }
  }

  getState(): NetworkState {
    return this.currentState;
  }

  private async check(): Promise<void> {
    const newState = await this.detect();
    if (newState !== this.currentState) {
      this.logger.info(`Network state changed: ${this.currentState} -> ${newState}`);
      this.currentState = newState;
      this.applyState(newState);
    }
  }

  private async detect(): Promise<NetworkState> {
    const hostname = this.networkConfig.hostname || 'w3.huawei.com';
    const pattern = new RegExp(this.networkConfig.intranetPattern || '^10\\.');
    try {
      const addresses = await resolve4(hostname);
      return addresses.some(addr => pattern.test(addr)) ? 'intranet' : 'external';
    } catch {
      return 'external';
    }
  }

  private applyState(state: NetworkState): void {
    const stateConfig = this.networkConfig.states?.[state];
    if (stateConfig?.Router) {
      this.configService.set('Router', stateConfig.Router);
      this.logger.info(`Applied ${state} Router: ${JSON.stringify(stateConfig.Router)}`);
    }
    if (stateConfig?.fallback) {
      this.configService.set('fallback', stateConfig.fallback);
    } else if (this.originalFallback !== undefined) {
      this.configService.set('fallback', this.originalFallback);
    }
  }
}
