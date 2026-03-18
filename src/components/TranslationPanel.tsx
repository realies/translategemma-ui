import { useState, useCallback, useRef, useEffect, useLayoutEffect } from "react";
import { LanguageSelector, loadRecents, addToRecents, saveRecents } from "./LanguageSelector";
import { useStreamingTranslation } from "~/hooks/useStreamingTranslation";
import { VALID_LANGUAGE_CODES } from "~/lib/languages";
import { useLabel } from "~/context/LabelContext";

/** Default recent language codes; exported for tests. */
export const DEFAULT_SOURCE_RECENTS = ["en", "fr_FR", "de_DE", "es_MX"] as const;
export const DEFAULT_TARGET_RECENTS = ["fr_FR", "de_DE", "es_MX", "ja_JP"] as const;

function setLocalStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // localStorage unavailable (e.g. private browsing with strict settings)
  }
}

export function TranslationPanel() {
  const placeholderSource = useLabel("placeholder.source");
  const titleSwap = useLabel("title.swap");
  const titleClear = useLabel("title.clear");
  const emptyTranslation = useLabel("empty.translation");
  const labelChars = useLabel("label.chars");
  const titleCopy = useLabel("title.copy");
  const titleCopied = useLabel("title.copied");

  const {
    translatedText,
    setTranslatedText,
    error,
    setError,
    stats,
    setStats,
    startTranslation,
    abort,
  } = useStreamingTranslation();

  const [hydrated, setHydrated] = useState(false);
  const [sourceText, setSourceText] = useState("");

  const [languageState, setLanguageState] = useState<{
    sourceLanguage: string;
    targetLanguage: string;
    sourceRecents: string[];
    targetRecents: string[];
  }>({
    sourceLanguage: DEFAULT_SOURCE_RECENTS[0],
    targetLanguage: DEFAULT_TARGET_RECENTS[0],
    sourceRecents: [...DEFAULT_SOURCE_RECENTS],
    targetRecents: [...DEFAULT_TARGET_RECENTS],
  });
  const { sourceLanguage, targetLanguage, sourceRecents, targetRecents } = languageState;

  useLayoutEffect(() => {
    try {
      const storedSrc = localStorage.getItem("srcLang");
      const storedTgt = localStorage.getItem("tgtLang");
      const src =
        storedSrc && VALID_LANGUAGE_CODES.has(storedSrc) ? storedSrc : DEFAULT_SOURCE_RECENTS[0];
      const tgt =
        storedTgt && VALID_LANGUAGE_CODES.has(storedTgt) ? storedTgt : DEFAULT_TARGET_RECENTS[0];
      const loadedSourceRecents = loadRecents("srcRecents", [...DEFAULT_SOURCE_RECENTS]);
      const loadedTargetRecents = loadRecents("tgtRecents", [...DEFAULT_TARGET_RECENTS]);
      // Ensure selected language is present in recents (without reordering if already there)
      setLanguageState({
        sourceLanguage: src,
        targetLanguage: tgt,
        sourceRecents: loadedSourceRecents.includes(src)
          ? loadedSourceRecents
          : addToRecents(loadedSourceRecents, src),
        targetRecents: loadedTargetRecents.includes(tgt)
          ? loadedTargetRecents
          : addToRecents(loadedTargetRecents, tgt),
      });
      // Set isWideView in same tick so we don't get an extra render from the matchMedia useEffect
      const mql = window.matchMedia("(min-width: 768px)");
      setIsWideView(mql.matches);
    } catch {
      // Keep defaults
    }
    setHydrated(true);
  }, []);

  const setSourceLanguage = useCallback((code: string) => {
    setLanguageState((prev) => ({ ...prev, sourceLanguage: code }));
  }, []);
  const setTargetLanguage = useCallback((code: string) => {
    setLanguageState((prev) => ({ ...prev, targetLanguage: code }));
  }, []);
  const setSourceRecents = useCallback((next: string[]) => {
    setLanguageState((prev) => ({ ...prev, sourceRecents: next }));
  }, []);
  const setTargetRecents = useCallback((next: string[]) => {
    setLanguageState((prev) => ({ ...prev, targetRecents: next }));
  }, []);
  // Add language to recents only when it's not already present (e.g. swap brings in a new one);
  // never reorder existing recents — tab row stays stable for the sliding highlight.
  useEffect(() => {
    if (
      !sourceLanguage ||
      !VALID_LANGUAGE_CODES.has(sourceLanguage) ||
      sourceRecents.includes(sourceLanguage)
    )
      return;
    setLanguageState((prev) => {
      const next = addToRecents(prev.sourceRecents, sourceLanguage);
      saveRecents("srcRecents", next);
      return { ...prev, sourceRecents: next };
    });
  }, [sourceLanguage, sourceRecents]);
  useEffect(() => {
    if (
      !targetLanguage ||
      !VALID_LANGUAGE_CODES.has(targetLanguage) ||
      targetRecents.includes(targetLanguage)
    )
      return;
    setLanguageState((prev) => {
      const next = addToRecents(prev.targetRecents, targetLanguage);
      saveRecents("tgtRecents", next);
      return { ...prev, targetRecents: next };
    });
  }, [targetLanguage, targetRecents]);

  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sourcePanelRef = useRef<HTMLDivElement>(null);
  const targetPanelRef = useRef<HTMLDivElement>(null);
  const languageRowRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const [isWideView, setIsWideView] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 768px)");
    const update = () => {
      setIsWideView(mql.matches);
    };
    update();
    mql.addEventListener("change", update);
    return () => {
      mql.removeEventListener("change", update);
    };
  }, []);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSwapLanguages = useCallback(() => {
    if (!targetLanguage) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    abort();
    setSourceLanguage(targetLanguage);
    setTargetLanguage(sourceLanguage);
    setLocalStorage("srcLang", targetLanguage);
    setLocalStorage("tgtLang", sourceLanguage);
    setSourceText(translatedText);
    setTranslatedText(sourceText);
    setError(null);
    setStats(null);
  }, [
    sourceLanguage,
    targetLanguage,
    sourceText,
    translatedText,
    abort,
    setTranslatedText,
    setError,
    setStats,
  ]);

  const handleClear = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    abort();
    setSourceText("");
    setTranslatedText("");
    setError(null);
    setStats(null);
  }, [abort, setTranslatedText, setError, setStats]);

  // Debounced auto-translate on text change (500ms).
  // startTranslation/sourceLanguage/targetLanguage are intentionally omitted —
  // including them would reset the debounce timer on each keystroke.
  useEffect(() => {
    if (!sourceText.trim() || !targetLanguage) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abort();
      setTranslatedText("");
      setError(null);
      setStats(null);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      startTranslation(sourceText, sourceLanguage, targetLanguage);
    }, 500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [sourceText]);

  // Immediate auto-translate on language change (if text exists).
  // startTranslation and sourceText are intentionally omitted — including them
  // would duplicate the debounced effect above on every keystroke.
  useEffect(() => {
    if (!sourceText.trim() || !targetLanguage) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    startTranslation(sourceText, sourceLanguage, targetLanguage);
  }, [sourceLanguage, targetLanguage]);

  // Auto-resize textarea height based on content
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "0";
      el.style.height = `${Math.max(192, el.scrollHeight).toString()}px`;
    }
  }, [sourceText]);

  const handleCopy = useCallback(async () => {
    if (translatedText) {
      try {
        await navigator.clipboard.writeText(translatedText);
        setCopied(true);
        if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
        copyTimeoutRef.current = setTimeout(() => {
          setCopied(false);
        }, 2000);
      } catch {
        // Clipboard access may fail in insecure contexts
      }
    }
  }, [translatedText]);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  return (
    <div
      className="mx-auto w-full max-w-5xl transition-opacity duration-300 ease-out"
      style={{ opacity: hydrated ? 1 : 0 }}
    >
      <div ref={languageRowRef} className="mb-3 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <LanguageSelector
            value={sourceLanguage}
            onChange={(code) => {
              if (code === targetLanguage) {
                if (debounceRef.current) clearTimeout(debounceRef.current);
                abort();
                setError(null);
                setStats(null);
                setTargetLanguage(sourceLanguage);
                setLocalStorage("tgtLang", sourceLanguage);
                setSourceText(translatedText);
                setTranslatedText(sourceText);
              }
              setSourceLanguage(code);
              setLocalStorage("srcLang", code);
            }}
            recents={sourceRecents}
            onRecentsChange={(next) => {
              setSourceRecents(next);
              saveRecents("srcRecents", next);
            }}
            dropdownAnchorRef={isWideView ? sourcePanelRef : languageRowRef}
            dropdownEndRef={isWideView ? undefined : gridRef}
          />
        </div>

        <button
          type="button"
          onClick={handleSwapLanguages}
          className="rounded-full p-2 text-zinc-300 transition-colors hover:bg-zinc-100 hover:text-zinc-500 dark:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-400"
          title={titleSwap}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
            />
          </svg>
        </button>

        <div className="min-w-0 flex-1">
          <LanguageSelector
            value={targetLanguage}
            onChange={(code) => {
              if (code === sourceLanguage) {
                if (debounceRef.current) clearTimeout(debounceRef.current);
                abort();
                setError(null);
                setStats(null);
                setSourceLanguage(targetLanguage);
                setLocalStorage("srcLang", targetLanguage);
                setSourceText(translatedText);
                setTranslatedText(sourceText);
              }
              setTargetLanguage(code);
              setLocalStorage("tgtLang", code);
            }}
            recents={targetRecents}
            onRecentsChange={(next) => {
              setTargetRecents(next);
              saveRecents("tgtRecents", next);
            }}
            dropdownAnchorRef={isWideView ? targetPanelRef : languageRowRef}
            dropdownEndRef={isWideView ? undefined : gridRef}
          />
        </div>
      </div>

      {/* Text areas */}
      <div ref={gridRef} className="grid gap-3 md:grid-cols-2">
        {/* Source text */}
        <div
          ref={sourcePanelRef}
          className="flex flex-col rounded-2xl bg-white shadow-sm dark:bg-zinc-800"
        >
          <textarea
            ref={textareaRef}
            value={sourceText}
            onChange={(e) => {
              setSourceText(e.target.value);
            }}
            placeholder={placeholderSource}
            className="min-h-48 w-full resize-none overflow-hidden bg-transparent p-5 text-lg focus:outline-none"
          />
          <div className="mt-auto flex h-10 items-center justify-end gap-3 px-4">
            <button
              type="button"
              onClick={handleClear}
              className={`rounded-full p-1 text-zinc-300 transition-colors hover:bg-zinc-100 hover:text-zinc-500 dark:text-zinc-600 dark:hover:bg-zinc-700 dark:hover:text-zinc-400 ${!sourceText ? "invisible" : ""}`}
              title={titleClear}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
            <span className="text-xs text-zinc-300 dark:text-zinc-600">
              {sourceText.length} {labelChars}
            </span>
          </div>
        </div>

        {/* Translated text */}
        <div
          ref={targetPanelRef}
          className="flex flex-col rounded-2xl bg-zinc-50 shadow-sm dark:bg-zinc-900"
        >
          <div className="min-h-48 flex-1 p-5 text-lg whitespace-pre-wrap">
            {error ? (
              <span className="text-red-500">{error}</span>
            ) : translatedText ? (
              translatedText
            ) : (
              <span className="text-zinc-300 dark:text-zinc-600">{emptyTranslation}</span>
            )}
          </div>
          <div className="flex h-10 items-center justify-end gap-3 px-4">
            <button
              type="button"
              onClick={handleCopy}
              className={`rounded-full p-1 transition-colors ${copied ? "text-green-500" : "text-zinc-300 hover:bg-zinc-100 hover:text-zinc-500 dark:text-zinc-600 dark:hover:bg-zinc-700 dark:hover:text-zinc-400"} ${!translatedText ? "invisible" : ""}`}
              title={copied ? titleCopied : titleCopy}
            >
              {copied ? (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              ) : (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
              )}
            </button>
            {stats && (
              <span className="text-xs text-zinc-300 dark:text-zinc-600">
                {stats.duration !== undefined && `${String(stats.duration)}s`}
                {stats.duration !== undefined && stats.tokens !== undefined && " · "}
                {stats.tokens !== undefined && `${String(stats.tokens)} tokens`}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
