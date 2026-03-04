/** Every translatable UI string, keyed for type-safe access. */
export const DEFAULT_LABELS = {
  "placeholder.source": "Enter text to translate...",
  "title.swap": "Swap languages",
  "title.clear": "Clear",
  "empty.translation": "Translation will appear here",
  "label.chars": "chars",
  "title.copy": "Copy to clipboard",
  "title.copied": "Copied!",
  "default.selectLanguage": "Select language",
  "placeholder.searchLanguages": "Search languages...",
  "aria.searchLanguages": "Search languages",
  "empty.noLanguages": "No languages found",
} as const;

export type LabelKey = keyof typeof DEFAULT_LABELS;
export type Labels = Record<LabelKey, string>;
