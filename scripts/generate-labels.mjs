/**
 * Generates static translations of all UI labels for every supported language.
 * Calls the configured LLM provider once per language with all labels batched.
 *
 * Usage: node scripts/generate-labels.mjs
 * Output: src/lib/translatedLabels.ts
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

const LLM_PROVIDER = process.env.LLM_PROVIDER?.toLowerCase() === "openai" ? "openai" : "ollama";
const OLLAMA_URL = (process.env.OLLAMA_URL || "http://localhost:11434").replace(/\/+$/, "");
const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL ||
  process.env.OLLAMA_URL ||
  "http://localhost:11434"
).replace(/\/+$/, "");
const OPENAI_CHAT_COMPLETION_PATH = process.env.OPENAI_CHAT_COMPLETION_PATH;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.DEFAULT_MODEL || "translategemma:27b";
const DELIMITER = "\n---\n";

function buildOpenAIChatCompletionUrls(baseUrl) {
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

// Parse DEFAULT_LABELS from the source of truth (labels.ts)
const labelsFile = readFileSync(resolve(projectRoot, "src/lib/labels.ts"), "utf-8");
const labelMatches = [...labelsFile.matchAll(/"([^"]+)":\s*"([^"]+)"/g)];
const LABELS = Object.fromEntries(labelMatches.map(([, key, val]) => [key, val]));

// Read the language list from the source
const langFile = readFileSync(resolve(projectRoot, "src/lib/languages.ts"), "utf-8");
const langMatches = [...langFile.matchAll(/code:\s*"([^"]+)",\s*name:\s*"([^"]+)"/g)];
const languages = langMatches
  .map(([, code, name]) => ({ code, name }))
  .filter((l) => l.code !== "en");

const keys = Object.keys(LABELS);
const texts = Object.values(LABELS);
const combined = texts.join(DELIMITER);

async function translateForLanguage(lang) {
  const prompt = `You are a professional English (en) to ${lang.name} (${lang.code}) translator. Your goal is to accurately convey the meaning and nuances of the original English text while adhering to ${lang.name} grammar, vocabulary, and cultural sensitivities.
Produce only the ${lang.name} translation, without any additional explanations or commentary. Please translate the following English text into ${lang.name}:


${combined}`;

  let translations;

  if (LLM_PROVIDER === "ollama") {
    const response = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        prompt,
        stream: false,
        options: { temperature: 0.1, num_predict: 4096 },
      }),
      signal: AbortSignal.timeout(300_000),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`${lang.code}: HTTP ${response.status} - ${err}`);
    }

    const result = await response.json();
    const content = result?.response;
    if (typeof content !== "string") {
      throw new Error(`${lang.code}: invalid Ollama response`);
    }

    translations = content
      .trim()
      .split(DELIMITER)
      .map((s) => s.trim());
  } else {
    const chatCompletionUrls = buildOpenAIChatCompletionUrls(OPENAI_BASE_URL);
    let response = null;
    let routingError = null;

    for (const url of chatCompletionUrls) {
      const attempted = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(OPENAI_API_KEY ? { Authorization: `Bearer ${OPENAI_API_KEY}` } : {}),
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [{ role: "user", content: prompt }],
          stream: false,
          temperature: 0.1,
          max_tokens: 4096,
        }),
        signal: AbortSignal.timeout(300_000),
      });

      if ((attempted.status === 404 || attempted.status === 405) && chatCompletionUrls.length > 1) {
        const errorText = await attempted.text();
        routingError = `${url} -> ${String(attempted.status)} - ${errorText}`;
        continue;
      }

      response = attempted;
      break;
    }

    if (!response) {
      throw new Error(
        `${lang.code}: no compatible chat completions endpoint found under ${OPENAI_BASE_URL}${routingError ? ` (${routingError})` : ""}`
      );
    }

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`${lang.code}: HTTP ${response.status} - ${err}`);
    }

    const result = await response.json();
    const content = result?.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new Error(`${lang.code}: invalid OpenAI-compatible response`);
    }

    translations = content
      .trim()
      .split(DELIMITER)
      .map((s) => s.trim());
  }

  // Build label map, falling back to English if delimiter parsing failed
  const map = {};
  keys.forEach((key, i) => {
    const t = translations[i]?.trim();
    if (t) map[key] = t;
  });

  return map;
}

async function main() {
  const results = {};
  let done = 0;

  for (const lang of languages) {
    process.stdout.write(`[${done + 1}/${languages.length}] ${lang.code} (${lang.name})... `);
    try {
      const map = await translateForLanguage(lang);
      const translated = Object.keys(map).length;
      if (translated === keys.length) {
        results[lang.code] = map;
        console.log(`OK (${translated}/${keys.length})`);
      } else {
        console.log(`PARTIAL (${translated}/${keys.length} — skipping)`);
      }
    } catch (err) {
      console.log(`FAILED: ${err.message}`);
    }
    done++;
  }

  // Generate TypeScript file
  const output = `// Auto-generated by scripts/generate-labels.mjs — do not edit manually.
// Re-run: node scripts/generate-labels.mjs

import type { Labels } from "./labels";

export const translatedLabels: Partial<Record<string, Labels>> = ${JSON.stringify(results, null, 2)};
`;

  const outPath = resolve(projectRoot, "src/lib/translatedLabels.ts");
  writeFileSync(outPath, output, "utf-8");
  console.log(`\nWrote ${Object.keys(results).length} locales to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
