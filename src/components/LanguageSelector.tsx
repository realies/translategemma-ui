import { useState, useMemo, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import type { RefObject } from "react";
import { languages, getLanguageName, VALID_LANGUAGE_CODES } from "~/lib/languages";

const MAX_RECENTS = 4;

/** Below this height the anchor is a language row (mobile), not a textarea panel (desktop). */
const MOBILE_ANCHOR_THRESHOLD = 100;

/** Minimum usable dropdown height before we flip above the anchor. */
const MIN_DROPDOWN_HEIGHT = 160;

function getDropdownPosition(rect: DOMRect) {
  if (rect.height < MOBILE_ANCHOR_THRESHOLD) {
    const spaceBelow = window.innerHeight - rect.bottom - 16;
    const spaceAbove = rect.top - 16;
    const maxHeight = Math.min(560, window.innerHeight * 0.7);

    // Flip above the anchor when space below is too tight and there's more room above
    if (spaceBelow < MIN_DROPDOWN_HEIGHT && spaceAbove > spaceBelow) {
      const height = Math.min(spaceAbove, maxHeight);
      return {
        position: "fixed" as const,
        top: rect.top - height - 8,
        left: rect.left,
        width: rect.width,
        height,
      };
    }

    return {
      position: "fixed" as const,
      top: rect.bottom + 8,
      left: rect.left,
      width: rect.width,
      height: Math.min(spaceBelow, maxHeight),
    };
  }
  return {
    position: "fixed" as const,
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

interface LanguageSelectorProps {
  value: string;
  onChange: (code: string) => void;
  excludeCode?: string;
  recents: string[];
  onRecentsChange: (next: string[]) => void;
  /** When set, dropdown is positioned/sized to match this element (e.g. textarea panel below). */
  dropdownAnchorRef?: RefObject<HTMLElement | null>;
}

export function loadRecents(storageKey: string, defaults: string[]): string[] {
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      const parsed: unknown = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) {
        const seen = new Set<string>();
        const valid = parsed
          .filter((code) => {
            if (!VALID_LANGUAGE_CODES.has(code) || seen.has(code)) return false;
            seen.add(code);
            return true;
          })
          .slice(0, MAX_RECENTS);
        if (valid.length > 0) return valid;
      }
    }
  } catch {
    // ignore
  }
  return defaults;
}

export function saveRecents(storageKey: string, recents: string[]) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(recents));
  } catch {
    // ignore
  }
}

export function addToRecents(recents: string[], code: string): string[] {
  if (!VALID_LANGUAGE_CODES.has(code)) return recents;
  const filtered = recents.filter((c) => c !== code);
  return [code, ...filtered].slice(0, MAX_RECENTS);
}

export function LanguageSelector({
  value,
  onChange,
  excludeCode,
  recents,
  onRecentsChange,
  dropdownAnchorRef,
}: LanguageSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const useAnchor = Boolean(isOpen && dropdownAnchorRef?.current);

  useLayoutEffect(() => {
    if (!useAnchor || !dropdownAnchorRef?.current) {
      setAnchorRect(null);
      return;
    }
    const el = dropdownAnchorRef.current;
    const measure = () => {
      setAnchorRect(el.getBoundingClientRect());
    };
    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [useAnchor, dropdownAnchorRef]);

  const visibleTabs = useMemo(
    () => recents.filter((c) => c !== excludeCode).slice(0, MAX_RECENTS),
    [recents, excludeCode]
  );

  const filteredLanguages = useMemo(
    () =>
      languages
        .filter((lang) => lang.code !== excludeCode)
        .filter(
          (lang) =>
            lang.name.toLowerCase().includes(search.toLowerCase()) ||
            lang.nativeName.toLowerCase().includes(search.toLowerCase()) ||
            lang.code.toLowerCase().includes(search.toLowerCase())
        ),
    [search, excludeCode]
  );

  const close = useCallback(() => {
    setIsOpen(false);
    setSearch("");
    setFocusedIndex(-1);
  }, []);

  const select = useCallback(
    (code: string) => {
      onChange(code);
      onRecentsChange(addToRecents(recents, code));
      close();
    },
    [recents, onChange, onRecentsChange, close]
  );

  // Move cursor to first result whenever search changes
  useEffect(() => {
    setFocusedIndex(0);
  }, [search]);

  // Scroll focused item into view
  useEffect(() => {
    if (focusedIndex >= 0 && listRef.current) {
      const item = listRef.current.children[focusedIndex] as HTMLElement | undefined;
      item?.scrollIntoView({ block: "nearest" });
    }
  }, [focusedIndex]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen) return;
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setFocusedIndex((i) => Math.min(i + 1, filteredLanguages.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setFocusedIndex((i) => Math.max(i - 1, 0));
          break;
        case "Enter": {
          e.preventDefault();
          const idx = focusedIndex >= 0 ? focusedIndex : 0;
          const lang = filteredLanguages[idx];
          if (lang) select(lang.code);
          break;
        }
        case "Escape":
          close();
          break;
      }
    },
    [isOpen, focusedIndex, filteredLanguages, select, close]
  );

  const selectedName = value ? getLanguageName(value) : "Select language";

  const dropdownStyle = anchorRect ? getDropdownPosition(anchorRect) : undefined;

  return (
    <div className="relative w-full min-w-0">
      <div className="flex min-w-0 items-center gap-1.5">
        {/* Narrow: active language pill with search icon inside */}
        <button
          type="button"
          onClick={() => {
            setIsOpen(true);
          }}
          className={`flex flex-1 items-center gap-1 rounded-2xl py-2 pr-2.5 pl-3.5 text-left text-[13px] font-medium transition-colors md:hidden ${
            isOpen
              ? "bg-zinc-200 text-zinc-800 ring-1 ring-zinc-300 dark:bg-zinc-700 dark:text-zinc-100 dark:ring-zinc-500"
              : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
          }`}
          aria-label="Select language"
          aria-expanded={isOpen}
        >
          <span className="truncate">{selectedName}</span>
          <svg
            className="ml-auto h-3.5 w-3.5 shrink-0 text-zinc-400 dark:text-zinc-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </button>

        {/* Wide: recent language pills — flex-1 pushes search icon to the right; mask fades edges when clipped */}
        <div className="hidden min-w-0 flex-1 items-center gap-1 overflow-hidden [mask-image:linear-gradient(to_right,black_0,black_calc(100%-1.5rem),transparent_100%)] [-webkit-mask-image:linear-gradient(to_right,black_0,black_calc(100%-1.5rem),transparent_100%)] md:flex">
          {visibleTabs.map((code) => {
            const isActive = code === value;
            return (
              <button
                key={code}
                type="button"
                onClick={() => {
                  select(code);
                }}
                className={`rounded-2xl px-3.5 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors ${
                  isActive
                    ? "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100"
                    : "text-zinc-500 hover:bg-zinc-100/60 dark:text-zinc-400 dark:hover:bg-zinc-800/60"
                }`}
              >
                {getLanguageName(code)}
              </button>
            );
          })}
        </div>

        {/* Search icon — desktop only (mobile icon is inside the pill) */}
        <button
          type="button"
          onClick={() => {
            setIsOpen(true);
          }}
          aria-label="Search languages"
          className="hidden shrink-0 rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 md:block dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </button>
      </div>

      {/* Dropdown — when anchor provided, match its position/size (textarea panel); else absolute below trigger */}
      {isOpen && (
        <>
          <div
            data-testid="language-selector-overlay"
            className="fixed inset-0 z-10"
            onClick={() => {
              close();
            }}
          />
          <div
            className={
              anchorRect
                ? "z-20 flex flex-col rounded-2xl bg-white shadow-xl ring-1 ring-zinc-900/5 dark:bg-zinc-800 dark:ring-zinc-100/10"
                : "absolute top-full left-0 z-20 mt-2 flex w-full min-w-64 flex-col rounded-2xl bg-white shadow-xl ring-1 ring-zinc-900/5 dark:bg-zinc-800 dark:ring-zinc-100/10"
            }
            style={dropdownStyle ?? undefined}
          >
            <div className="shrink-0 p-2.5">
              <input
                type="text"
                placeholder="Search languages..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                }}
                onKeyDown={handleKeyDown}
                aria-label="Search languages"
                className="w-full rounded-xl bg-zinc-100/80 px-3.5 py-2 text-[13px] focus:outline-none dark:bg-zinc-700/80"
                autoFocus
              />
            </div>
            <ul
              ref={listRef}
              className={`overflow-auto px-1.5 pb-1.5 [scrollbar-gutter:stable] ${anchorRect ? "min-h-0 flex-1" : "max-h-60"}`}
              role="listbox"
            >
              {filteredLanguages.map((lang, index) => (
                <li key={lang.code} role="option" aria-selected={lang.code === value}>
                  <button
                    type="button"
                    onClick={() => {
                      select(lang.code);
                    }}
                    className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left transition-colors ${
                      index === focusedIndex
                        ? "bg-zinc-100 dark:bg-zinc-700"
                        : "hover:bg-zinc-50 dark:hover:bg-zinc-700/50"
                    }`}
                  >
                    <span className="text-[13px] font-medium">{lang.name}</span>
                    <span className="text-[13px] text-zinc-400 dark:text-zinc-500">
                      {lang.nativeName}
                    </span>
                    <span className="ml-auto text-xs text-zinc-300 dark:text-zinc-600">
                      {lang.code}
                    </span>
                  </button>
                </li>
              ))}
              {filteredLanguages.length === 0 && (
                <li className="px-3 py-2 text-[13px] text-zinc-400">No languages found</li>
              )}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
