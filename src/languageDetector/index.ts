import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { parseDetectorConfig, type EngineName } from "./config";
import { createLifecycle, type Engine } from "./lifecycle";
import { toAppCode } from "./mapping";
import { startEngineWorker } from "./workerEngine";

/** Model for LANGUAGE_DETECTOR=accurate, relative to the working directory. */
export const GLOTLID_MODEL = "models/glotlid-v4.ftz";

export const NO_DETECTION_MESSAGE = "Couldn't detect the language. Choose the source language.";

/** Detection reads at most this many characters; the engines saturate long before. */
const MAX_DETECTION_CHARS = 2000;

const ENGINE_NAMES: Record<EngineName, string> = {
  lite: "lite (CLD3)",
  accurate: "accurate (GlotLID v4)",
};

function loadEngine(engine: EngineName, onExit: () => void): Promise<Engine> {
  const modelPath = resolve(GLOTLID_MODEL);
  if (engine === "accurate" && !existsSync(modelPath)) {
    return Promise.reject(
      new Error(
        `GlotLID model not found at ${modelPath}. Run "npm run fetch:glotlid" to download it.`
      )
    );
  }
  return startEngineWorker({ engine, modelPath }, onExit);
}

function createDetector(env: Partial<Record<string, string>>) {
  const config = parseDetectorConfig(env);
  const lifecycle = createLifecycle({
    name: ENGINE_NAMES[config.engine],
    keepAliveMs: config.keepAliveMs,
    load: (onExit) => loadEngine(config.engine, onExit),
  });
  return { config, lifecycle };
}

let detector: ReturnType<typeof createDetector> | undefined;

/**
 * Validates the LANGUAGE_DETECTOR* variables and, with LANGUAGE_DETECTOR_PRELOAD=true, loads
 * the engine. Runs when the server starts; a throw stops the server from starting.
 */
export async function startLanguageDetector(env: Partial<Record<string, string>> = process.env) {
  detector = createDetector(env);
  if (!detector.config.preload) return;
  try {
    await detector.lifecycle.preload();
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Language detector ${ENGINE_NAMES[detector.config.engine]} failed to preload: ${reason}`,
      { cause: err }
    );
  }
}

/** The app language code of `text`; throws a user-facing message when there is none. */
export async function detectLanguage(text: string): Promise<string> {
  // Lone surrogates (e.g. half an emoji cut off by the slice) are not text, and CLD3 rejects them.
  const sample = text.slice(0, MAX_DETECTION_CHARS).replace(/\p{Cs}/gu, "");
  if (!/\p{L}/u.test(sample)) throw new Error(NO_DETECTION_MESSAGE);

  if (!detector) throw new Error("Language detector is not started (see src/server.ts)");
  const { config, lifecycle } = detector;
  let labels: string[];
  try {
    // fastText reads a single line, so whitespace is collapsed for every engine.
    labels = await lifecycle.rank(sample.replace(/\s+/g, " ").trim());
  } catch (err) {
    console.error(`Language detector ${ENGINE_NAMES[config.engine]} failed:`, err);
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Language detection failed: ${reason}`, { cause: err });
  }

  const code = toAppCode(config.engine, labels, sample);
  if (!code) throw new Error(NO_DETECTION_MESSAGE);
  return code;
}
