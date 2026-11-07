/**
 * Downloads the GlotLID v4 language-ID model used by LANGUAGE_DETECTOR=accurate.
 * Pinned to a Hugging Face commit and checked against its sha256. Does nothing when the
 * file is already present and intact; fails without touching it on any mismatch.
 *
 * Usage: npm run fetch:glotlid
 * Output: models/glotlid-v4.ftz (~101 MB, Apache-2.0, https://huggingface.co/cis-lmu/glotlid)
 */

import { createHash } from "node:crypto";
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const MODEL_URL =
  "https://huggingface.co/cis-lmu/glotlid/resolve/d4dd28bdbbf63dcca6025ca346270becd4dc52e8/model_v4.ftz";
const SHA256 = "42039e8e9d18a1f75ce334c8aa0b47e8de4b74b887538f0bc7780ab9ae52eab3";
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "models", "glotlid-v4.ftz");
const TMP = `${OUT}.part`;

async function sha256(path) {
  const hash = createHash("sha256");
  await pipeline(createReadStream(path), hash);
  return hash.digest("hex");
}

if (existsSync(OUT) && (await sha256(OUT)) === SHA256) {
  console.log(`${OUT} is up to date`);
  process.exit(0);
}

console.log(`Downloading ${MODEL_URL}`);
const response = await fetch(MODEL_URL);
if (!response.ok || !response.body) {
  console.error(`Download failed: HTTP ${String(response.status)}`);
  process.exit(1);
}

mkdirSync(dirname(OUT), { recursive: true });
await pipeline(Readable.fromWeb(response.body), createWriteStream(TMP));

const actual = await sha256(TMP);
if (actual !== SHA256) {
  rmSync(TMP);
  console.error(`Checksum mismatch for ${MODEL_URL}: expected ${SHA256}, got ${actual}`);
  process.exit(1);
}
renameSync(TMP, OUT); // atomic: the model is either the old file or the verified new one
console.log(`Wrote ${OUT}`);
