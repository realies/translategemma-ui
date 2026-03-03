import { VALID_LANGUAGE_CODES } from "./languages";

/**
 * Detect the browser locale and map it to a supported language code.
 * Returns null if locale is English or not supported.
 *
 * Matching strategy (in order):
 * 1. Exact match: "fr-FR" -> "fr_FR"
 * 2. Language prefix match: "fr" -> first code starting with "fr_"
 */
export function detectTargetLocale(): string | null {
  if (typeof navigator === "undefined") return null;

  const browserLocale = navigator.language;
  if (!browserLocale) return null;

  const underscored = browserLocale.replaceAll("-", "_");

  if (underscored === "en" || underscored.startsWith("en_")) return null;

  if (VALID_LANGUAGE_CODES.has(underscored)) return underscored;

  const langPrefix = underscored.split("_")[0];
  if (langPrefix) {
    for (const code of VALID_LANGUAGE_CODES) {
      if (code.startsWith(langPrefix + "_")) return code;
    }
  }

  return null;
}
