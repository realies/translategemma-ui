/**
 * Smoke test for source-language auto-detection through the real app path: one auto-detect
 * request to the running production server's translateStream server function, answered by a
 * fake Ollama that this script hosts. Checks the X-Detected-Language header and the prompt.
 *
 * Usage (from the app directory, server started with OLLAMA_URL=http://127.0.0.1:11435):
 *   node scripts/detector-smoke.mjs [serverUrl]
 * CI pipes it into the Docker container: docker exec -i <c> node --input-type=module - < this file
 */

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { toJSONAsync } from "seroval"; // TanStack Start's serializer (via @tanstack/react-router)

const SERVER = process.argv[2] ?? "http://127.0.0.1:3000";
const FAKE_OLLAMA_PORT = 11435;
const GERMAN = "Das ist ein kurzer deutscher Satz über das Wetter.";

// The server function id lives in the built server's function manifest.
const assets = "dist/server/assets";
const resolver = readdirSync(assets).find((f) => f.includes("server-fn-resolver"));
assert.ok(resolver, `no server function manifest in ${assets}`);
const [fnId] = /[0-9a-f]{64}/.exec(readFileSync(`${assets}/${resolver}`, "utf8")) ?? [];
assert.ok(fnId, "no server function id in the manifest");

let prompt = "";
const ollama = createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    prompt = JSON.parse(body).prompt;
    res.writeHead(200, { "Content-Type": "application/x-ndjson" });
    res.end(JSON.stringify({ response: "It is a short German sentence.", done: true }) + "\n");
  });
});
await new Promise((resolve) => ollama.listen(FAKE_OLLAMA_PORT, "127.0.0.1", resolve));

try {
  const payload = { data: { text: GERMAN, sourceLanguage: "auto", targetLanguage: "en" } };
  const response = await fetch(`${SERVER}/_serverFn/${fnId}`, {
    method: "POST",
    // What the app's own same-origin browser request sends (server functions reject others).
    headers: {
      "content-type": "application/json",
      "x-tsr-serverFn": "true",
      "sec-fetch-site": "same-origin",
    },
    body: JSON.stringify(await toJSONAsync(payload)),
  });
  const body = await response.text();
  assert.equal(response.status, 200, body);
  assert.equal(response.headers.get("x-detected-language"), "de_DE");
  assert.match(prompt, /German \(de_DE\) to English \(en\)/);
  console.log("OK: detected de_DE, prompt built from German");
} finally {
  ollama.close();
}
