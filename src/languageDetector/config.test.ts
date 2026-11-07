import { describe, it, expect } from "vitest";
import { parseDetectorConfig } from "./config";

const keepAlive = (value: string) =>
  parseDetectorConfig({ LANGUAGE_DETECTOR_KEEP_ALIVE: value }).keepAliveMs;

describe("parseDetectorConfig", () => {
  it("defaults to lite, lazy loading and Ollama's 5 minute keep-alive", () => {
    expect(parseDetectorConfig({})).toEqual({
      engine: "lite",
      preload: false,
      keepAliveMs: 300_000,
    });
    expect(
      parseDetectorConfig({
        LANGUAGE_DETECTOR: "",
        LANGUAGE_DETECTOR_PRELOAD: "",
        LANGUAGE_DETECTOR_KEEP_ALIVE: "",
      })
    ).toEqual({ engine: "lite", preload: false, keepAliveMs: 300_000 });
  });

  it("reads the engine and preload flag", () => {
    expect(
      parseDetectorConfig({ LANGUAGE_DETECTOR: "accurate", LANGUAGE_DETECTOR_PRELOAD: "true" })
    ).toMatchObject({ engine: "accurate", preload: true });
    expect(parseDetectorConfig({ LANGUAGE_DETECTOR_PRELOAD: "false" }).preload).toBe(false);
  });

  it("parses keep-alive like OLLAMA_KEEP_ALIVE", () => {
    expect(keepAlive("30s")).toBe(30_000);
    expect(keepAlive("5m")).toBe(300_000);
    expect(keepAlive("1h")).toBe(3_600_000);
    expect(keepAlive("90")).toBe(90_000); // plain seconds
    expect(keepAlive("0")).toBe(0);
    expect(keepAlive("0s")).toBe(0);
    expect(keepAlive("-1")).toBe(-1000);
    expect(keepAlive("-1m")).toBe(-60_000);
  });

  it("rejects invalid values, naming the variable", () => {
    expect(() => parseDetectorConfig({ LANGUAGE_DETECTOR: "turbo" })).toThrow(
      'Invalid LANGUAGE_DETECTOR "turbo": use "lite" or "accurate".'
    );
    expect(() => parseDetectorConfig({ LANGUAGE_DETECTOR: "Lite" })).toThrow("LANGUAGE_DETECTOR");
    expect(() => parseDetectorConfig({ LANGUAGE_DETECTOR_PRELOAD: "yes" })).toThrow(
      'Invalid LANGUAGE_DETECTOR_PRELOAD "yes": use "true" or "false".'
    );
    for (const value of ["5 minutes", "abc", "1d", "5m30", "m", "--1s", "1.5s", "1h30m", "250ms"]) {
      expect(() => keepAlive(value), value).toThrow(
        `Invalid LANGUAGE_DETECTOR_KEEP_ALIVE "${value}"`
      );
    }
  });

  it("rejects idle times beyond the timer limit instead of overflowing", () => {
    expect(keepAlive("596h")).toBe(596 * 3_600_000);
    expect(() => keepAlive("597h")).toThrow("the longest idle time is 24 days");
  });

  it("rejects preloading a detector that would unload right away", () => {
    expect(() =>
      parseDetectorConfig({ LANGUAGE_DETECTOR_PRELOAD: "true", LANGUAGE_DETECTOR_KEEP_ALIVE: "0" })
    ).toThrow("LANGUAGE_DETECTOR_PRELOAD=true conflicts with LANGUAGE_DETECTOR_KEEP_ALIVE=0");
  });
});
