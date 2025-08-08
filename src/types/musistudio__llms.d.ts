declare module '@musistudio/llms' {
  export default class Server {
    app: any;
    constructor(config: any);
    start(): void;
    addHook(name: string, handler: any): void;
  }
}