declare module '@musistudio/llms' {
  export class Server {
    constructor(options: any);
    // Add any methods you actually use from the Server class
  }
  
  // Export any other named exports if they exist
  export function createServer(options: any): Server;
}