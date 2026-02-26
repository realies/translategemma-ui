import { describe, it, expect } from "vitest";
import { languages, getLanguageByCode, getLanguageName } from "./languages";

describe("languages", () => {
  it("contains at least 55 languages", () => {
    expect(languages.length).toBeGreaterThanOrEqual(55);
  });

  it("has English as the first language", () => {
    expect(languages[0]).toEqual({
      code: "en",
      name: "English",
      nativeName: "English",
    });
  });

  it("every language has code, name, and nativeName", () => {
    for (const lang of languages) {
      expect(lang.code).toBeTruthy();
      expect(lang.name).toBeTruthy();
      expect(lang.nativeName).toBeTruthy();
    }
  });

  it("has no duplicate language codes", () => {
    const codes = languages.map((l) => l.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("includes common languages", () => {
    const codes = languages.map((l) => l.code);
    expect(codes).toContain("en");
    expect(codes).toContain("fr_FR");
    expect(codes).toContain("de_DE");
    expect(codes).toContain("ja_JP");
    expect(codes).toContain("zh_CN");
    expect(codes).toContain("es_MX");
    expect(codes).toContain("ru_RU");
  });
});

describe("getLanguageByCode", () => {
  it("returns the language for a valid code", () => {
    const result = getLanguageByCode("en");
    expect(result).toEqual({
      code: "en",
      name: "English",
      nativeName: "English",
    });
  });

  it("returns Japanese for ja_JP", () => {
    const result = getLanguageByCode("ja_JP");
    expect(result).toEqual({
      code: "ja_JP",
      name: "Japanese",
      nativeName: "日本語",
    });
  });

  it("returns undefined for an unknown code", () => {
    expect(getLanguageByCode("xx_XX")).toBeUndefined();
  });

  it("returns undefined for an empty string", () => {
    expect(getLanguageByCode("")).toBeUndefined();
  });

  it("is case-sensitive", () => {
    expect(getLanguageByCode("EN")).toBeUndefined();
    expect(getLanguageByCode("en")).toBeDefined();
  });
});

describe("getLanguageName", () => {
  it("returns the name for a valid code", () => {
    expect(getLanguageName("en")).toBe("English");
    expect(getLanguageName("de_DE")).toBe("German");
    expect(getLanguageName("zh_TW")).toBe("Chinese (Traditional)");
  });

  it("returns the code itself for an unknown code", () => {
    expect(getLanguageName("xx_XX")).toBe("xx_XX");
  });

  it("returns empty string for empty input", () => {
    expect(getLanguageName("")).toBe("");
  });
});
