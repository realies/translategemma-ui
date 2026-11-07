import { resolve } from "node:path";
import { Worker } from "node:worker_threads";
import type { EngineName } from "./config";
import type { Engine } from "./lifecycle";

/** Worker entry, relative to the working directory like the GlotLID model (not bundled). */
export const ENGINE_WORKER = "src/languageDetector/engine.worker.mjs";

export interface EngineWorkerData {
  engine: EngineName;
  modelPath: string;
}

type WorkerMessage =
  | { type: "ready" }
  | { type: "label"; id: number; label: string | null }
  | { type: "error"; id: number; message: string };

interface Pending {
  resolve: (label: string | null) => void;
  reject: (err: Error) => void;
}

/**
 * Starts the engine in a worker thread and resolves once it is loaded. Closing terminates the
 * thread: dropping references alone does not return wasm memory to the OS.
 */
export function startEngineWorker(data: EngineWorkerData, onExit: () => void): Promise<Engine> {
  const worker = new Worker(resolve(ENGINE_WORKER), { workerData: data });
  worker.unref(); // an idle engine must not keep the process alive
  const pending = new Map<number, Pending>();
  let nextId = 0;
  let exited: Error | null = null;
  let closing = false;

  const engine: Engine = {
    identify: (text) =>
      new Promise((resolve, reject) => {
        if (exited) {
          reject(exited);
          return;
        }
        const id = nextId++;
        pending.set(id, { resolve, reject });
        worker.postMessage({ id, text });
      }),
    close: async () => {
      closing = true;
      await worker.terminate();
    },
  };

  return new Promise((resolve, reject) => {
    worker.on("message", (message: WorkerMessage) => {
      if (message.type === "ready") {
        resolve(engine);
        return;
      }
      const call = pending.get(message.id);
      pending.delete(message.id);
      if (message.type === "label") call?.resolve(message.label);
      else call?.reject(new Error(message.message));
    });
    // An error thrown while loading (e.g. an unreadable model file) arrives here.
    worker.on("error", reject);
    worker.on("exit", (code) => {
      exited = new Error(`Language detector worker exited with code ${String(code)}`);
      reject(exited); // no-op once loaded
      for (const call of pending.values()) call.reject(exited);
      pending.clear();
      if (!closing) onExit();
    });
  });
}
