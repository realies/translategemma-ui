import { describe, it, expect } from "vitest";
import { buildTranslationPrompt } from "./prompt";

describe("buildTranslationPrompt", () => {
  it("builds a prompt with known language codes", () => {
    const result = buildTranslationPrompt("Hello world", "en", "de_DE");

    expect(result).toContain("English (en)");
    expect(result).toContain("German (de_DE)");
    expect(result).toContain("Hello world");
  });

  it("includes the source text after two blank lines", () => {
    const result = buildTranslationPrompt("Test text", "en", "fr_FR");

    // The prompt format requires two blank lines before the text
    expect(result).toContain("\n\n\nTest text");
  });

  it("includes instructions to produce only the target language", () => {
    const result = buildTranslationPrompt("Hello", "en", "ja_JP");

    expect(result).toContain("Produce only the Japanese translation");
    expect(result).toContain("without any additional explanations or commentary");
  });

  it("describes the translator role", () => {
    const result = buildTranslationPrompt("Hi", "en", "fr_FR");

    expect(result).toContain("professional English (en) to French (France) (fr_FR) translator");
  });

  it("works with unknown language codes (falls back to code as name)", () => {
    const result = buildTranslationPrompt("test", "xx", "yy");

    // getLanguageName returns the code itself for unknown codes
    expect(result).toContain("xx (xx)");
    expect(result).toContain("yy (yy)");
    expect(result).toContain("test");
  });

  it("preserves multiline text", () => {
    const multiline = "Line one\nLine two\nLine three";
    const result = buildTranslationPrompt(multiline, "en", "de_DE");

    expect(result).toContain("Line one\nLine two\nLine three");
  });

  it("handles empty text", () => {
    const result = buildTranslationPrompt("", "en", "de_DE");

    // Should still build the prompt, just with empty text
    expect(result).toContain("English (en)");
    expect(result).toContain("German (de_DE)");
  });
});
