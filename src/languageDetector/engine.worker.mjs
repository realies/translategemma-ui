// Worker-thread entry: loads one language-ID engine and returns the top label for texts sent by
// the server. Unloading terminates this thread, which frees all of the engine's wasm memory.
// Plain JavaScript run by Node as is, outside the Vite bundle; the Docker image copies it.
// Messages: in { id, text }; out { type: "ready" } | { type: "label", id, label } |
// { type: "error", id, message }. The label is null when the engine returns none.
import { pathToFileURL } from "node:url";
import { parentPort, workerData } from "node:worker_threads";

/** CLD3 via defuss-lid's full pack: an ISO 639-1 label ("de", "zh", "hi-Latn"). */
async function loadLite() {
  const { load } = await import("defuss-lid/packs/full");
  const pack = await load();
  return (text) => pack.predict(text)[0]?.language ?? null;
}

/** GlotLID v4 via fastText: a label such as "deu_Latn". */
async function loadAccurate(modelPath) {
  const { getLIDModel } = await import("fasttext.wasm.js");
  const model = await getLIDModel({ modelPath: pathToFileURL(modelPath).href })
    .then((lid) => lid.load())
    .catch((err) => {
      // A corrupt file makes fastText throw a bare number (an emscripten exception pointer).
      const reason = err instanceof Error ? err.message : "the file may be corrupt";
      throw new Error(
        `Could not load the GlotLID model at ${modelPath} (${reason}). Run "npm run fetch:glotlid" to download it again.`
      );
    });
  return (text) => {
    const top = model.predict(text, 1, 0);
    try {
      return top.size() > 0 ? top.get(0)[1].replace("__label__", "") : null;
    } finally {
      top.delete(); // the vector lives in the wasm heap
    }
  };
}

const port = parentPort;
if (!port) throw new Error("engine.worker.mjs must run as a worker thread");

const { engine, modelPath } = workerData;
const identify = engine === "accurate" ? await loadAccurate(modelPath) : await loadLite();

port.on("message", ({ id, text }) => {
  try {
    port.postMessage({ type: "label", id, label: identify(text) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    port.postMessage({ type: "error", id, message });
    // A failed wasm call can leave the engine unusable: exit so the next request reloads it.
    process.exit(1);
  }
});
port.postMessage({ type: "ready" });
