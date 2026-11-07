import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { parseDetectorConfig, type EngineName } from "./config";
import { createLifecycle } from "./lifecycle";
import { toAppCode } from "./mapping";
import { ENGINE_WORKER, startEngineWorker } from "./workerEngine";

/** Model for LANGUAGE_DETECTOR=accurate, relative to the working directory. */
export const GLOTLID_MODEL = "models/glotlid-v4.ftz";

export const NO_DETECTION_MESSAGE = "Couldn't detect the language. Choose the source language.";

const languageNames = new Intl.DisplayNames(["en"], { type: "language", fallback: "code" });

/** "Detected Afrikaans, ..." for a label such as "af" (CLD3) or "afr_Latn" (GlotLID). */
export const unsupportedMessage = (label: string) =>
  `Detected ${languageNames.of(label.replace("_", "-")) ?? label}, which isn't supported. Choose the source language.`;

/** Detection reads at most this many characters; the engines saturate long before. */
const MAX_DETECTION_CHARS = 2000;

const ENGINE_NAMES: Record<EngineName, string> = {
  lite: "lite (CLD3)",
  accurate: "accurate (GlotLID v4)",
};

function createDetector(env: Partial<Record<string, string>>) {
  const config = parseDetectorConfig(env);
  const modelPath = resolve(GLOTLID_MODEL);
  if (config.engine === "accurate" && !existsSync(modelPath)) {
    throw new Error(
      `GlotLID model not found at ${modelPath}. Run "npm run fetch:glotlid" to download it.`
    );
  }
  const workerPath = resolve(ENGINE_WORKER);
  if (!existsSync(workerPath)) {
    throw new Error(
      `Language detector worker not found at ${workerPath}. Start the server from the app directory.`
    );
  }
  const lifecycle = createLifecycle({
    name: ENGINE_NAMES[config.engine],
    keepAliveMs: config.keepAliveMs,
    load: (onExit) => startEngineWorker({ engine: config.engine, modelPath }, onExit),
  });
  return { config, lifecycle };
}

let detector: ReturnType<typeof createDetector> | undefined;

/**
 * Validates the LANGUAGE_DETECTOR* variables and the worker and model files and, with
 * LANGUAGE_DETECTOR_PRELOAD=true, loads the engine. Runs when the server starts; a throw stops
 * the server from starting.
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
  let label: string | null;
  try {
    // fastText reads a single line, so whitespace is collapsed for every engine.
    label = await lifecycle.identify(sample.replace(/\s+/g, " ").trim());
  } catch (err) {
    console.error(`Language detector ${ENGINE_NAMES[config.engine]} failed:`, err);
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Language detection failed: ${reason}`, { cause: err });
  }

  // ISO 639 "und" (undetermined) and "zxx" (no linguistic content) name no language.
  if (!label || ["und", "zxx"].includes(label.split(/[-_]/)[0] ?? "")) {
    throw new Error(NO_DETECTION_MESSAGE);
  }
  const code = toAppCode(config.engine, label, sample);
  if (!code) throw new Error(unsupportedMessage(label));
  return code;
}
