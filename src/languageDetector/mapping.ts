import { languages } from "~/lib/languages";
import type { EngineName } from "./config";
import { SIMPLIFIED_ONLY, TRADITIONAL_ONLY } from "./zhScripts";

// Bases with several app codes use the CLDR likely-subtag region of the bare language
// (fr -> fr_FR, pt -> pt_BR, ar -> ar_EG, sw -> sw_TZ). Chinese is decided by script instead.
const PREFERRED_VARIANT: Partial<Record<string, string>> = {
  ar: "ar_EG",
  fr: "fr_FR",
  pt: "pt_BR",
  sw: "sw_TZ",
};

const baseOf = (code: string) => code.split("_")[0] ?? code;

// Reversed so the first listed code wins for a base without a preferred variant.
const BASE_TO_CODE = new Map(
  [...languages]
    .reverse()
    .map(({ code }) => [baseOf(code), PREFERRED_VARIANT[baseOf(code)] ?? code])
);

const SIMPLIFIED = new Set(SIMPLIFIED_ONLY);
const TRADITIONAL = new Set(TRADITIONAL_ONLY);

/**
 * zh_TW when Traditional-only characters outnumber Simplified-only ones, else zh_CN. Text with
 * neither kind reads the same in both scripts, so it takes zh_CN, the CLDR likely subtag of
 * bare zh. Neither engine has a Traditional label of its own.
 */
export function zhVariant(text: string): "zh_CN" | "zh_TW" {
  let balance = 0;
  for (const ch of text) {
    if (SIMPLIFIED.has(ch)) balance++;
    else if (TRADITIONAL.has(ch)) balance--;
  }
  return balance < 0 ? "zh_TW" : "zh_CN";
}

// CLD3 (defuss-lid full pack) emits ISO 639-1 codes, including legacy ones. Romanised forms
// ("hi-Latn", "ru-Latn", ...) are not app bases, so they never map.
// Malay (ms) and Bosnian (bs) are other languages, not Indonesian and Croatian.
const CLD3_ALIASES: Partial<Record<string, string>> = { iw: "he", tl: "fil" };
const cld3Base = (label: string) => CLD3_ALIASES[label] ?? label;

// GlotLID labels per app base, by language and script. Only the script the app writes each
// language in is listed, so romanised twins (hin_Latn, arb_Latn, ...) never map.
const GLOTLID_LABELS: Record<string, string> = {
  en: "eng_Latn",
  ar: "arb_Arab ary_Arab arz_Arab acm_Arab apc_Arab ars_Arab aeb_Arab arq_Arab",
  bg: "bul_Cyrl",
  bn: "ben_Beng",
  ca: "cat_Latn",
  cs: "ces_Latn",
  da: "dan_Latn",
  de: "deu_Latn",
  el: "ell_Grek",
  es: "spa_Latn",
  et: "ekk_Latn",
  fa: "pes_Arab prs_Arab fas_Arab",
  fi: "fin_Latn",
  fil: "fil_Latn tgl_Latn",
  fr: "fra_Latn",
  gu: "guj_Gujr",
  he: "heb_Hebr",
  hi: "hin_Deva",
  hr: "hrv_Latn",
  hu: "hun_Latn",
  id: "ind_Latn",
  is: "isl_Latn",
  it: "ita_Latn",
  ja: "jpn_Jpan",
  kn: "kan_Knda",
  ko: "kor_Hang",
  lt: "lit_Latn",
  lv: "lvs_Latn",
  ml: "mal_Mlym",
  mr: "mar_Deva",
  nl: "nld_Latn",
  no: "nob_Latn nno_Latn",
  pa: "pan_Guru",
  pl: "pol_Latn",
  pt: "por_Latn",
  ro: "ron_Latn",
  ru: "rus_Cyrl",
  sk: "slk_Latn",
  sl: "slv_Latn",
  sr: "srp_Cyrl srp_Latn",
  sv: "swe_Latn",
  sw: "swh_Latn swc_Latn",
  ta: "tam_Taml",
  te: "tel_Telu",
  th: "tha_Thai",
  tr: "tur_Latn",
  uk: "ukr_Cyrl",
  ur: "urd_Arab",
  vi: "vie_Latn",
  zu: "zul_Latn",
};

const GLOTLID_TO_BASE = new Map(
  Object.entries(GLOTLID_LABELS).flatMap(([base, labels]) =>
    labels.split(" ").map((label) => [label, base] as const)
  )
);

// Every Han-script label is a Chinese variety (cmn, yue, wuu, lzh, hak): short Traditional
// text often comes back as yue or lzh rather than cmn.
const glotlidBase = (label: string) =>
  label.endsWith("_Hani") ? "zh" : GLOTLID_TO_BASE.get(label);

const LABEL_TO_BASE: Record<EngineName, (label: string) => string | undefined> = {
  lite: cld3Base,
  accurate: glotlidBase,
};

/** The app code for an engine's label; null when the label is not an app language. */
export function toAppCode(engine: EngineName, label: string, text: string): string | null {
  const base = LABEL_TO_BASE[engine](label);
  if (base === "zh") return zhVariant(text);
  return (base && BASE_TO_CODE.get(base)) ?? null;
}
