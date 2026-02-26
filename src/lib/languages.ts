export interface Language {
  code: string;
  name: string;
  nativeName: string;
}

export const languages: Language[] = [
  { code: "en", name: "English", nativeName: "English" },
  { code: "ar_EG", name: "Arabic (Egypt)", nativeName: "العربية (مصر)" },
  { code: "ar_SA", name: "Arabic (Saudi Arabia)", nativeName: "العربية (السعودية)" },
  { code: "bg_BG", name: "Bulgarian", nativeName: "Български" },
  { code: "bn_IN", name: "Bengali", nativeName: "বাংলা" },
  { code: "ca_ES", name: "Catalan", nativeName: "Català" },
  { code: "cs_CZ", name: "Czech", nativeName: "Čeština" },
  { code: "da_DK", name: "Danish", nativeName: "Dansk" },
  { code: "de_DE", name: "German", nativeName: "Deutsch" },
  { code: "el_GR", name: "Greek", nativeName: "Ελληνικά" },
  { code: "es_MX", name: "Spanish (Mexico)", nativeName: "Español (México)" },
  { code: "et_EE", name: "Estonian", nativeName: "Eesti" },
  { code: "fa_IR", name: "Persian", nativeName: "فارسی" },
  { code: "fi_FI", name: "Finnish", nativeName: "Suomi" },
  { code: "fil_PH", name: "Filipino", nativeName: "Filipino" },
  { code: "fr_CA", name: "French (Canada)", nativeName: "Français (Canada)" },
  { code: "fr_FR", name: "French (France)", nativeName: "Français (France)" },
  { code: "gu_IN", name: "Gujarati", nativeName: "ગુજરાતી" },
  { code: "he_IL", name: "Hebrew", nativeName: "עברית" },
  { code: "hi_IN", name: "Hindi", nativeName: "हिन्दी" },
  { code: "hr_HR", name: "Croatian", nativeName: "Hrvatski" },
  { code: "hu_HU", name: "Hungarian", nativeName: "Magyar" },
  { code: "id_ID", name: "Indonesian", nativeName: "Bahasa Indonesia" },
  { code: "is_IS", name: "Icelandic", nativeName: "Íslenska" },
  { code: "it_IT", name: "Italian", nativeName: "Italiano" },
  { code: "ja_JP", name: "Japanese", nativeName: "日本語" },
  { code: "kn_IN", name: "Kannada", nativeName: "ಕನ್ನಡ" },
  { code: "ko_KR", name: "Korean", nativeName: "한국어" },
  { code: "lt_LT", name: "Lithuanian", nativeName: "Lietuvių" },
  { code: "lv_LV", name: "Latvian", nativeName: "Latviešu" },
  { code: "ml_IN", name: "Malayalam", nativeName: "മലയാളം" },
  { code: "mr_IN", name: "Marathi", nativeName: "मराठी" },
  { code: "nl_NL", name: "Dutch", nativeName: "Nederlands" },
  { code: "no_NO", name: "Norwegian", nativeName: "Norsk" },
  { code: "pa_IN", name: "Punjabi", nativeName: "ਪੰਜਾਬੀ" },
  { code: "pl_PL", name: "Polish", nativeName: "Polski" },
  { code: "pt_BR", name: "Portuguese (Brazil)", nativeName: "Português (Brasil)" },
  { code: "pt_PT", name: "Portuguese (Portugal)", nativeName: "Português (Portugal)" },
  { code: "ro_RO", name: "Romanian", nativeName: "Română" },
  { code: "ru_RU", name: "Russian", nativeName: "Русский" },
  { code: "sk_SK", name: "Slovak", nativeName: "Slovenčina" },
  { code: "sl_SI", name: "Slovenian", nativeName: "Slovenščina" },
  { code: "sr_RS", name: "Serbian", nativeName: "Српски" },
  { code: "sv_SE", name: "Swedish", nativeName: "Svenska" },
  { code: "sw_KE", name: "Swahili (Kenya)", nativeName: "Kiswahili (Kenya)" },
  { code: "sw_TZ", name: "Swahili (Tanzania)", nativeName: "Kiswahili (Tanzania)" },
  { code: "ta_IN", name: "Tamil", nativeName: "தமிழ்" },
  { code: "te_IN", name: "Telugu", nativeName: "తెలుగు" },
  { code: "th_TH", name: "Thai", nativeName: "ไทย" },
  { code: "tr_TR", name: "Turkish", nativeName: "Türkçe" },
  { code: "uk_UA", name: "Ukrainian", nativeName: "Українська" },
  { code: "ur_PK", name: "Urdu", nativeName: "اردو" },
  { code: "vi_VN", name: "Vietnamese", nativeName: "Tiếng Việt" },
  { code: "zh_CN", name: "Chinese (Simplified)", nativeName: "中文 (简体)" },
  { code: "zh_TW", name: "Chinese (Traditional)", nativeName: "中文 (繁體)" },
  { code: "zu_ZA", name: "Zulu", nativeName: "isiZulu" },
];

export function getLanguageByCode(code: string): Language | undefined {
  return languages.find((lang) => lang.code === code);
}

export function getLanguageName(code: string): string {
  return getLanguageByCode(code)?.name ?? code;
}

export const VALID_LANGUAGE_CODES = new Set(languages.map((l) => l.code));
