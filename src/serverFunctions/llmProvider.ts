export type LlmProvider = "ollama" | "openai";

export const LLM_PROVIDER: LlmProvider =
  process.env["LLM_PROVIDER"]?.toLowerCase() === "openai" ? "openai" : "ollama";

export const OLLAMA_URL = (process.env["OLLAMA_URL"] ?? "http://localhost:11434").replace(
  /\/+$/,
  ""
);

export const OPENAI_BASE_URL = (process.env["OPENAI_BASE_URL"] ??
  process.env["OLLAMA_URL"] ??
  "http://localhost:11434"
).replace(/\/+$/, "");

export const OPENAI_API_KEY = process.env["OPENAI_API_KEY"];
export const DEFAULT_MODEL = process.env["DEFAULT_MODEL"] ?? "translategemma:27b";

const OPENAI_CHAT_COMPLETION_PATH = process.env["OPENAI_CHAT_COMPLETION_PATH"];

function buildOpenAIChatCompletionUrls(baseUrl: string): string[] {
  if (OPENAI_CHAT_COMPLETION_PATH && OPENAI_CHAT_COMPLETION_PATH.trim()) {
    const customPath = OPENAI_CHAT_COMPLETION_PATH.startsWith("/")
      ? OPENAI_CHAT_COMPLETION_PATH
      : `/${OPENAI_CHAT_COMPLETION_PATH}`;
    return [`${baseUrl}${customPath}`];
  }

  const normalizedBaseUrl = baseUrl.toLowerCase();
  const defaults =
    normalizedBaseUrl.endsWith("/api") || normalizedBaseUrl.endsWith("/v1")
      ? ["/chat/completions", "/v1/chat/completions"]
      : ["/v1/chat/completions", "/api/v1/chat/completions", "/api/chat/completions", "/chat/completions"];

  return [...new Set(defaults.map((path) => `${baseUrl}${path}`))];
}

interface FetchOpenAIChatCompletionOptions {
  body: unknown;
  signal?: AbortSignal;
}

export async function fetchOpenAIChatCompletion({
  body,
  signal,
}: FetchOpenAIChatCompletionOptions): Promise<Response> {
  const chatCompletionUrls = buildOpenAIChatCompletionUrls(OPENAI_BASE_URL);
  let routingError: string | null = null;

  for (const url of chatCompletionUrls) {
    const attempted = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(OPENAI_API_KEY ? { Authorization: `Bearer ${OPENAI_API_KEY}` } : {}),
      },
      body: JSON.stringify(body),
      signal: signal ?? null,
    });

    if ((attempted.status === 404 || attempted.status === 405) && chatCompletionUrls.length > 1) {
      const errorText = await attempted.text();
      routingError = `${url} -> ${String(attempted.status)} - ${errorText}`;
      continue;
    }

    return attempted;
  }

  throw new Error(
    `OpenAI API error: no compatible chat completions endpoint found under ${OPENAI_BASE_URL}${routingError ? ` (${routingError})` : ""}`
  );
}
