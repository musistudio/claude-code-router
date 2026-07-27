type PollingRefresh = () => Promise<unknown> | unknown;

type PollingOptions = {
  immediate?: boolean;
};

function isPlainSnapshotObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function pollingSnapshotsEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => pollingSnapshotsEqual(value, right[index]))
    );
  }
  if (!isPlainSnapshotObject(left) || !isPlainSnapshotObject(right)) {
    return false;
  }
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key) =>
      Object.prototype.hasOwnProperty.call(right, key) &&
      pollingSnapshotsEqual(left[key], right[key])
    )
  );
}

export function preserveEqualPollingSnapshot<T>(current: T, next: T): T {
  return pollingSnapshotsEqual(current, next) ? current : next;
}

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
