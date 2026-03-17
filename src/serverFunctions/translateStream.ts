import { createServerFn } from "@tanstack/react-start";
import { buildTranslationPrompt } from "~/lib/prompt";
import { DEFAULT_MODEL, fetchOpenAIChatCompletion, LLM_PROVIDER, OLLAMA_URL } from "./llmProvider";

interface TranslateInput {
  text: string;
  sourceLanguage: string;
  targetLanguage: string;
  model?: string;
}

interface OpenAIStreamChunk {
  model?: string;
  choices?: Array<{
    delta?: {
      content?: string;
    };
  }>;
  usage?: {
    completion_tokens?: number;
  };
}

function extractSseData(rawEvent: string): string | null {
  const dataLines = rawEvent
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart());

  if (dataLines.length === 0) {
    return null;
  }

  return dataLines.join("\n");
}

export const translateStream = createServerFn({ method: "POST" })
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
    const prompt = buildTranslationPrompt(data.text, data.sourceLanguage, data.targetLanguage);

    const model = data.model ?? DEFAULT_MODEL;

    if (LLM_PROVIDER === "ollama") {
      const response = await fetch(`${OLLAMA_URL}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          prompt,
          stream: true,
          options: {
            temperature: 0.1,
            num_predict: 4096,
          },
        }),
        signal: AbortSignal.timeout(300_000),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama API error: ${String(response.status)} - ${errorText}`);
      }

      return new Response(response.body, {
        headers: { "Content-Type": "application/x-ndjson" },
      });
    }

    const response = await fetchOpenAIChatCompletion({
      body: {
        model,
        messages: [{ role: "user", content: prompt }],
        stream: true,
        temperature: 0.1,
        max_tokens: 4096,
      },
      signal: AbortSignal.timeout(300_000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${String(response.status)} - ${errorText}`);
    }

    if (!response.body) {
      throw new Error("OpenAI API error: empty response body");
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const reader = response.body.getReader();

    let buffer = "";
    let lastModel: string | undefined;
    let completionTokens: number | undefined;
    let emittedDone = false;

    const ndjsonStream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const emitLine = (payload: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
        };

        const emitDone = () => {
          if (emittedDone) return;
          emittedDone = true;

          const finalLine: Record<string, unknown> = {
            response: "",
            done: true,
            model: lastModel ?? model,
          };

          if (completionTokens !== undefined) {
            finalLine["eval_count"] = completionTokens;
          }

          emitLine(finalLine);
        };

        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");

            let eventBoundary = buffer.indexOf("\n\n");
            while (eventBoundary !== -1) {
              const rawEvent = buffer.slice(0, eventBoundary);
              buffer = buffer.slice(eventBoundary + 2);

              const dataPayload = extractSseData(rawEvent);
              if (!dataPayload) {
                eventBoundary = buffer.indexOf("\n\n");
                continue;
              }

              if (dataPayload === "[DONE]") {
                emitDone();
                eventBoundary = buffer.indexOf("\n\n");
                continue;
              }

              let parsed: OpenAIStreamChunk;
              try {
                parsed = JSON.parse(dataPayload) as OpenAIStreamChunk;
              } catch {
                eventBoundary = buffer.indexOf("\n\n");
                continue;
              }

              if (parsed.model) {
                lastModel = parsed.model;
              }

              if (parsed.usage?.completion_tokens !== undefined) {
                completionTokens = parsed.usage.completion_tokens;
              }

              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                emitLine({ response: content, done: false, model: lastModel ?? model });
              }

              eventBoundary = buffer.indexOf("\n\n");
            }
          }

          if (buffer.trim()) {
            const dataPayload = extractSseData(buffer.trim());
            if (dataPayload && dataPayload !== "[DONE]") {
              try {
                const parsed = JSON.parse(dataPayload) as OpenAIStreamChunk;
                if (parsed.model) {
                  lastModel = parsed.model;
                }
                if (parsed.usage?.completion_tokens !== undefined) {
                  completionTokens = parsed.usage.completion_tokens;
                }
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) {
                  emitLine({ response: content, done: false, model: lastModel ?? model });
                }
              } catch {
                // ignore malformed trailing data
              }
            }
          }

          emitDone();
          controller.close();
        } catch (error) {
          controller.error(error);
        } finally {
          reader.releaseLock();
        }
      },
    });

    return new Response(ndjsonStream, {
      headers: { "Content-Type": "application/x-ndjson" },
    });
  });
