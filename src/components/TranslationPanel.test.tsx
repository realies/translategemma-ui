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

describe("TranslationPanel", () => {
  beforeEach(() => {
    mockTranslate.mockReset();
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

  it("shows character count", async () => {
    const user = userEvent.setup();
    render(<TranslationPanel />);

    expect(screen.getByText("0 chars")).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("Enter text to translate..."), "Hello");

    expect(screen.getByText("5 chars")).toBeInTheDocument();
  });
});
