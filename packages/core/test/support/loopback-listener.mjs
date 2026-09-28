import { connect } from "node:net";

export async function waitForTcpListener(server, timeoutMs = 1000) {
  const address = server.address();
  if (!address || typeof address !== "object") {
    throw new Error("TCP listener does not have a bound address");
  }

  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      await new Promise((resolve, reject) => {
        const socket = connect(address.port, "127.0.0.1");
        const timer = setTimeout(() => {
          socket.destroy();
          reject(new Error(`Timed out connecting to TCP listener on port ${address.port}`));
        }, Math.max(1, deadline - Date.now()));
        socket.once("connect", () => {
          clearTimeout(timer);
          socket.end();
          resolve();
        });
        socket.once("error", (error) => {
          clearTimeout(timer);
          socket.destroy();
          reject(error);
        });
      });
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw lastError ?? new Error(`Timed out waiting for TCP listener on port ${address.port}`);
}
