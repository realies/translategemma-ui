import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { languages, getLanguageName, VALID_LANGUAGE_CODES } from "~/lib/languages";

const MAX_RECENTS = 4;

interface LanguageSelectorProps {
  value: string;
  onChange: (code: string) => void;
  excludeCode?: string;
  storageKey: string;
  defaultRecents: string[];
}

function loadRecents(storageKey: string, defaults: string[]): string[] {
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

function saveRecents(storageKey: string, recents: string[]) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(recents));
  } catch {
    // ignore
  }
}

function addToRecents(recents: string[], code: string): string[] {
  if (!VALID_LANGUAGE_CODES.has(code)) return recents;
  const filtered = recents.filter((c) => c !== code);
  return [code, ...filtered].slice(0, MAX_RECENTS);
}

export function LanguageSelector({
  value,
  onChange,
  excludeCode,
  storageKey,
  defaultRecents,
}: LanguageSelectorProps) {
  const [recents, setRecents] = useState<string[]>(() =>
    loadRecents(storageKey, defaultRecents)
  );
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const listRef = useRef<HTMLUListElement>(null);

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
      const next = addToRecents(recents, code);
      setRecents(next);
      saveRecents(storageKey, next);
      close();
    },
    [recents, onChange, storageKey, close]
  );

  // Keep value in recents when it changes externally (e.g. swap)
  useEffect(() => {
    if (!value || !VALID_LANGUAGE_CODES.has(value)) return;
    setRecents((prev) => {
      const next = addToRecents(prev, value);
      saveRecents(storageKey, next);
      return next;
    });
  }, [value, storageKey]);

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

  return (
    <div className="relative w-full min-w-0">
      <div className="flex min-w-0 items-center gap-1">
        {/* Narrow: active language pill */}
        <button
          type="button"
          onClick={() => {
            setIsOpen(true);
          }}
          className="flex-1 truncate rounded-full bg-zinc-200 px-3 py-1.5 text-left text-sm font-medium text-zinc-800 md:hidden dark:bg-zinc-700 dark:text-zinc-100"
          aria-label="Select language"
        >
          {selectedName}
        </button>

        {/* Wide: recent language pills — flex-1 pushes search icon to the right */}
        <div className="hidden min-w-0 flex-1 items-center gap-1 overflow-hidden md:flex">
          {visibleTabs.map((code) => {
            const isActive = code === value;
            return (
              <button
                key={code}
                type="button"
                onClick={() => {
                  select(code);
                }}
                className={`rounded-full px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors ${
                  isActive
                    ? "bg-zinc-200 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-100"
                    : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                }`}
              >
                {getLanguageName(code)}
              </button>
            );
          })}
        </div>

        {/* Search icon — always at right end */}
        <button
          type="button"
          onClick={() => {
            setIsOpen(true);
          }}
          aria-label="Search languages"
          className="shrink-0 rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
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

      {/* Dropdown — full width of column, aligned below */}
      {isOpen && (
        <>
          <div
            data-testid="language-selector-overlay"
            className="fixed inset-0 z-10"
            onClick={() => {
              close();
            }}
          />
          <div className="absolute top-full left-0 z-20 mt-2 w-full min-w-64 rounded-lg border border-zinc-100 bg-white shadow-lg dark:border-zinc-800 dark:bg-zinc-800">
            <div className="p-2">
              <input
                type="text"
                placeholder="Search languages..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                }}
                onKeyDown={handleKeyDown}
                aria-label="Search languages"
                className="w-full rounded-md border border-zinc-100 bg-zinc-50 px-3 py-2 text-sm focus:outline-none dark:border-zinc-600 dark:bg-zinc-700"
                autoFocus
              />
            </div>
            <ul ref={listRef} className="max-h-60 overflow-auto py-1" role="listbox">
              {filteredLanguages.map((lang, index) => (
                <li key={lang.code} role="option" aria-selected={lang.code === value}>
                  <button
                    type="button"
                    onClick={() => {
                      select(lang.code);
                    }}
                    className={`flex w-full items-center gap-2 px-4 py-2 text-left transition-colors ${
                      index === focusedIndex
                        ? "bg-zinc-200 dark:bg-zinc-600"
                        : "hover:bg-zinc-100 dark:hover:bg-zinc-700"
                    }`}
                  >
                    <span className="font-medium">{lang.name}</span>
                    <span className="text-sm text-zinc-500 dark:text-zinc-400">
                      {lang.nativeName}
                    </span>
                    <span className="ml-auto text-xs text-zinc-400">{lang.code}</span>
                  </button>
                </li>
              ))}
              {filteredLanguages.length === 0 && (
                <li className="px-4 py-2 text-sm text-zinc-500">No languages found</li>
              )}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
