declare module '@musistudio/llms' {
  export default class Server {
    constructor(options: any);
    addHook(hook: string, handler: any): void;
    start(): void;
  }
}
