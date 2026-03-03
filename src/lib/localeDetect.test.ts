import { describe, it, expect, vi, afterEach } from "vitest";
import { detectTargetLocale } from "./localeDetect";

function mockNavigatorLanguage(lang: string) {
  vi.stubGlobal("navigator", { language: lang });
}

describe("detectTargetLocale", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns null for English locale", () => {
    mockNavigatorLanguage("en");
    expect(detectTargetLocale()).toBeNull();
  });

  it("returns null for English with region", () => {
    mockNavigatorLanguage("en-US");
    expect(detectTargetLocale()).toBeNull();
  });

  it("returns exact match for fr-FR", () => {
    mockNavigatorLanguage("fr-FR");
    expect(detectTargetLocale()).toBe("fr_FR");
  });

  it("returns exact match for de-DE", () => {
    mockNavigatorLanguage("de-DE");
    expect(detectTargetLocale()).toBe("de_DE");
  });

  it("returns prefix match for bare language code", () => {
    mockNavigatorLanguage("fr");
    const result = detectTargetLocale();
    expect(result).toMatch(/^fr_/);
  });

  it("resolves zh-Hant-TW to zh_TW (skips script subtag)", () => {
    mockNavigatorLanguage("zh-Hant-TW");
    expect(detectTargetLocale()).toBe("zh_TW");
  });

  it("resolves zh-Hans-CN to zh_CN (skips script subtag)", () => {
    mockNavigatorLanguage("zh-Hans-CN");
    expect(detectTargetLocale()).toBe("zh_CN");
  });

  it("returns null for unsupported locale", () => {
    mockNavigatorLanguage("xx-YY");
    expect(detectTargetLocale()).toBeNull();
  });

  it("returns null when navigator is undefined", () => {
    vi.stubGlobal("navigator", undefined);
    expect(detectTargetLocale()).toBeNull();
  });
});
