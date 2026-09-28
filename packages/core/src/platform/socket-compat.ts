import { Socket } from "node:net";

const socketTypeOfServiceCompatState = Symbol.for("ccr.socketTypeOfServiceCompatState");

type SocketSetTypeOfService = (this: Socket, typeOfService: number) => Socket;

type SocketTypeOfServiceCompatState = {
  original: SocketSetTypeOfService;
};

type SocketPrototypeWithCompatState = Socket & {
  [socketTypeOfServiceCompatState]?: SocketTypeOfServiceCompatState;
  setTypeOfService?: SocketSetTypeOfService;
};

export function installSocketTypeOfServiceCompat(): void {
  const prototype = Socket.prototype as SocketPrototypeWithCompatState;
  if (prototype[socketTypeOfServiceCompatState] || typeof prototype.setTypeOfService !== "function") {
    return;
  }

  const original = prototype.setTypeOfService;
  Object.defineProperty(prototype, socketTypeOfServiceCompatState, {
    configurable: true,
    value: { original }
  });
  prototype.setTypeOfService = function setTypeOfServiceCompat(this: Socket, typeOfService: number) {
    try {
      return original.call(this, typeOfService);
    } catch (error) {
      if (isIgnorableSocketTypeOfServiceError(error)) {
        return this;
      }
      throw error;
    }
  };
}

export function isIgnorableSocketTypeOfServiceError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const code = typeof (error as NodeJS.ErrnoException).code === "string"
    ? (error as NodeJS.ErrnoException).code
    : "";
  return code === "EINVAL" && /\bsetTypeOfService\b/.test(error.message);
}
