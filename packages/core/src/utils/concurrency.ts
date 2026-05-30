type QueueEntry = {
  resolve: (release: () => void) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

class Semaphore {
  private active = 0;
  private readonly queue: QueueEntry[] = [];

  constructor(private readonly max: number) {}

  async acquire(timeoutMs: number): Promise<() => void> {
    if (this.max <= 0) {
      return () => {};
    }

    if (this.active < this.max) {
      this.active += 1;
      return this.createRelease();
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = this.queue.findIndex((entry) => entry.timer === timer);
        if (index >= 0) {
          this.queue.splice(index, 1);
        }
        reject(new Error(`Gateway concurrency queue timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      this.queue.push({
        resolve,
        reject,
        timer,
      });
    });
  }

  private release() {
    const next = this.queue.shift();
    if (next) {
      clearTimeout(next.timer);
      next.resolve(this.createRelease());
      return;
    }
    this.active = Math.max(0, this.active - 1);
  }

  private createRelease() {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.release();
    };
  }
}

const semaphores = new Map<string, Semaphore>();

function getSemaphore(key: string, max: number): Semaphore {
  const existing = semaphores.get(key);
  if (existing) {
    return existing;
  }
  const semaphore = new Semaphore(max);
  semaphores.set(key, semaphore);
  return semaphore;
}

export async function acquireConcurrencySlots(
  providerName: string,
  concurrencyConfig: any,
): Promise<() => void> {
  if (!concurrencyConfig) {
    return () => {};
  }

  const queueTimeoutMs = Number(concurrencyConfig.queueTimeoutMs || 120000);
  const releases: Array<() => void> = [];

  try {
    const globalLimit = Number(concurrencyConfig.global || 0);
    if (globalLimit > 0) {
      releases.push(await getSemaphore("global", globalLimit).acquire(queueTimeoutMs));
    }

    const providerLimit = Number(concurrencyConfig.providers?.[providerName] || 0);
    if (providerLimit > 0) {
      releases.push(
        await getSemaphore(`provider:${providerName}`, providerLimit).acquire(queueTimeoutMs),
      );
    }

    return () => {
      for (const release of releases.reverse()) {
        release();
      }
    };
  } catch (error) {
    for (const release of releases.reverse()) {
      release();
    }
    throw error;
  }
}

export function releaseWhenResponseCompletes(response: Response, release: () => void): Response {
  let released = false;
  const releaseOnce = () => {
    if (released) return;
    released = true;
    release();
  };

  if (!response.body) {
    releaseOnce();
    return response;
  }

  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const wrappedBody = new ReadableStream({
    start() {
      reader = response.body!.getReader();
    },
    async pull(controller) {
      if (!reader) return;
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          releaseOnce();
          try {
            reader.releaseLock();
          } catch {}
          reader = undefined;
          return;
        }
        controller.enqueue(value);
      } catch (error) {
        releaseOnce();
        controller.error(error);
      }
    },
    async cancel(reason) {
      releaseOnce();
      if (!reader) return;
      try {
        await reader.cancel(reason);
      } finally {
        try {
          reader.releaseLock();
        } catch {}
        reader = undefined;
      }
    },
  });

  return new Response(wrappedBody, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
