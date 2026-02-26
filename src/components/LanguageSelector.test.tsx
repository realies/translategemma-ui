import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LanguageSelector } from "./LanguageSelector";

const defaultProps = {
  onChange: vi.fn(),
  storageKey: "srcRecents",
  defaultRecents: ["en", "fr_FR", "de_DE", "es_MX"],
};

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

    const overlay = document.querySelector(".fixed.inset-0");
    if (!overlay) throw new Error("Expected overlay element");
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

  it("excludes the language specified by excludeCode", async () => {
    const user = userEvent.setup();
    render(<LanguageSelector value="en" {...defaultProps} excludeCode="de_DE" />);

    await user.click(screen.getByRole("button", { name: "Search languages" }));
    await user.type(screen.getByPlaceholderText("Search languages..."), "German");

    expect(screen.getByText("No languages found")).toBeInTheDocument();
  });

  it("marks selected language option with aria-selected", async () => {
    const user = userEvent.setup();
    render(<LanguageSelector value="en" {...defaultProps} />);

    await user.click(screen.getByRole("button", { name: "Search languages" }));

    const options = screen.getAllByRole("option");
    const englishOption = options.find((opt) => opt.textContent?.includes("English"));
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
});
