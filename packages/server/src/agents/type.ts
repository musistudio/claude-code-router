export interface ITool {
  name: string;
  description: string;
  input_schema: any;

  handler: (args: any, context: any) => Promise<string>;
}

export interface IAgent {
  name: string;

  tools: Map<string, ITool>;

  shouldHandle: (req: any, config: any) => boolean;

  reqHandler: (req: any, config: any) => void;

  resHandler?: (payload: any, config: any) => void;
}
