declare module '@musistudio/llms' {
  export class Transformer {
    constructor(options?: any);
    req(req: any): any;
    res(res: any): any;
  }
}