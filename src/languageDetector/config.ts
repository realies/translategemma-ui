export type EngineName = "lite" | "accurate";

export interface DetectorConfig {
  engine: EngineName;
  /** Load the engine when the server starts instead of on the first auto-detect request. */
  preload: boolean;
  /** Ollama keep_alive semantics: < 0 keeps the engine loaded, 0 unloads after each request. */
  keepAliveMs: number;
}

const DEFAULT_KEEP_ALIVE_MS = 5 * 60_000; // Ollama's default
const MAX_TIMER_MS = 2 ** 31 - 1; // setTimeout limit, about 24.8 days

const UNIT_MS = { "": 1000, s: 1000, m: 60_000, h: 3_600_000 }; // no unit: seconds
const KEEP_ALIVE = /^([-+]?\d+)([smh]?)$/;

function parseEngine(value = ""): EngineName {
  if (value === "") return "lite";
  if (value === "lite" || value === "accurate") return value;
  throw new Error(`Invalid LANGUAGE_DETECTOR "${value}": use "lite" or "accurate".`);
}

function parsePreload(value = ""): boolean {
  if (value === "" || value === "false") return false;
  if (value === "true") return true;
  throw new Error(`Invalid LANGUAGE_DETECTOR_PRELOAD "${value}": use "true" or "false".`);
}

/** Like OLLAMA_KEEP_ALIVE: whole seconds, minutes or hours ("30s", "5m", "1h"), or plain seconds. */
function parseKeepAlive(value = ""): number {
  if (value === "") return DEFAULT_KEEP_ALIVE_MS;
  const match = KEEP_ALIVE.exec(value);
  if (!match) {
    throw new Error(
      `Invalid LANGUAGE_DETECTOR_KEEP_ALIVE "${value}": use a whole number with s, m or h (30s, 5m, 1h), or plain seconds. A negative value keeps the detector loaded; 0 unloads it after each request.`
    );
  }
  const [, amount = "", unit = ""] = match;
  const ms = Number(amount) * UNIT_MS[unit as keyof typeof UNIT_MS];
  if (ms > MAX_TIMER_MS) {
    throw new Error(
      `Invalid LANGUAGE_DETECTOR_KEEP_ALIVE "${value}": the longest idle time is 24 days. Use a negative value to keep the detector loaded.`
    );
  }
  return ms;
}

/** Reads and validates the LANGUAGE_DETECTOR* variables; throws a message naming the bad one. */
export function parseDetectorConfig(env: Partial<Record<string, string>>): DetectorConfig {
  const config = {
    engine: parseEngine(env["LANGUAGE_DETECTOR"]),
    preload: parsePreload(env["LANGUAGE_DETECTOR_PRELOAD"]),
    keepAliveMs: parseKeepAlive(env["LANGUAGE_DETECTOR_KEEP_ALIVE"]),
  };
  if (config.preload && config.keepAliveMs === 0) {
    throw new Error(
      "LANGUAGE_DETECTOR_PRELOAD=true conflicts with LANGUAGE_DETECTOR_KEEP_ALIVE=0: the detector would unload right after loading. Remove one of them."
    );
  }
  return config;
}
