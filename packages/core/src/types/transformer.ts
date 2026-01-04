import { LLMProvider, UnifiedChatRequest } from "./llm";

export interface TransformerOptions {
  [key: string]: any;
}

interface TransformerWithStaticName {
  new (options?: TransformerOptions): Transformer;
  TransformerName?: string;
}


interface TransformerWithInstanceName {
  new (): Transformer;
  name?: never;
}

export type TransformerConstructor = TransformerWithStaticName;

export interface TransformerContext {
  [key: string]: any;
}

export type Transformer = {
  transformRequestIn?: (
    request: UnifiedChatRequest,
    provider: LLMProvider,
    context: TransformerContext,
  ) => Promise<Record<string, any>>;
  transformResponseIn?: (response: Response, context?: TransformerContext) => Promise<Response>;

  // 将请求格式转换为通用的格式
  transformRequestOut?: (request: any, context: TransformerContext) => Promise<UnifiedChatRequest>;
  // 将相应格式转换为通用的格式
  transformResponseOut?: (response: Response, context: TransformerContext) => Promise<Response>;

  endPoint?: string;
  name?: string;
  auth?: (request: any, provider: LLMProvider, context: TransformerContext) => Promise<any>;
  
  // Logger for transformer
  logger?: any;
};
