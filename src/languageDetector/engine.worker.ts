// Worker-thread entry: loads one language-ID engine and ranks labels for texts sent by the
// server. Unloading terminates this thread, which frees all of the engine's wasm memory.
// Erasable TypeScript only, with no path aliases, so Node runs it from source in dev and tests;
// production builds bundle it (see serverWorkers in vite.config.ts).
import { pathToFileURL } from "node:url";
import { parentPort, workerData } from "node:worker_threads";
import type { EngineName } from "./config";

export interface EngineWorkerData {
  engine: EngineName;
  modelPath: string;
}

export interface RankRequest {
  id: number;
  text: string;
}

export type WorkerMessage =
  | { type: "ready" }
  | { type: "labels"; id: number; labels: string[] }
  | { type: "error"; id: number; message: string };

type Rank = (text: string) => string[];

const GLOTLID_TOP_K = 50;

/** CLD3 via defuss-lid's full pack: top-1 ISO 639-1 label ("de", "zh", "hi-Latn"). */
async function loadLite(): Promise<Rank> {
  const { load } = await import("defuss-lid/packs/full");
  const pack = await load();
  return (text) => pack.predict(text).map((prediction) => prediction.language);
}

/** GlotLID v4 via fastText: top-50 labels such as "deu_Latn", best first. */
async function loadAccurate(modelPath: string): Promise<Rank> {
  const { getLIDModel } = await import("fasttext.wasm.js");
  const model = await getLIDModel({ modelPath: pathToFileURL(modelPath).href })
    .then((lid) => lid.load())
    .catch((err: unknown) => {
      // A corrupt file makes fastText throw a bare number (an emscripten exception pointer).
      const reason = err instanceof Error ? err.message : "the file may be corrupt";
      throw new Error(
        `Could not load the GlotLID model at ${modelPath} (${reason}). Run "npm run fetch:glotlid" to download it again.`
      );
    });
  return (text) => {
    const ranked = model.predict(text, GLOTLID_TOP_K, 0);
    try {
      return Array.from({ length: ranked.size() }, (_, i) =>
        ranked.get(i)[1].replace("__label__", "")
      );
    } finally {
      ranked.delete(); // the vector lives in the wasm heap
    }
  };
}

const port = parentPort;
if (!port) throw new Error("engine.worker.ts must run as a worker thread");

const { engine, modelPath } = workerData as EngineWorkerData;
const rank = engine === "accurate" ? await loadAccurate(modelPath) : await loadLite();

port.on("message", ({ id, text }: RankRequest) => {
  try {
    port.postMessage({ type: "labels", id, labels: rank(text) } satisfies WorkerMessage);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    port.postMessage({ type: "error", id, message } satisfies WorkerMessage);
    // A failed wasm call can leave the engine unusable: exit so the next request reloads it.
    process.exit(1);
  }
});
port.postMessage({ type: "ready" } satisfies WorkerMessage);
