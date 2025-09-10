declare module '@musistudio/llms' {
  import { FastifyInstance } from 'fastify';
  
  class Server {
    app: FastifyInstance;
    constructor(config: any);
  }
  
  export default Server;
}