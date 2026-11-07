// @vitest-environment node
// Real engines in a real worker thread (Node runs engine.worker.ts from source).
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { describe, it, expect, vi, afterEach } from "vitest";
import type * as Detector from "./index";
import { startEngineWorker } from "./workerEngine";

const GERMAN = "Das ist ein kurzer deutscher Satz über das Wetter.";

/** A fresh detector module, started with the given settings. */
async function start(env: Partial<Record<string, string>>): Promise<typeof Detector> {
  vi.resetModules();
  const detector = await import("./index");
  await detector.startLanguageDetector(env);
  return detector;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.doUnmock("./workerEngine");
});

describe("detectLanguage", () => {
  it("refuses to run before the detector is started", async () => {
    vi.resetModules();
    const { detectLanguage } = await import("./index");
    await expect(detectLanguage(GERMAN)).rejects.toThrow("Language detector is not started");
  });

  it("fails with the no-detection message for text without letters, without loading an engine", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { detectLanguage, NO_DETECTION_MESSAGE } = await start({});
    await expect(detectLanguage("12345 !!! 🙂")).rejects.toThrow(NO_DETECTION_MESSAGE);
    expect(console.info).not.toHaveBeenCalled();
  });

  it("sends the engine at most 2000 characters, on one line", async () => {
    const rank = vi.fn((_text: string) => Promise.resolve(["de"]));
    vi.doMock("./workerEngine", () => ({
      startEngineWorker: () => Promise.resolve({ rank, close: () => Promise.resolve() }),
    }));
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { detectLanguage } = await start({});

    expect(await detectLanguage(" Hallo\n\tWelt  ")).toBe("de_DE");
    expect(rank).toHaveBeenLastCalledWith("Hallo Welt");
    await detectLanguage("Hallo Welt ".repeat(1000));
    expect(rank.mock.lastCall?.[0]).toHaveLength(2000);
  });

  it("detects with the real lite engine (CLD3)", { timeout: 30_000 }, async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { detectLanguage } = await start({ LANGUAGE_DETECTOR: "lite" });

    expect(await detectLanguage(GERMAN)).toBe("de_DE");
    expect(await detectLanguage("這是繁體中文的句子")).toBe("zh_TW");
    expect(await detectLanguage("这是简体中文的句子")).toBe("zh_CN");
    expect(await detectLanguage("שלום לכולם, מה שלומכם היום?")).toBe("he_IL");
    expect(await detectLanguage("Kumusta ka na? Mabuti naman ako.")).toBe("fil_PH");
    expect(await detectLanguage("Bonjour tout le monde")).toBe("fr_FR");
    expect(console.info).toHaveBeenCalledWith(
      expect.stringMatching(/^Language detector "lite \(CLD3\)" loaded in \d+ ms$/)
    );
  });

  it("fails when the only label is not an app language", { timeout: 30_000 }, async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { detectLanguage, NO_DETECTION_MESSAGE } = await start({ LANGUAGE_DETECTOR: "lite" });
    // CLD3 labels romanised Russian "bg-Latn", which the app does not prompt with.
    await expect(detectLanguage("privet kak dela")).rejects.toThrow(NO_DETECTION_MESSAGE);
  });

  it("terminates the worker to unload (keep-alive 0)", { timeout: 30_000 }, async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { detectLanguage } = await start({
      LANGUAGE_DETECTOR: "lite",
      LANGUAGE_DETECTOR_KEEP_ALIVE: "0",
    });
    expect(await detectLanguage(GERMAN)).toBe("de_DE");
    await vi.waitFor(() => {
      expect(info).toHaveBeenLastCalledWith('Language detector "lite (CLD3)" unloaded');
    });
  });

  it("preloads at start", { timeout: 30_000 }, async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    await start({ LANGUAGE_DETECTOR: "lite", LANGUAGE_DETECTOR_PRELOAD: "true" });
    expect(info).toHaveBeenCalledWith(expect.stringMatching(/"lite \(CLD3\)" loaded in/));
  });

  it("refuses to start with an invalid setting", async () => {
    await expect(start({ LANGUAGE_DETECTOR_KEEP_ALIVE: "soon" })).rejects.toThrow(
      'Invalid LANGUAGE_DETECTOR_KEEP_ALIVE "soon"'
    );
  });

  describe("without the GlotLID model", () => {
    const noModel = () =>
      vi.spyOn(process, "cwd").mockReturnValue(mkdtempSync(`${tmpdir()}/tgui-`));

    it("refuses to start when preloading, saying how to fetch it", async () => {
      noModel();
      await expect(
        start({ LANGUAGE_DETECTOR: "accurate", LANGUAGE_DETECTOR_PRELOAD: "true" })
      ).rejects.toThrow(
        'Language detector accurate (GlotLID v4) failed to preload: GlotLID model not found at models/glotlid-v4.ftz. Run "npm run fetch:glotlid" to download it.'
      );
    });

    it("fails each lazy request with that error, retrying the load every time", async () => {
      noModel();
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const { detectLanguage } = await start({ LANGUAGE_DETECTOR: "accurate" });
      for (let i = 0; i < 2; i++) {
        await expect(detectLanguage(GERMAN)).rejects.toThrow(
          'Language detection failed: GlotLID model not found at models/glotlid-v4.ftz. Run "npm run fetch:glotlid" to download it.'
        );
      }
      expect(console.error).toHaveBeenCalledTimes(2);
    });
  });

  // CI does not download the 101 MB model, so this block is skipped there. Locally it runs
  // after `npm run fetch:glotlid`.
  describe.skipIf(!existsSync("models/glotlid-v4.ftz"))("with the real GlotLID model", () => {
    it("detects with the accurate engine", { timeout: 60_000 }, async () => {
      vi.spyOn(console, "info").mockImplementation(() => undefined);
      const { detectLanguage } = await start({ LANGUAGE_DETECTOR: "accurate" });

      expect(await detectLanguage(GERMAN)).toBe("de_DE");
      expect(await detectLanguage("切換語言")).toBe("zh_TW"); // GlotLID says yue_Hani
      expect(await detectLanguage("这是简体中文")).toBe("zh_CN");
      expect(await detectLanguage("Habari ya asubuhi")).toBe("sw_TZ");
      expect(await detectLanguage("Hello")).toBe("en");
    });
  });
});

describe("startEngineWorker", () => {
  it(
    "rejects with the worker's error when the engine cannot load",
    { timeout: 30_000 },
    async () => {
      await expect(
        startEngineWorker(
          { engine: "accurate", modelPath: "/nonexistent/model.ftz" },
          () => undefined
        )
      ).rejects.toThrow("ENOENT");
    }
  );

  it("rejects a failed call and reports the worker's exit", { timeout: 30_000 }, async () => {
    const onExit = vi.fn();
    const engine = await startEngineWorker({ engine: "lite", modelPath: "" }, onExit);
    expect(await engine.rank("Das ist ein Satz auf Deutsch.")).toEqual(["de"]);

    await expect(engine.rank(null as unknown as string)).rejects.toThrow();
    await vi.waitFor(() => {
      expect(onExit).toHaveBeenCalledTimes(1);
    });
    await expect(engine.rank("Hallo")).rejects.toThrow(
      "Language detector worker exited with code 1"
    );
  });
});
