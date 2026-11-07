import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LanguageSelector } from "./LanguageSelector";
import { DEFAULT_SOURCE_RECENTS } from "./TranslationPanel";

const defaultProps = {
  onChange: vi.fn(),
  recents: [...DEFAULT_SOURCE_RECENTS],
  onRecentsChange: vi.fn(),
};

/** The desktop pill row: every button except the mobile and search buttons (aria-labelled). */
const pills = () => screen.getAllByRole("button").filter((b) => !b.hasAttribute("aria-label"));

describe("LanguageSelector", () => {
  it("renders the selected language name", () => {
    render(<LanguageSelector value="en" {...defaultProps} />);
    expect(screen.getAllByText("English").length).toBeGreaterThan(0);
  });

  it("opens dropdown when search button is clicked", async () => {
    const user = userEvent.setup();
    render(<LanguageSelector value="en" {...defaultProps} />);

    await user.click(screen.getByRole("button", { name: "Search languages" }));

    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search languages...")).toBeInTheDocument();
  });

  it("closes dropdown when clicking the overlay", async () => {
    const user = userEvent.setup();
    render(<LanguageSelector value="en" {...defaultProps} />);

    await user.click(screen.getByRole("button", { name: "Search languages" }));
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    const overlay = screen.getByTestId("language-selector-overlay");
    await user.click(overlay);

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("filters languages by search text", async () => {
    const user = userEvent.setup();
    render(<LanguageSelector value="en" {...defaultProps} />);

    await user.click(screen.getByRole("button", { name: "Search languages" }));
    await user.type(screen.getByPlaceholderText("Search languages..."), "Japan");

    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(1);
    expect(screen.getByText("Japanese")).toBeInTheDocument();
  });

  it("shows no results message when no languages match", async () => {
    const user = userEvent.setup();
    render(<LanguageSelector value="en" {...defaultProps} />);

    await user.click(screen.getByRole("button", { name: "Search languages" }));
    await user.type(screen.getByPlaceholderText("Search languages..."), "zzzzz");

    expect(screen.getByText("No languages found")).toBeInTheDocument();
  });

  it("calls onChange and closes dropdown on language selection", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<LanguageSelector value="en" {...defaultProps} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Search languages" }));
    await user.type(screen.getByPlaceholderText("Search languages..."), "German");
    await user.click(within(screen.getByRole("listbox")).getByText("German"));

    expect(onChange).toHaveBeenCalledWith("de_DE");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("marks selected language option with aria-selected", async () => {
    const user = userEvent.setup();
    render(<LanguageSelector value="en" {...defaultProps} />);

    await user.click(screen.getByRole("button", { name: "Search languages" }));

    const options = screen.getAllByRole("option");
    const englishOption = options.find((opt) => opt.textContent.includes("English"));
    expect(englishOption).toHaveAttribute("aria-selected", "true");
  });

  it("selects first result when Enter is pressed with no arrow navigation", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<LanguageSelector value="en" {...defaultProps} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Search languages" }));
    await user.type(screen.getByPlaceholderText("Search languages..."), "German");
    await user.keyboard("{Enter}");

    expect(onChange).toHaveBeenCalledWith("de_DE");
  });

  it("calls onRecentsChange when a new language is selected", async () => {
    const onRecentsChange = vi.fn();
    const user = userEvent.setup();
    render(<LanguageSelector value="en" {...defaultProps} onRecentsChange={onRecentsChange} />);

    await user.click(screen.getByRole("button", { name: "Search languages" }));
    await user.type(screen.getByPlaceholderText("Search languages..."), "Japan");
    await user.click(within(screen.getByRole("listbox")).getByText("Japanese"));

    expect(onRecentsChange).toHaveBeenCalledWith(expect.arrayContaining(["ja_JP"]));
  });

  it("does not call onRecentsChange when selecting an existing recent", async () => {
    const onRecentsChange = vi.fn();
    const user = userEvent.setup();
    render(<LanguageSelector value="en" {...defaultProps} onRecentsChange={onRecentsChange} />);

    await user.click(screen.getByRole("button", { name: "Search languages" }));
    await user.type(screen.getByPlaceholderText("Search languages..."), "German");
    await user.click(within(screen.getByRole("listbox")).getByText("German"));

    // de_DE is already in DEFAULT_SOURCE_RECENTS, so recents should not change
    expect(onRecentsChange).not.toHaveBeenCalled();
  });

  it("shows 'Select language' when value is empty", () => {
    render(<LanguageSelector value="" {...defaultProps} />);
    expect(screen.getByText("Select language")).toBeInTheDocument();
  });

  it("closes dropdown on Escape key", async () => {
    const user = userEvent.setup();
    render(<LanguageSelector value="en" {...defaultProps} />);

    await user.click(screen.getByRole("button", { name: "Search languages" }));
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("offers Auto-detect as the first pill and option, and never adds it to recents", async () => {
    const onChange = vi.fn();
    const onRecentsChange = vi.fn();
    const user = userEvent.setup();
    render(
      <LanguageSelector
        value="en"
        {...defaultProps}
        onChange={onChange}
        onRecentsChange={onRecentsChange}
        allowAuto
      />
    );

    // Auto-detect takes the fourth recent's place, so the row is as long as without it.
    expect(pills().map((b) => b.textContent)).toEqual([
      "Auto-detect",
      "English",
      "French (France)",
      "German",
    ]);

    await user.click(screen.getByRole("button", { name: "Search languages" }));
    expect(screen.getAllByRole("option")[0]).toHaveTextContent("Auto-detect");
    await user.keyboard("{Enter}");

    expect(onChange).toHaveBeenCalledWith("auto");
    for (const [next] of onRecentsChange.mock.calls as [string[]][]) {
      expect(next).not.toContain("auto");
    }
  });

  it("lists Auto-detect first on mobile too, ahead of the floated recents", async () => {
    const anchor = document.createElement("div");
    anchor.getBoundingClientRect = () => DOMRect.fromRect({ x: 0, y: 0, width: 300, height: 40 });
    const user = userEvent.setup();
    render(
      <LanguageSelector
        value="en"
        {...defaultProps}
        allowAuto
        dropdownAnchorRef={{ current: anchor }}
      />
    );

    await user.click(screen.getByRole("button", { name: "Search languages" }));
    const names = screen.getAllByRole("option").map((o) => o.textContent);
    expect(names[0]).toContain("Auto-detect");
    expect(names[1]).toContain("English");
  });

  it("shows the detected language on the Auto-detect pill and, first, on the mobile button", () => {
    render(<LanguageSelector value="auto" {...defaultProps} allowAuto detectedLanguage="de_DE" />);
    expect(screen.getByRole("button", { name: "Auto-detect: German" })).toBeInTheDocument();
    // The mobile button truncates, so the language leads and the auto label is cut first.
    expect(screen.getByRole("button", { name: "Select language" })).toHaveTextContent(
      /^German · Auto-detect$/
    );
  });

  it("keeps the selected recent in the pill row when Auto-detect takes a slot", () => {
    render(<LanguageSelector value="es_MX" {...defaultProps} allowAuto />);
    expect(pills().map((b) => b.textContent)).toEqual([
      "Auto-detect",
      "English",
      "French (France)",
      "Spanish (Mexico)",
    ]);
  });

  it("moves a recent hidden from the pill row to the front when picked", async () => {
    const onRecentsChange = vi.fn();
    const user = userEvent.setup();
    render(
      <LanguageSelector value="en" {...defaultProps} onRecentsChange={onRecentsChange} allowAuto />
    );

    await user.click(screen.getByRole("button", { name: "Search languages" }));
    await user.click(within(screen.getByRole("listbox")).getByText("Spanish (Mexico)"));

    expect(onRecentsChange).toHaveBeenCalledWith(["es_MX", "en", "fr_FR", "de_DE"]);
  });

  it("lists Auto-detect only before a search, so a typed code and Enter picks the language", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<LanguageSelector value="en" {...defaultProps} onChange={onChange} allowAuto />);

    await user.click(screen.getByRole("button", { name: "Search languages" }));
    await user.type(screen.getByPlaceholderText("Search languages..."), "de");
    expect(screen.queryByText("Auto-detect", { selector: "li *" })).not.toBeInTheDocument();
    await user.keyboard("{Enter}");

    expect(onChange).toHaveBeenCalledWith("de_DE");
  });

  it("has no Auto-detect option unless allowed", async () => {
    const user = userEvent.setup();
    render(<LanguageSelector value="en" {...defaultProps} />);

    await user.click(screen.getByRole("button", { name: "Search languages" }));
    expect(screen.queryByText("Auto-detect")).not.toBeInTheDocument();
  });
});
