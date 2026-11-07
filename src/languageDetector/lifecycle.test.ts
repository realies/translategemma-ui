import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createLifecycle, type Engine } from "./lifecycle";

/** A fake engine whose rank() resolves when the test says so. */
function fakeEngines() {
  const engines: { close: ReturnType<typeof vi.fn>; onExit: () => void }[] = [];
  const pendingRanks: (() => void)[] = [];
  let failNextLoad: Error | null = null;
  const load = vi.fn((onExit: () => void): Promise<Engine> => {
    if (failNextLoad) {
      const err = failNextLoad;
      failNextLoad = null;
      return Promise.reject(err);
    }
    const close = vi.fn(() => Promise.resolve());
    engines.push({ close, onExit });
    const rank = (text: string) =>
      new Promise<string[]>((resolve) => {
        pendingRanks.push(() => {
          resolve([text]);
        });
      });
    return Promise.resolve({ rank, close });
  });
  return {
    load,
    engines,
    finishRanks: () => {
      for (const finish of pendingRanks.splice(0)) finish();
    },
    finishOldestRank: () => pendingRanks.shift()?.(),
    failNextLoad: (err: Error) => {
      failNextLoad = err;
    },
  };
}

function setup(keepAliveMs: number) {
  const fake = fakeEngines();
  const log = vi.fn();
  const lifecycle = createLifecycle({ name: "test", keepAliveMs, load: fake.load, log });
  /** Runs one detection to completion. */
  const detect = async (text = "x") => {
    const result = lifecycle.rank(text);
    await settle();
    fake.finishRanks();
    return result;
  };
  return { ...fake, log, lifecycle, detect };
}

/** Runs queued promise callbacks (load, rank, close, logging) without moving the clock. */
async function settle() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

/** Moves the fake clock, then lets the callbacks it triggered finish. */
async function advance(ms: number) {
  await vi.advanceTimersByTimeAsync(ms);
  await settle();
}

describe("createLifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("loads lazily on the first request and logs the load time", async () => {
    const { load, log, detect } = setup(60_000);
    expect(load).not.toHaveBeenCalled();

    expect(await detect("Hallo")).toEqual(["Hallo"]);
    expect(load).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(
      expect.stringMatching(/^Language detector "test" loaded in \d+ ms$/)
    );
  });

  it("preloads, and then applies keep-alive from the end of the preload", async () => {
    const { load, engines, lifecycle, log } = setup(5000);
    await lifecycle.preload();
    expect(load).toHaveBeenCalledTimes(1);

    await advance(4999);
    expect(engines[0]?.close).not.toHaveBeenCalled();
    await advance(1);
    expect(engines[0]?.close).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenLastCalledWith('Language detector "test" unloaded');
  });

  it("shares one load between concurrent requests", async () => {
    const { load, lifecycle, finishRanks, engines } = setup(60_000);
    const results = Promise.all([lifecycle.rank("a"), lifecycle.rank("b"), lifecycle.rank("c")]);
    await settle();
    finishRanks();

    expect(await results).toEqual([["a"], ["b"], ["c"]]);
    expect(load).toHaveBeenCalledTimes(1);
    expect(engines).toHaveLength(1);
  });

  it("never unloads while a detection is in flight, and restarts the timer after the last one", async () => {
    const { lifecycle, engines, finishRanks, detect } = setup(5000);
    await detect();
    await advance(4000);

    const slow = lifecycle.rank("slow"); // in flight across the old deadline
    await advance(10_000);
    expect(engines[0]?.close).not.toHaveBeenCalled();

    finishRanks();
    await slow;
    await advance(4999);
    expect(engines[0]?.close).not.toHaveBeenCalled();
    await advance(1);
    expect(engines[0]?.close).toHaveBeenCalledTimes(1);
  });

  it("waits for every overlapping detection before starting the idle timer", async () => {
    const { lifecycle, engines, finishOldestRank } = setup(1000);
    const first = lifecycle.rank("a");
    await settle();
    const second = lifecycle.rank("b");
    await settle();
    finishOldestRank();
    await first;
    await advance(5000); // the second detection is still running
    expect(engines[0]?.close).not.toHaveBeenCalled();

    finishOldestRank();
    await second;
    await advance(999);
    expect(engines[0]?.close).not.toHaveBeenCalled();
    await advance(1);
    expect(engines[0]?.close).toHaveBeenCalledTimes(1);
  });

  it("unloads right after each request with keep-alive 0, and reloads for the next", async () => {
    const { load, engines, detect } = setup(0);
    await detect();
    await settle();
    expect(engines[0]?.close).toHaveBeenCalledTimes(1);

    await detect();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("never unloads with a negative keep-alive", async () => {
    const { engines, detect, load } = setup(-1);
    await detect();
    await advance(365 * 24 * 3_600_000);
    expect(engines[0]?.close).not.toHaveBeenCalled();
    await detect();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("reloads after an idle unload", async () => {
    const { load, detect } = setup(1000);
    await detect();
    await advance(1000);
    await detect();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("fails the request when the load fails, and tries again on the next request", async () => {
    const { load, lifecycle, failNextLoad, detect } = setup(60_000);
    failNextLoad(new Error("model missing"));
    await expect(lifecycle.rank("x")).rejects.toThrow("model missing");

    expect(await detect("y")).toEqual(["y"]);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("reloads on the next request when the engine stops on its own", async () => {
    const { load, engines, detect, log } = setup(-1);
    await detect();
    engines[0]?.onExit();
    expect(log).toHaveBeenLastCalledWith(
      'Language detector "test" stopped unexpectedly; the next request reloads it'
    );

    await detect();
    expect(load).toHaveBeenCalledTimes(2);
  });
});
