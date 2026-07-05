type PollingRefresh = () => Promise<unknown> | unknown;

type PollingOptions = {
  immediate?: boolean;
};

export function startVisiblePolling(refresh: PollingRefresh, intervalMs: number, options: PollingOptions = {}): () => void {
  let cancelled = false;
  let inFlight = false;
  let pending = false;

  const run = () => {
    if (cancelled || document.hidden) {
      pending = true;
      return;
    }
    if (inFlight) {
      pending = true;
      return;
    }

    pending = false;
    inFlight = true;
    void Promise.resolve(refresh())
      .catch(() => {
        // Callers own user-facing error state.
      })
      .finally(() => {
        inFlight = false;
        if (pending) {
          run();
        }
      });
  };

  const onVisibilityChange = () => {
    if (!document.hidden) {
      run();
    }
  };

  if (options.immediate !== false) {
    run();
  }
  const timer = window.setInterval(run, intervalMs);
  document.addEventListener("visibilitychange", onVisibilityChange);

  return () => {
    cancelled = true;
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };
}
