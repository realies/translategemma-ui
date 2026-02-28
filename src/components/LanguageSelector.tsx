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
      const height = Math.max(Math.min(spaceAbove, maxHeight), 0);
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
      height: Math.max(Math.min(spaceBelow, maxHeight), 0),
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
  recents,
  onRecentsChange,
  dropdownAnchorRef,
}: LanguageSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const tabContainerRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [highlightStyle, setHighlightStyle] = useState<{
    left: number;
    width: number;
  } | null>(null);

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
    window.addEventListener("scroll", measure, { capture: true, passive: true });
    window.addEventListener("resize", measure, { passive: true });
    return () => {
      window.removeEventListener("scroll", measure, { capture: true });
      window.removeEventListener("resize", measure);
    };
  }, [useAnchor, dropdownAnchorRef]);

  // Measure active tab position for sliding highlight
  const measureHighlight = useCallback(() => {
    const container = tabContainerRef.current;
    const activeTab = tabRefs.current.get(value);
    if (!container || !activeTab) {
      setHighlightStyle(null);
      return;
    }
    const containerRect = container.getBoundingClientRect();
    const tabRect = activeTab.getBoundingClientRect();
    setHighlightStyle({
      left: tabRect.left - containerRect.left,
      width: tabRect.width,
    });
  }, [value]);

  useLayoutEffect(() => {
    measureHighlight();
  }, [measureHighlight, recents]);

  // Remeasure highlight on resize so it stays aligned
  useEffect(() => {
    window.addEventListener("resize", measureHighlight, { passive: true });
    return () => {
      window.removeEventListener("resize", measureHighlight);
    };
  }, [measureHighlight]);

  const visibleTabs = useMemo(() => recents.slice(0, MAX_RECENTS), [recents]);

  // Track which tabs are newly added (for enter animation)
  const prevVisibleTabsRef = useRef<string[] | null>(null);
  const newTabCodes = useMemo(() => {
    if (prevVisibleTabsRef.current === null) return new Set<string>();
    const prevSet = new Set(prevVisibleTabsRef.current);
    return new Set(visibleTabs.filter((code) => !prevSet.has(code)));
  }, [visibleTabs]);

  useEffect(() => {
    prevVisibleTabsRef.current = visibleTabs;
  }, [visibleTabs]);

  const filteredLanguages = useMemo(
    () =>
      languages.filter(
        (lang) =>
          lang.name.toLowerCase().includes(search.toLowerCase()) ||
          lang.nativeName.toLowerCase().includes(search.toLowerCase()) ||
          lang.code.toLowerCase().includes(search.toLowerCase())
      ),
    [search]
  );

  const close = useCallback(() => {
    setIsOpen(false);
    setSearch("");
    setFocusedIndex(-1);
  }, []);

  const select = useCallback(
    (code: string) => {
      onChange(code);
      // Only reorder recents when picking a new language (not already in visible tabs)
      // so the tab row stays stable for the sliding highlight animation
      if (!recents.includes(code)) {
        onRecentsChange(addToRecents(recents, code));
      }
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
      {/* Unified pill container — mobile shows only selected language; wide shows recent tabs */}
      <div
        className={`flex min-w-0 items-center overflow-hidden rounded-2xl transition-colors ${
          isOpen ? "bg-zinc-200 dark:bg-zinc-700" : "bg-zinc-100 dark:bg-zinc-800"
        }`}
      >
        {/* Mobile: single selected language */}
        <button
          type="button"
          onClick={() => {
            setIsOpen(true);
          }}
          className="flex min-w-0 flex-1 items-center py-2 pr-1 pl-3.5 text-left text-[13px] font-medium text-zinc-700 md:hidden dark:text-zinc-200"
          aria-label="Select language"
          aria-expanded={isOpen}
        >
          <span className="truncate">{selectedName}</span>
        </button>

        {/* Wide: recent language tabs with sliding highlight */}
        <div
          ref={tabContainerRef}
          className="relative hidden min-w-0 flex-1 items-center overflow-hidden [mask-image:linear-gradient(to_right,black_0,black_calc(100%-1.5rem),transparent_100%)] [-webkit-mask-image:linear-gradient(to_right,black_0,black_calc(100%-1.5rem),transparent_100%)] md:flex"
        >
          {/* Sliding highlight behind active tab */}
          {highlightStyle && (
            <div
              className="absolute top-0 bottom-0 rounded-2xl bg-white/50 transition-[left,width] duration-300 ease-in-out dark:bg-zinc-600/50"
              style={{
                left: highlightStyle.left,
                width: highlightStyle.width,
              }}
            />
          )}
          {visibleTabs.map((code) => {
            const isActive = code === value;
            const isNew = newTabCodes.has(code);
            return (
              <button
                key={code}
                ref={(el) => {
                  if (el) {
                    tabRefs.current.set(code, el);
                  } else {
                    tabRefs.current.delete(code);
                  }
                }}
                type="button"
                onClick={() => {
                  select(code);
                }}
                onAnimationEnd={isNew ? measureHighlight : undefined}
                className={`relative z-10 rounded-2xl px-3.5 py-2 text-[13px] font-medium whitespace-nowrap transition-colors ${
                  isNew ? "pill-enter" : ""
                } ${
                  isActive
                    ? "text-zinc-800 dark:text-zinc-100"
                    : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                }`}
              >
                {getLanguageName(code)}
              </button>
            );
          })}
        </div>

        {/* Search icon — always visible, right-aligned inside the pill */}
        <button
          type="button"
          onClick={() => {
            setIsOpen(true);
          }}
          aria-label="Search languages"
          className="mr-1 shrink-0 rounded-full p-2 text-zinc-400 transition-colors hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
            style={dropdownStyle}
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
