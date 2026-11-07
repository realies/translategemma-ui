/** A loaded language-ID engine: ranks labels for a text, and frees its memory on close. */
export interface Engine {
  rank(text: string): Promise<string[]>;
  close(): Promise<void>;
}

interface LifecycleOptions {
  name: string;
  /** Ollama keep_alive semantics: < 0 keeps the engine loaded, 0 unloads after each request. */
  keepAliveMs: number;
  /** Loads the engine; `onExit` is called if it stops on its own. */
  load: (onExit: () => void) => Promise<Engine>;
  log?: (message: string) => void;
}

/**
 * Loads the engine on first use (or on preload), shares one load between concurrent requests,
 * and unloads it once it has been idle for `keepAliveMs`. The idle timer only runs while no
 * request is using the engine.
 */
export function createLifecycle({ name, keepAliveMs, load, log = console.info }: LifecycleOptions) {
  let engine: Promise<Engine> | null = null;
  let inFlight = 0;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;

  function acquire(): Promise<Engine> {
    if (engine) return engine;
    const started = performance.now();
    const loading: Promise<Engine> = load(() => {
      if (engine !== loading) return;
      engine = null;
      log(`Language detector "${name}" stopped unexpectedly; the next request reloads it`);
    }).then(
      (loaded) => {
        log(
          `Language detector "${name}" loaded in ${String(Math.round(performance.now() - started))} ms`
        );
        return loaded;
      },
      (err: unknown) => {
        if (engine === loading) engine = null; // the next request tries again
        throw err;
      }
    );
    engine = loading;
    return loading;
  }

  function unload() {
    const current = engine;
    engine = null;
    current
      ?.then((loaded) => loaded.close())
      .then(() => {
        log(`Language detector "${name}" unloaded`);
      })
      .catch((err: unknown) => {
        console.error(`Language detector "${name}" failed to unload:`, err);
      });
  }

  function hold() {
    clearTimeout(idleTimer);
    inFlight++;
  }

  function release() {
    inFlight--;
    if (inFlight > 0 || !engine || keepAliveMs < 0) return;
    if (keepAliveMs === 0) {
      unload();
      return;
    }
    idleTimer = setTimeout(unload, keepAliveMs);
    idleTimer.unref();
  }

  return {
    /** Loads the engine now; keep-alive applies from here, as for a request. */
    async preload(): Promise<void> {
      hold();
      try {
        await acquire();
      } finally {
        release();
      }
    },
    async rank(text: string): Promise<string[]> {
      hold();
      try {
        return await (await acquire()).rank(text);
      } finally {
        release();
      }
    },
  };
}
