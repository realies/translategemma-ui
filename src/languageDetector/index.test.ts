// @vitest-environment node
// Real engines in a real worker thread (engine.worker.mjs).
import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { describe, it, expect, vi, afterEach } from "vitest";
import type * as Detector from "./index";
import type * as WorkerEngine from "./workerEngine";
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

  /** A detector whose engine returns `label` for every text. */
  async function startWithLabel(label: string | null) {
    const identify = vi.fn((_text: string) => Promise.resolve(label));
    vi.doMock("./workerEngine", async (importOriginal) => ({
      ...(await importOriginal<typeof WorkerEngine>()),
      startEngineWorker: () => Promise.resolve({ identify, close: () => Promise.resolve() }),
    }));
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    return { identify, ...(await start({})) };
  }

  it("sends the engine at most 2000 characters, on one line", async () => {
    const { identify, detectLanguage } = await startWithLabel("de");
    expect(await detectLanguage(" Hallo\n\tWelt  ")).toBe("de_DE");
    expect(identify).toHaveBeenLastCalledWith("Hallo Welt");
    await detectLanguage("Hallo Welt ".repeat(1000));
    expect(identify.mock.lastCall?.[0]).toHaveLength(2000);
  });

  it("names a detected language the app doesn't support", async () => {
    const { detectLanguage } = await startWithLabel("afr_Latn");
    await expect(detectLanguage("Goeie môre")).rejects.toThrow(
      "Detected Afrikaans (Latin), which isn't supported. Choose the source language."
    );
  });

  it.each([null, "und", "zxx_Zsym"])(
    "fails with the no-detection message for %s",
    async (label) => {
      const { detectLanguage, NO_DETECTION_MESSAGE } = await startWithLabel(label);
      await expect(detectLanguage("Hallo")).rejects.toThrow(NO_DETECTION_MESSAGE);
    }
  );

  it("detects with the real lite engine (CLD3)", { timeout: 30_000 }, async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { detectLanguage } = await start({ LANGUAGE_DETECTOR: "lite" });

    expect(await detectLanguage(GERMAN)).toBe("de_DE");
    expect(await detectLanguage("這是繁體中文的句子")).toBe("zh_TW");
    expect(await detectLanguage("这是简体中文的句子")).toBe("zh_CN");
    expect(await detectLanguage("שלום לכולם, מה שלומכם היום?")).toBe("he_IL");
    expect(await detectLanguage("Kumusta ka na? Mabuti naman ako.")).toBe("fil_PH");
    expect(await detectLanguage("Bonjour tout le monde")).toBe("fr_FR");
    // Lone surrogates (CLD3 rejects them) are dropped: half an emoji cut off by the 2000-char
    // slice, or one sent on its own.
    const split = `${"Das ist ein Satz über das Wetter. ".repeat(60).slice(0, 1999)}🙂`;
    expect(await detectLanguage(split)).toBe("de_DE");
    expect(await detectLanguage(`${GERMAN}\ud800`)).toBe("de_DE");
    expect(console.info).toHaveBeenCalledWith(
      expect.stringMatching(/^Language detector "lite \(CLD3\)" loaded in \d+ ms$/)
    );
  });

  it("fails when the top label is not an app language", { timeout: 30_000 }, async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { detectLanguage } = await start({ LANGUAGE_DETECTOR: "lite" });
    // CLD3 labels romanised Russian "bg-Latn", which the app does not prompt with.
    await expect(detectLanguage("privet kak dela")).rejects.toThrow(
      "Detected Bulgarian (Latin), which isn't supported."
    );
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
    it.each(["true", "false"])(
      "refuses to start, saying how to fetch it (preload %s)",
      async (preload) => {
        vi.spyOn(process, "cwd").mockReturnValue(mkdtempSync(`${tmpdir()}/tgui-`));
        await expect(
          start({ LANGUAGE_DETECTOR: "accurate", LANGUAGE_DETECTOR_PRELOAD: preload })
        ).rejects.toThrow(
          /^GlotLID model not found at \/.*\/models\/glotlid-v4\.ftz\. Run "npm run fetch:glotlid" to download it\.$/
        );
      }
    );
  });

  it("refuses to start outside the app directory, where the worker is", async () => {
    vi.spyOn(process, "cwd").mockReturnValue(mkdtempSync(`${tmpdir()}/tgui-`));
    await expect(start({})).rejects.toThrow(
      /^Language detector worker not found at \/.*\/src\/languageDetector\/engine\.worker\.mjs\. Start the server from the app directory\.$/
    );
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

  it(
    "says how to fix a corrupt GlotLID model instead of fastText's bare exception",
    { timeout: 30_000 },
    async () => {
      const modelPath = `${mkdtempSync(`${tmpdir()}/tgui-`)}/glotlid-v4.ftz`;
      writeFileSync(modelPath, randomBytes(4096));
      await expect(
        startEngineWorker({ engine: "accurate", modelPath }, () => undefined)
      ).rejects.toThrow(
        `Could not load the GlotLID model at ${modelPath} (the file may be corrupt). Run "npm run fetch:glotlid" to download it again.`
      );
    }
  );

  it("rejects a failed call and reports the worker's exit", { timeout: 30_000 }, async () => {
    const onExit = vi.fn();
    const engine = await startEngineWorker({ engine: "lite", modelPath: "" }, onExit);
    expect(await engine.identify("Das ist ein Satz auf Deutsch.")).toBe("de");

    await expect(engine.identify(null as unknown as string)).rejects.toThrow();
    await vi.waitFor(() => {
      expect(onExit).toHaveBeenCalledTimes(1);
    });
    await expect(engine.identify("Hallo")).rejects.toThrow(
      "Language detector worker exited with code 1"
    );
  });
});
