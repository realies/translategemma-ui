import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TranslationPanel } from "./TranslationPanel";

const mockTranslateStream = vi.fn();
vi.mock("~/serverFunctions/translateStream", () => ({
  translateStream: (...args: unknown[]) => mockTranslateStream(...args) as unknown,
}));

/** Build a Response whose body is an NDJSON stream Ollama-style. */
function mockStreamResponse(
  translation: string,
  stats?: { total_duration?: number; eval_count?: number; eval_duration?: number },
  detected?: string
) {
  const lines = [
    JSON.stringify({ response: translation, done: false }),
    JSON.stringify({ response: "", done: true, ...stats }),
  ];
  return new Response(lines.join("\n") + "\n", {
    headers: {
      "Content-Type": "application/x-ndjson",
      ...(detected ? { "X-Detected-Language": detected } : {}),
    },
  });
}

/** Build a Response with multiple chunks to exercise incremental NDJSON parsing. */
function mockChunkedStreamResponse(
  tokens: string[],
  stats?: { total_duration?: number; eval_count?: number; eval_duration?: number }
) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const token of tokens) {
        controller.enqueue(encoder.encode(JSON.stringify({ response: token, done: false }) + "\n"));
      }
      controller.enqueue(
        encoder.encode(JSON.stringify({ response: "", done: true, ...stats }) + "\n")
      );
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson" },
  });
}

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
    mockTranslateStream.mockReset();
    localStorage.clear();
    mockMatchMedia(false);
    // requestAnimationFrame isn't available in jsdom
    vi.stubGlobal("requestAnimationFrame", (cb: () => void) => {
      return setTimeout(cb, 0);
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      clearTimeout(id);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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
    mockTranslateStream.mockResolvedValue(
      mockStreamResponse("Hallo Welt", {
        total_duration: 5000000000,
        eval_count: 10,
        eval_duration: 3000000000,
      })
    );

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

    expect(mockTranslateStream).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { text: "Hello World", sourceLanguage: "en", targetLanguage: "de_DE" },
      })
    );
  });

  it("displays error on translation failure", async () => {
    mockTranslateStream.mockRejectedValue(new Error("Connection failed"));

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
    mockTranslateStream.mockRejectedValue("some string error");

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
    mockTranslateStream.mockResolvedValue(
      mockStreamResponse("Hallo", {
        total_duration: 2000000000,
        eval_count: 5,
        eval_duration: 1000000000,
      })
    );

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
    mockTranslateStream.mockResolvedValue(
      mockStreamResponse("Hallo", { total_duration: 3000000000 })
    );

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
    mockTranslateStream.mockResolvedValue(
      mockStreamResponse("Hallo", { total_duration: 1000000000 })
    );

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

  it("handles chunked NDJSON stream with multiple tokens", async () => {
    mockTranslateStream.mockResolvedValue(
      mockChunkedStreamResponse(["Hal", "lo ", "Welt"], {
        total_duration: 4000000000,
        eval_count: 3,
      })
    );

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

    expect(screen.getByText(/4s/)).toBeInTheDocument();
    expect(screen.getByText(/3 tokens/)).toBeInTheDocument();
  });

  describe("auto-detect", () => {
    const swapButton = () => screen.getByTitle("Swap languages");
    const textarea = () => screen.getByPlaceholderText("Enter text to translate...");

    /** Select Auto-detect, type text, and wait for the server's detection to show. */
    async function detect(user: ReturnType<typeof userEvent.setup>, code: string, name: string) {
      mockTranslateStream.mockResolvedValue(mockStreamResponse("Translated", undefined, code));
      await user.click(screen.getByRole("button", { name: "Auto-detect" }));
      await user.type(textarea(), "Hallo Welt");
      await waitFor(
        () => {
          expect(screen.getByRole("button", { name: `Auto-detect: ${name}` })).toBeInTheDocument();
        },
        { timeout: 3000 }
      );
    }

    it("sends auto, shows the detected language, and swaps to it", async () => {
      const user = userEvent.setup();
      render(<TranslationPanel />);

      await user.click(screen.getByRole("button", { name: "Auto-detect" }));
      expect(swapButton()).toBeDisabled();
      expect(localStorage.getItem("srcLang")).toBe("auto");

      await detect(user, "de_DE", "German");
      expect(mockTranslateStream).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { text: "Hallo Welt", sourceLanguage: "auto", targetLanguage: "fr_FR" },
        })
      );
      expect(localStorage.getItem("srcRecents") ?? "").not.toContain("auto");
      expect(swapButton()).toBeEnabled();

      await user.click(swapButton());
      expect(localStorage.getItem("srcLang")).toBe("fr_FR");
      expect(localStorage.getItem("tgtLang")).toBe("de_DE");
    });

    it("disables swap when the detected language is the target", async () => {
      const user = userEvent.setup();
      render(<TranslationPanel />);

      await detect(user, "fr_FR", "French (France)");
      expect(swapButton()).toBeDisabled();
    });

    it("moves the detected language, not auto, to the target on a source collision", async () => {
      const user = userEvent.setup();
      render(<TranslationPanel />);

      await detect(user, "de_DE", "German");
      const [sourceFrench] = screen.getAllByRole("button", { name: "French (France)" });
      if (!sourceFrench) throw new Error("Expected a French (France) source pill");
      await user.click(sourceFrench);

      expect(localStorage.getItem("srcLang")).toBe("fr_FR");
      expect(localStorage.getItem("tgtLang")).toBe("de_DE");
    });

    it("clears the detection when the text is cleared, so new text never shows it", async () => {
      const user = userEvent.setup();
      render(<TranslationPanel />);

      await detect(user, "de_DE", "German");
      await user.click(screen.getByTitle("Clear"));
      expect(screen.getByRole("button", { name: "Auto-detect" })).toBeInTheDocument();
      expect(swapButton()).toBeDisabled();

      // New text whose request has not answered yet: still no detection to show or swap with.
      mockTranslateStream.mockReturnValue(new Promise(() => undefined));
      await user.type(textarea(), "Bonjour");
      await waitFor(() => {
        expect(mockTranslateStream).toHaveBeenLastCalledWith(
          expect.objectContaining({
            data: { text: "Bonjour", sourceLanguage: "auto", targetLanguage: "fr_FR" },
          })
        );
      });
      expect(screen.getByRole("button", { name: "Auto-detect" })).toBeInTheDocument();
      expect(swapButton()).toBeDisabled();
    });

    it("clears the detection when a request fails", async () => {
      const user = userEvent.setup();
      render(<TranslationPanel />);

      await detect(user, "de_DE", "German");
      mockTranslateStream.mockRejectedValue(new Error("Ollama API error: 500"));
      await user.type(textarea(), " und so");

      await waitFor(
        () => {
          expect(screen.getByText("Ollama API error: 500")).toBeInTheDocument();
        },
        { timeout: 3000 }
      );
      expect(screen.getByRole("button", { name: "Auto-detect" })).toBeInTheDocument();
      expect(swapButton()).toBeDisabled();
    });

    it("clears the detection as soon as a manual-source request starts", async () => {
      const user = userEvent.setup();
      render(<TranslationPanel />);

      await detect(user, "de_DE", "German");
      // The manual request (and the auto one after it) never answer.
      mockTranslateStream.mockReturnValue(new Promise(() => undefined));
      await user.click(screen.getByRole("button", { name: "English" }));
      await user.click(screen.getByRole("button", { name: /^Auto-detect/ }));

      expect(screen.getByRole("button", { name: "Auto-detect" })).toBeInTheDocument();
    });

    it("shows the server's no-detection error and keeps swap disabled", async () => {
      const message = "Couldn't detect the language. Choose the source language.";
      mockTranslateStream.mockRejectedValue(new Error(message));
      const user = userEvent.setup();
      render(<TranslationPanel />);

      await user.click(screen.getByRole("button", { name: "Auto-detect" }));
      await user.type(textarea(), "12345");

      await waitFor(
        () => {
          expect(screen.getByText(message)).toBeInTheDocument();
        },
        { timeout: 3000 }
      );
      expect(screen.getByRole("button", { name: "Auto-detect" })).toBeInTheDocument();
      expect(swapButton()).toBeDisabled();
    });

    it("swaps when the detected language is picked as the target", async () => {
      const user = userEvent.setup();
      render(<TranslationPanel />);

      await detect(user, "de_DE", "German");
      const [, targetGerman] = screen.getAllByRole("button", { name: "German" });
      if (!targetGerman) throw new Error("Expected a German target pill");
      await user.click(targetGerman);

      expect(localStorage.getItem("srcLang")).toBe("fr_FR");
      expect(localStorage.getItem("tgtLang")).toBe("de_DE");
    });

    it("never moves auto into the target when the target is picked as source before a detection", async () => {
      const user = userEvent.setup();
      render(<TranslationPanel />);

      await user.click(screen.getByRole("button", { name: "Auto-detect" }));
      const [sourceFrench] = screen.getAllByRole("button", { name: "French (France)" });
      if (!sourceFrench) throw new Error("Expected a French (France) source pill");
      await user.click(sourceFrench);

      // No same-language pair: the target takes its most recent other language.
      expect(localStorage.getItem("srcLang")).toBe("fr_FR");
      expect(localStorage.getItem("tgtLang")).toBe("de_DE");
    });

    it("avoids a same-language pair when the detection equals the target picked as source", async () => {
      const user = userEvent.setup();
      render(<TranslationPanel />);

      await detect(user, "fr_FR", "French (France)");
      const [sourceFrench] = screen.getAllByRole("button", { name: "French (France)" });
      if (!sourceFrench) throw new Error("Expected a French (France) source pill");
      await user.click(sourceFrench);

      expect(localStorage.getItem("srcLang")).toBe("fr_FR");
      expect(localStorage.getItem("tgtLang")).toBe("de_DE");
    });

    it("keeps showing a detection while typing, but only acts on one for the current text", async () => {
      const user = userEvent.setup();
      render(<TranslationPanel />);

      await detect(user, "de_DE", "German");
      mockTranslateStream.mockReturnValue(new Promise(() => undefined));
      await user.type(textarea(), " und mehr");

      expect(screen.getByRole("button", { name: "Auto-detect: German" })).toBeInTheDocument();
      expect(swapButton()).toBeDisabled();
    });

    it("ignores a pending detection whose request was cancelled", async () => {
      let deliver: (response: Response) => void = () => undefined;
      mockTranslateStream.mockReturnValueOnce(
        new Promise<Response>((resolve) => {
          deliver = resolve;
        })
      );
      const user = userEvent.setup();
      render(<TranslationPanel />);

      await user.click(screen.getByRole("button", { name: "Auto-detect" }));
      await user.type(textarea(), "Hallo Welt");
      await waitFor(() => {
        expect(mockTranslateStream).toHaveBeenCalled();
      });
      const [{ signal }] = mockTranslateStream.mock.calls[0] as [{ signal: AbortSignal }];

      await user.click(screen.getByTitle("Clear"));
      expect(signal.aborted).toBe(true);
      mockTranslateStream.mockReturnValue(new Promise(() => undefined));
      await user.type(textarea(), "Bonjour");
      deliver(mockStreamResponse("Translated", undefined, "de_DE"));
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(screen.getByRole("button", { name: "Auto-detect" })).toBeInTheDocument();
      expect(swapButton()).toBeDisabled();
    });

    it("does nothing when the current target is reselected, even if it equals the detection", async () => {
      const user = userEvent.setup();
      render(<TranslationPanel />);

      await detect(user, "fr_FR", "French (France)");
      const [, targetFrench] = screen.getAllByRole("button", { name: "French (France)" });
      if (!targetFrench) throw new Error("Expected a French (France) target pill");
      await user.click(targetFrench);

      expect(localStorage.getItem("srcLang")).toBe("auto");
      expect(localStorage.getItem("tgtLang")).toBe("fr_FR");
      expect(textarea()).toHaveValue("Hallo Welt");
    });

    it("picks a default target when the target recents offer no other language", async () => {
      localStorage.setItem("srcLang", "auto");
      localStorage.setItem("tgtLang", "fr_FR");
      localStorage.setItem("tgtRecents", JSON.stringify(["fr_FR"]));
      const user = userEvent.setup();
      render(<TranslationPanel />);

      const [sourceFrench] = screen.getAllByRole("button", { name: "French (France)" });
      if (!sourceFrench) throw new Error("Expected a French (France) source pill");
      await user.click(sourceFrench);

      expect(localStorage.getItem("srcLang")).toBe("fr_FR");
      expect(localStorage.getItem("tgtLang")).toBe("de_DE");
    });

    it("restores auto-detect from localStorage", () => {
      localStorage.setItem("srcLang", "auto");
      render(<TranslationPanel />);

      const [sourceButton] = screen.getAllByRole("button", { name: /^Select language/ });
      expect(sourceButton).toHaveTextContent("Auto-detect");
      expect(swapButton()).toBeDisabled();
    });
  });
});
