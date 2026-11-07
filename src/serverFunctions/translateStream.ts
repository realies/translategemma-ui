import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { detectLanguage } from "~/languageDetector";
import { AUTO_DETECT, DETECTED_LANGUAGE_HEADER, VALID_LANGUAGE_CODES } from "~/lib/languages";
import { buildTranslationPrompt } from "~/lib/prompt";

const OLLAMA_URL = process.env["OLLAMA_URL"] ?? "http://localhost:11434";
const DEFAULT_MODEL = process.env["DEFAULT_MODEL"] ?? "translategemma:27b";

interface TranslateInput {
  text: string;
  sourceLanguage: string;
  targetLanguage: string;
  model?: string;
}

export const translateStream = createServerFn({ method: "POST" })
  .validator((data: unknown): TranslateInput => {
    if (typeof data !== "object" || data === null) {
      throw new Error("Invalid input");
    }

    const input = data as Record<string, unknown>;

    if (typeof input["text"] !== "string" || input["text"].trim() === "") {
      throw new Error("Text is required");
    }

    if (typeof input["sourceLanguage"] !== "string" || input["sourceLanguage"].trim() === "") {
      throw new Error("Source language is required");
    }

    if (typeof input["targetLanguage"] !== "string" || input["targetLanguage"].trim() === "") {
      throw new Error("Target language is required");
    }

    const result: TranslateInput = {
      text: input["text"],
      sourceLanguage: input["sourceLanguage"].trim(),
      targetLanguage: input["targetLanguage"].trim(),
    };

    if (result.sourceLanguage !== AUTO_DETECT && !VALID_LANGUAGE_CODES.has(result.sourceLanguage)) {
      throw new Error("Unsupported source language");
    }

    if (!VALID_LANGUAGE_CODES.has(result.targetLanguage)) {
      throw new Error("Unsupported target language");
    }

    if (typeof input["model"] === "string") {
      result.model = input["model"];
    }

    return result;
  })
  .handler(async ({ data }) => {
    // Aborts when the client cancels (new text, cleared input) or disconnects.
    const { signal } = getRequest();
    const detected = data.sourceLanguage === AUTO_DETECT ? await detectLanguage(data.text) : null;
    signal.throwIfAborted(); // cancelled during detection: don't queue work on Ollama
    const prompt = buildTranslationPrompt(
      data.text,
      detected ?? data.sourceLanguage,
      data.targetLanguage
    );

    const response = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: data.model ?? DEFAULT_MODEL,
        prompt,
        stream: true,
        options: {
          temperature: 0.1,
          num_predict: 4096,
        },
      }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(300_000)]),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama API error: ${String(response.status)} - ${errorText}`);
    }

    return new Response(response.body, {
      headers: {
        "Content-Type": "application/x-ndjson",
        ...(detected && { [DETECTED_LANGUAGE_HEADER]: detected }),
      },
    });
  });
