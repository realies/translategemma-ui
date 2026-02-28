import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TranslationPanel } from "./TranslationPanel";

const mockTranslate = vi.fn();
vi.mock("~/serverFunctions/translate", () => ({
  translate: (...args: unknown[]) => mockTranslate(...args) as unknown,
}));

// Helper: select a target language via the second "Search languages" button
async function selectTargetLanguage(
  user: ReturnType<typeof userEvent.setup>,
  langName: string,
  langCode: string
) {
  const searchButtons = screen.getAllByRole("button", { name: "Search languages" });
  const targetButton = searchButtons[1];
  if (!targetButton) throw new Error("Expected target language search button");
  await user.click(targetButton);
  await user.type(screen.getByPlaceholderText("Search languages..."), langName);
  await user.click(within(screen.getByRole("listbox")).getByText(langName));
  return langCode;
}

function mockMatchMedia(matches = false) {
  const listeners: ((e: { matches: boolean }) => void)[] = [];
  Object.defineProperty(window, "matchMedia", {
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      addEventListener: (_: string, cb: (e: { matches: boolean }) => void) => {
        listeners.push(cb);
      },
      removeEventListener: (_: string, cb: (e: { matches: boolean }) => void) => {
        const idx = listeners.indexOf(cb);
        if (idx >= 0) listeners.splice(idx, 1);
      },
    })),
    writable: true,
  });
  return listeners;
}

describe("TranslationPanel", () => {
  beforeEach(() => {
    mockTranslate.mockReset();
    localStorage.clear();
    mockMatchMedia(false);
  });

  it("renders source and target language search buttons", () => {
    render(<TranslationPanel />);
    const searchButtons = screen.getAllByRole("button", { name: "Search languages" });
    expect(searchButtons).toHaveLength(2);
  });

  it("renders text input area with placeholder", () => {
    render(<TranslationPanel />);
    expect(screen.getByPlaceholderText("Enter text to translate...")).toBeInTheDocument();
  });

  it("shows placeholder text in output area", () => {
    render(<TranslationPanel />);
    expect(screen.getByText("Translation will appear here")).toBeInTheDocument();
  });

  it("calls translate after typing text with target language set", async () => {
    mockTranslate.mockResolvedValue({
      translation: "Hallo Welt",
      model: "translategemma:27b",
      stats: { totalDuration: 5000000000, evalCount: 10, evalDuration: 3000000000 },
    });

    const user = userEvent.setup();
    render(<TranslationPanel />);

    await selectTargetLanguage(user, "German", "de_DE");
    await user.type(screen.getByPlaceholderText("Enter text to translate..."), "Hello World");

    await waitFor(
      () => {
        expect(screen.getByText("Hallo Welt")).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    expect(mockTranslate).toHaveBeenCalledWith({
      data: { text: "Hello World", sourceLanguage: "en", targetLanguage: "de_DE" },
    });
  });

  it("displays error on translation failure", async () => {
    mockTranslate.mockRejectedValue(new Error("Connection failed"));

    const user = userEvent.setup();
    render(<TranslationPanel />);

    await selectTargetLanguage(user, "German", "de_DE");
    await user.type(screen.getByPlaceholderText("Enter text to translate..."), "Hello");

    await waitFor(
      () => {
        expect(screen.getByText("Connection failed")).toBeInTheDocument();
      },
      { timeout: 3000 }
    );
  });

  it("displays 'Translation failed' for non-Error throws", async () => {
    mockTranslate.mockRejectedValue("some string error");

    const user = userEvent.setup();
    render(<TranslationPanel />);

    await selectTargetLanguage(user, "German", "de_DE");
    await user.type(screen.getByPlaceholderText("Enter text to translate..."), "Hello");

    await waitFor(
      () => {
        expect(screen.getByText("Translation failed")).toBeInTheDocument();
      },
      { timeout: 3000 }
    );
  });

  it("shows stats after successful translation", async () => {
    mockTranslate.mockResolvedValue({
      translation: "Hallo",
      model: "translategemma:27b",
      stats: { totalDuration: 2000000000, evalCount: 5, evalDuration: 1000000000 },
    });

    const user = userEvent.setup();
    render(<TranslationPanel />);

    await selectTargetLanguage(user, "German", "de_DE");
    await user.type(screen.getByPlaceholderText("Enter text to translate..."), "Hello");

    await waitFor(
      () => {
        expect(screen.getByText("Hallo")).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    expect(screen.getByText(/2s/)).toBeInTheDocument();
    expect(screen.getByText(/5 tokens/)).toBeInTheDocument();
  });

  it("handles stats with undefined tokens", async () => {
    mockTranslate.mockResolvedValue({
      translation: "Hallo",
      model: "translategemma:27b",
      stats: { totalDuration: 3000000000 },
    });

    const user = userEvent.setup();
    render(<TranslationPanel />);

    await selectTargetLanguage(user, "German", "de_DE");
    await user.type(screen.getByPlaceholderText("Enter text to translate..."), "Hello");

    await waitFor(
      () => {
        expect(screen.getByText("Hallo")).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    expect(screen.getByText("3s")).toBeInTheDocument();
    expect(screen.queryByText(/tokens/)).not.toBeInTheDocument();
  });

  it("clears text and translation when clear button is clicked", async () => {
    mockTranslate.mockResolvedValue({
      translation: "Hallo",
      model: "translategemma:27b",
      stats: { totalDuration: 1000000000 },
    });

    const user = userEvent.setup();
    render(<TranslationPanel />);

    await selectTargetLanguage(user, "German", "de_DE");
    const textarea = screen.getByPlaceholderText("Enter text to translate...");
    await user.type(textarea, "Hello");

    await waitFor(
      () => {
        expect(screen.getByText("Hallo")).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    await user.click(screen.getByTitle("Clear"));

    expect(textarea).toHaveValue("");
    expect(screen.getByText("Translation will appear here")).toBeInTheDocument();
  });

  it("swaps languages when selecting a language matching the other side", async () => {
    localStorage.setItem("srcLang", "en");
    localStorage.setItem("tgtLang", "fr_FR");

    const user = userEvent.setup();
    render(<TranslationPanel />);

    // Select French as source (same as target) — should swap target to English
    const searchButtons = screen.getAllByRole("button", { name: "Search languages" });
    const sourceButton = searchButtons[0];
    if (!sourceButton) throw new Error("Expected source language search button");
    await user.click(sourceButton);
    await user.type(screen.getByPlaceholderText("Search languages..."), "French (France)");
    await user.click(within(screen.getByRole("listbox")).getByText("French (France)"));

    expect(localStorage.getItem("srcLang")).toBe("fr_FR");
    expect(localStorage.getItem("tgtLang")).toBe("en");
  });

  it("shows character count", async () => {
    const user = userEvent.setup();
    render(<TranslationPanel />);

    expect(screen.getByText("0 chars")).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("Enter text to translate..."), "Hello");

    expect(screen.getByText("5 chars")).toBeInTheDocument();
  });

  it("restores languages from localStorage", () => {
    localStorage.setItem("srcLang", "de_DE");
    localStorage.setItem("tgtLang", "ja_JP");

    render(<TranslationPanel />);

    // The language pills should show the stored languages
    expect(screen.getAllByText("German").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Japanese").length).toBeGreaterThan(0);
  });

  it("ignores invalid language codes in localStorage", () => {
    localStorage.setItem("srcLang", "not_a_language");
    localStorage.setItem("tgtLang", "also_invalid");

    render(<TranslationPanel />);

    // Should fall back to defaults (English source, French target)
    expect(screen.getAllByText("English").length).toBeGreaterThan(0);
    expect(screen.getAllByText("French (France)").length).toBeGreaterThan(0);
  });

  it("falls back to defaults when localStorage throws", () => {
    const getItemSpy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });

    render(<TranslationPanel />);

    // Should render with default languages
    expect(screen.getAllByText("English").length).toBeGreaterThan(0);
    expect(screen.getAllByText("French (France)").length).toBeGreaterThan(0);

    getItemSpy.mockRestore();
  });

  it("swaps source and target languages", async () => {
    localStorage.setItem("srcLang", "en");
    localStorage.setItem("tgtLang", "de_DE");

    const user = userEvent.setup();
    render(<TranslationPanel />);

    // Verify initial state
    const searchButtons = screen.getAllByRole("button", { name: "Search languages" });
    expect(searchButtons).toHaveLength(2);

    await user.click(screen.getByTitle("Swap languages"));

    // After swap: source should be German, target should be English
    // The swap button persists to localStorage — verify via the stored values
    expect(localStorage.getItem("srcLang")).toBe("de_DE");
    expect(localStorage.getItem("tgtLang")).toBe("en");
  });
});
