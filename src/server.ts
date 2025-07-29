import Server from '@musistudio/llms';

export const createServer = (config: any): any => {
  const server = new Server(config);
  return server;
};
