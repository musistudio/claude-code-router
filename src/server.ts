import Server from '@musistudio/llms';

export const createServer = (config: any): Server => {
  const server = new Server(config);
  return server;
};
