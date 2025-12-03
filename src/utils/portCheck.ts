import net from 'net';

/**
 * Check if a port is available for use
 * @param port The port number to check
 * @returns Promise that resolves to true if port is available, false otherwise
 */
export async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    
    server.once('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false);
      } else {
        // Some other error occurred
        resolve(false);
      }
    });
    
    server.once('listening', () => {
      // Port is available, close the server
      server.close(() => {
        resolve(true);
      });
    });
    
    server.listen(port, '127.0.0.1');
  });
}

/**
 * Check if a port is in use by trying to connect to it
 * @param port The port number to check
 * @param host The host to check (defaults to 127.0.0.1)
 * @returns Promise that resolves to true if port is in use, false otherwise
 */
export async function isPortInUse(port: number, host: string = '127.0.0.1'): Promise<boolean> {
  try {
    const result = await isPortAvailable(port);
    return !result;
  } catch (error) {
    // If there's an error checking, assume it's in use
    return true;
  }
}