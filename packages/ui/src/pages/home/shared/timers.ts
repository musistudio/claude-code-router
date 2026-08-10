export type RestartableTimer = {
  cancel(): void;
  restart(): void;
};

export function createRestartableTimer(onExpire: () => void, delayMs: number): RestartableTimer {
  let handle: ReturnType<typeof setTimeout> | undefined;

  const cancel = () => {
    if (handle === undefined) {
      return;
    }
    clearTimeout(handle);
    handle = undefined;
  };

  return {
    cancel,
    restart() {
      cancel();
      handle = setTimeout(() => {
        handle = undefined;
        onExpire();
      }, delayMs);
    }
  };
}
