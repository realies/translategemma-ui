import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { LanguageSelector } from "./LanguageSelector";
import { translate } from "~/serverFunctions/translate";
import { VALID_LANGUAGE_CODES } from "~/lib/languages";

const DEFAULT_SOURCE_RECENTS = ["en", "fr_FR", "de_DE", "es_MX"] as const;
const DEFAULT_TARGET_RECENTS = ["fr_FR", "de_DE", "es_MX", "ja_JP"] as const;

const srcLang = localStorage.getItem("srcLang") ?? "";
const src = VALID_LANGUAGE_CODES.has(srcLang) ? srcLang : DEFAULT_SOURCE_RECENTS[0];
const tgtLang = localStorage.getItem("tgtLang") ?? "";
const tgt = VALID_LANGUAGE_CODES.has(tgtLang) ? tgtLang : DEFAULT_TARGET_RECENTS[0];

function setLocalStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // localStorage unavailable (e.g. private browsing with strict settings)
  }
}

export function TranslationPanel() {
  const [sourceText, setSourceText] = useState("");
  const [translatedText, setTranslatedText] = useState("");

  // Stable array refs for defaultRecents so LanguageSelector's mount-only useEffect doesn't re-run every render.
  const sourceDefaultRecents = useMemo(() => [...DEFAULT_SOURCE_RECENTS], []);
  const targetDefaultRecents = useMemo(() => [...DEFAULT_TARGET_RECENTS], []);

  const [sourceLanguage, setSourceLanguage] = useState<string>(src);
  const [targetLanguage, setTargetLanguage] = useState<string>(tgt);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<{
    duration?: number;
    tokens?: number;
  } | null>(null);

  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Track request ID to ignore stale responses
  const requestIdRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelPendingRequest = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    requestIdRef.current += 1;
    setIsLoading(false);
  }, []);

  const handleTranslate = useCallback(async () => {
    if (!sourceText.trim() || !targetLanguage) return;

    // Cancel any pending debounce and start a new request
    if (debounceRef.current) clearTimeout(debounceRef.current);
    requestIdRef.current += 1;
    const currentRequestId = requestIdRef.current;

    setIsLoading(true);
    setError(null);
    setTranslatedText("");
    setStats(null);

    try {
      const result = await translate({
        data: {
          text: sourceText,
          sourceLanguage,
          targetLanguage,
        },
      });

      // Ignore result if a newer request was started or request was cancelled
      if (requestIdRef.current !== currentRequestId) return;

      setTranslatedText(result.translation);

      if (result.stats.totalDuration) {
        const newStats: { duration: number; tokens?: number } = {
          duration: Math.round(result.stats.totalDuration / 1_000_000_000),
        };
        if (result.stats.evalCount !== undefined) {
          newStats.tokens = result.stats.evalCount;
        }
        setStats(newStats);
      }
    } catch (err) {
      // Ignore errors from stale requests
      if (requestIdRef.current !== currentRequestId) return;
      setError(err instanceof Error ? err.message : "Translation failed");
    } finally {
      // Only update loading state if this is still the current request
      if (requestIdRef.current === currentRequestId) {
        setIsLoading(false);
      }
    }
  }, [sourceText, sourceLanguage, targetLanguage]);

  const handleSwapLanguages = useCallback(() => {
    if (!targetLanguage) return;
    cancelPendingRequest();
    setSourceLanguage(targetLanguage);
    setTargetLanguage(sourceLanguage);
    setLocalStorage("srcLang", targetLanguage);
    setLocalStorage("tgtLang", sourceLanguage);
    setSourceText(translatedText);
    setTranslatedText(sourceText);
    setError(null);
    setStats(null);
  }, [sourceLanguage, targetLanguage, sourceText, translatedText, cancelPendingRequest]);

  const handleClear = useCallback(() => {
    cancelPendingRequest();
    setSourceText("");
    setTranslatedText("");
    setError(null);
    setStats(null);
  }, [cancelPendingRequest]);

  // Global Cmd/Ctrl+Enter shortcut to trigger translation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        void handleTranslate();
      }
    };
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
    };
  }, [handleTranslate]);

  // Debounced auto-translate on text change (500ms).
  // handleTranslate is intentionally omitted — it changes on every sourceText
  // update, which would reset the debounce timer on each keystroke.
  useEffect(() => {
    if (!sourceText.trim() || !targetLanguage) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void handleTranslate();
    }, 500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [sourceText]);

  // Immediate auto-translate on language change (if text exists).
  // handleTranslate and sourceText are intentionally omitted — including them
  // would duplicate the debounced effect above on every keystroke.
  useEffect(() => {
    if (!sourceText.trim() || !targetLanguage) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    void handleTranslate();
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
    <div className="mx-auto w-full max-w-5xl">
      {/* Language selectors */}
      <div className="mb-4 flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <LanguageSelector
            value={sourceLanguage}
            onChange={(code) => {
              setSourceLanguage(code);
              setLocalStorage("srcLang", code);
            }}
            excludeCode={targetLanguage}
            storageKey="srcRecents"
            defaultRecents={sourceDefaultRecents}
          />
        </div>

        <button
          type="button"
          onClick={handleSwapLanguages}
          className="rounded-full p-2 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
          title="Swap languages"
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
              setTargetLanguage(code);
              setLocalStorage("tgtLang", code);
            }}
            excludeCode={sourceLanguage}
            storageKey="tgtRecents"
            defaultRecents={targetDefaultRecents}
          />
        </div>
      </div>

      {/* Text areas */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Source text */}
        <div className="flex flex-col rounded-lg border border-zinc-100 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-800">
          <textarea
            ref={textareaRef}
            value={sourceText}
            onChange={(e) => {
              setSourceText(e.target.value);
            }}
            placeholder="Enter text to translate..."
            className="min-h-48 w-full resize-none overflow-hidden bg-transparent p-4 text-lg focus:outline-none"
          />
          <div className="flex h-10 items-center justify-end gap-2 border-t border-zinc-100 px-3 dark:border-zinc-800">
            <button
              type="button"
              onClick={handleClear}
              className={`rounded-md p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-700 dark:hover:text-zinc-300 ${!sourceText ? "invisible" : ""}`}
              title="Clear"
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
            <span className="text-sm text-zinc-400">{sourceText.length} chars</span>
          </div>
        </div>

        {/* Translated text */}
        <div className="flex flex-col rounded-lg border border-zinc-100 bg-zinc-50 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div
            className={`min-h-48 flex-1 p-4 text-lg whitespace-pre-wrap ${
              isLoading ? "streaming-cursor" : ""
            }`}
          >
            {error ? (
              <span className="text-red-500">{error}</span>
            ) : translatedText ? (
              translatedText
            ) : isLoading ? (
              <span className="text-zinc-400">Translating...</span>
            ) : (
              <span className="text-zinc-400">Translation will appear here</span>
            )}
          </div>
          <div className="flex h-10 items-center justify-end gap-2 border-t border-zinc-100 px-3 dark:border-zinc-800">
            <button
              type="button"
              onClick={handleCopy}
              className={`rounded-md p-1 transition-colors ${copied ? "text-green-500" : "text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-700 dark:hover:text-zinc-300"} ${!translatedText ? "invisible" : ""}`}
              title={copied ? "Copied!" : "Copy to clipboard"}
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
              <span className="text-xs text-zinc-400">
                {stats.duration}s{stats.tokens !== undefined && ` • ${String(stats.tokens)} tokens`}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
