export const DEFAULT_RETRY_AFTER_MS = 1000;

export function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const complete = () => {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      signal?.removeEventListener("abort", complete);
      resolve();
    };

    signal?.addEventListener("abort", complete, { once: true });
    timer = setTimeout(complete, ms);
  });
}
