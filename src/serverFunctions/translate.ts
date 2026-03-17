import { createServerFn } from "@tanstack/react-start";
import { buildTranslationPrompt } from "~/lib/prompt";
import { DEFAULT_MODEL, fetchOpenAIChatCompletion, LLM_PROVIDER, OLLAMA_URL } from "./llmProvider";

interface TranslateInput {
  text: string;
  sourceLanguage: string;
  targetLanguage: string;
  model?: string;
}

interface OpenAIChatCompletionRequest {
  model: string;
  messages: Array<{
    role: "user";
    content: string;
  }>;
  stream: boolean;
  temperature?: number;
  max_tokens?: number;
}

interface OpenAIChatCompletionResponse {
  model?: string;
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  usage?: {
    completion_tokens?: number;
  };
}

interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  stream: boolean;
  options?: {
    temperature?: number;
    num_predict?: number;
  };
}

interface OllamaGenerateResponse {
  model?: string;
  response?: string;
  total_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

export const translate = createServerFn({ method: "POST" })
  .inputValidator((data: unknown): TranslateInput => {
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

    if (typeof input["model"] === "string") {
      result.model = input["model"];
    }

    return result;
  })
  .handler(async ({ data }) => {
    const model = data.model ?? DEFAULT_MODEL;
    const prompt = buildTranslationPrompt(data.text, data.sourceLanguage, data.targetLanguage);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 300000); // 5 minute timeout

    if (LLM_PROVIDER === "ollama") {
      const requestBody: OllamaGenerateRequest = {
        model,
        prompt,
        stream: false,
        options: {
          temperature: 0.1,
          num_predict: 4096,
        },
      };

      let response: Response;
      try {
        response = await fetch(`${OLLAMA_URL}/api/generate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama API error: ${String(response.status)} - ${errorText}`);
      }

      const result = (await response.json()) as OllamaGenerateResponse;
      const translation = result.response?.trim();
      if (!translation) {
        throw new Error("Ollama API error: empty response content");
      }

      return {
        translation,
        model: result.model ?? model,
        stats: {
          totalDuration: result.total_duration,
          evalCount: result.eval_count,
          evalDuration: result.eval_duration,
        },
      };
    }

    const requestBody: OpenAIChatCompletionRequest = {
      model,
      messages: [{ role: "user", content: prompt }],
      stream: false,
      temperature: 0.1,
      max_tokens: 4096,
    };

    let response: Response;
    try {
      response = await fetchOpenAIChatCompletion({
        body: requestBody,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${String(response.status)} - ${errorText}`);
    }

    const result = (await response.json()) as OpenAIChatCompletionResponse;
    const translation = result.choices?.[0]?.message?.content?.trim();

    if (!translation) {
      throw new Error("OpenAI API error: empty response content");
    }

    return {
      translation,
      model: result.model ?? model,
      stats: {
        totalDuration: undefined,
        evalCount: result.usage?.completion_tokens,
        evalDuration: undefined,
      },
    };
  });
