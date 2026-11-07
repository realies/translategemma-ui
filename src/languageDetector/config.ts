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

// Go time.ParseDuration units, as accepted by OLLAMA_KEEP_ALIVE.
const UNIT_MS: Record<string, number> = {
  ns: 1e-6,
  us: 1e-3,
  µs: 1e-3,
  ms: 1,
  s: 1000,
  m: 60_000,
  h: 3_600_000,
};
// The number has exactly one way to match ("1.5", "1.", ".5"), so repeated parts can't backtrack.
const DURATION_PART = /(\d+(?:\.\d*)?|\.\d+)(ns|us|µs|ms|s|m|h)/g;
const DURATION = /^[-+]?(?:(?:\d+(?:\.\d*)?|\.\d+)(?:ns|us|µs|ms|s|m|h))+$/;

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

/** Like OLLAMA_KEEP_ALIVE: a duration ("30s", "5m", "1h30m") or plain seconds ("300", "-1"). */
function parseKeepAlive(value = ""): number {
  if (value === "") return DEFAULT_KEEP_ALIVE_MS;
  let ms: number;
  if (/^[-+]?\d+$/.test(value)) {
    ms = Number(value) * 1000;
  } else if (DURATION.test(value)) {
    const sign = value.startsWith("-") ? -1 : 1;
    const parts = [...value.matchAll(DURATION_PART)];
    ms = sign * parts.reduce((sum, [, n, unit]) => sum + Number(n) * (UNIT_MS[unit ?? ""] ?? 0), 0);
  } else {
    throw new Error(
      `Invalid LANGUAGE_DETECTOR_KEEP_ALIVE "${value}": use a duration such as 30s, 5m or 1h, or plain seconds. A negative value keeps the detector loaded; 0 unloads it after each request.`
    );
  }
  if (ms > MAX_TIMER_MS) {
    throw new Error(
      `Invalid LANGUAGE_DETECTOR_KEEP_ALIVE "${value}": the longest idle time is 24 days. Use a negative value to keep the detector loaded.`
    );
  }
  return ms;
}

/** Reads and validates the LANGUAGE_DETECTOR* variables; throws a message naming the bad one. */
export function parseDetectorConfig(env: Partial<Record<string, string>>): DetectorConfig {
  return {
    engine: parseEngine(env["LANGUAGE_DETECTOR"]),
    preload: parsePreload(env["LANGUAGE_DETECTOR_PRELOAD"]),
    keepAliveMs: parseKeepAlive(env["LANGUAGE_DETECTOR_KEEP_ALIVE"]),
  };
}
