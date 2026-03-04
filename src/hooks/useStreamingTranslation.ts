import { useState, useRef, useCallback } from "react";
import { translateStream } from "~/serverFunctions/translateStream";

interface OllamaStreamLine {
  response?: string;
  done?: boolean;
  model?: string;
  total_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

interface Stats {
  duration?: number;
  tokens?: number;
}

export function useStreamingTranslation() {
  const [translatedText, setTranslatedText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);

  const controllerRef = useRef<AbortController | null>(null);
  const rafRef = useRef<number>(0);

  const abort = useCallback(() => {
    if (controllerRef.current) {
      controllerRef.current.abort();
      controllerRef.current = null;
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    setIsStreaming(false);
  }, []);

  const startTranslation = useCallback(
    (text: string, sourceLanguage: string, targetLanguage: string) => {
      // Abort any in-flight stream
      abort();

      setTranslatedText("");
      setError(null);
      setStats(null);
      setIsStreaming(true);

      const controller = new AbortController();
      controllerRef.current = controller;

      void (async () => {
        try {
          const response = await translateStream({
            data: { text, sourceLanguage, targetLanguage },
            signal: controller.signal,
          });

          if (!response.body) {
            throw new Error("No response body");
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          let accumulated = "";
          let pendingUpdate = false;

          const flushUpdate = () => {
            setTranslatedText(accumulated);
            pendingUpdate = false;
            rafRef.current = 0;
          };

          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            // Process complete NDJSON lines
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed) continue;

              let parsed: OllamaStreamLine;
              try {
                parsed = JSON.parse(trimmed) as OllamaStreamLine;
              } catch {
                continue;
              }

              if (parsed.response) {
                accumulated += parsed.response;
              }

              if (parsed.done) {
                // Extract stats from the final line
                if (parsed.total_duration) {
                  const newStats: Stats = {
                    duration: Math.round(parsed.total_duration / 1_000_000_000),
                  };
                  if (parsed.eval_count !== undefined) {
                    newStats.tokens = parsed.eval_count;
                  }
                  setStats(newStats);
                }
              }
            }

            // Batch UI updates with rAF
            if (!pendingUpdate) {
              pendingUpdate = true;
              rafRef.current = requestAnimationFrame(flushUpdate);
            }
          }

          // Flush any remaining buffer
          if (buffer.trim()) {
            try {
              const parsed = JSON.parse(buffer.trim()) as OllamaStreamLine;
              if (parsed.response) {
                accumulated += parsed.response;
              }
              if (parsed.done && parsed.total_duration) {
                const newStats: Stats = {
                  duration: Math.round(parsed.total_duration / 1_000_000_000),
                };
                if (parsed.eval_count !== undefined) {
                  newStats.tokens = parsed.eval_count;
                }
                setStats(newStats);
              }
            } catch {
              // Ignore malformed trailing data
            }
          }

          // Final flush
          if (pendingUpdate && rafRef.current) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = 0;
          }
          setTranslatedText(accumulated);
          setIsStreaming(false);
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") {
            return; // Expected cancellation
          }
          setError(err instanceof Error ? err.message : "Translation failed");
          setIsStreaming(false);
        }
      })();
    },
    [abort]
  );

  return {
    translatedText,
    setTranslatedText,
    isStreaming,
    error,
    setError,
    stats,
    setStats,
    startTranslation,
    abort,
  };
}
