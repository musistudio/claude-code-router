declare module '@musistudio/llms' {
  export interface TransformerContext {
    [key: string]: any;
  }

  export interface Transformer {
    name?: string;
    endPoint?: string;
    transformRequestOut?(request: any): Promise<any>;
    transformRequestIn?(request: any): Promise<any>;
    transformResponseOut?(response: any, context?: TransformerContext): Promise<any>;
    transformResponseIn?(response: any, context?: TransformerContext): Promise<any>;
    auth?(request: any, provider: any): Promise<any>;
  }

  export class TransformerService {
    initialize(): Promise<void>;
    getTransformer(name: string): any;
    registerTransformer(name: string, transformer: any): void;
  }

  export const sessionUsageCache: Map<any, any>;
  export const pluginManager: any;
  export const tokenSpeedPlugin: any;
}
