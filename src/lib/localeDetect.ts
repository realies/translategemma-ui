import { VALID_LANGUAGE_CODES } from "./languages";

/**
 * Detect the browser locale and map it to a supported language code.
 * Returns null if locale is not supported.
 *
 * Matching strategy (in order):
 * 1. Exact match: "fr-FR" -> "fr_FR"
 * 2. Language + region: "zh-Hant-TW" -> "zh_TW" (skip script subtag)
 * 3. Language prefix match: "fr" -> first code starting with "fr_"
 * 4. Bare language fallback: "en-US" -> "en"
 */
export function detectTargetLocale(): string | null {
  if (typeof navigator === "undefined") return null;

  const browserLocale = navigator.language;
  if (!browserLocale) return null;

  const underscored = browserLocale.replaceAll("-", "_");

  if (VALID_LANGUAGE_CODES.has(underscored)) return underscored;

  const [lang, ...rest] = underscored.split("_");
  if (!lang) return null;

  // For multi-subtag locales (e.g. zh_Hant_TW), try language + last subtag as region
  if (rest.length >= 2) {
    const region = rest[rest.length - 1];
    if (region) {
      const langRegion = `${lang}_${region}`;
      if (VALID_LANGUAGE_CODES.has(langRegion)) return langRegion;
    }
  }

  for (const code of VALID_LANGUAGE_CODES) {
    if (code.startsWith(lang + "_")) return code;
  }

  // Bare language code (e.g. "en" from "en-US")
  if (VALID_LANGUAGE_CODES.has(lang)) return lang;

  return null;
}
