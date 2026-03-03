import { createContext, useContext, useState, useLayoutEffect } from "react";
import type { ReactNode } from "react";
import { DEFAULT_LABELS, type LabelKey, type Labels } from "~/lib/labels";
import { detectTargetLocale } from "~/lib/localeDetect";
import { translatedLabels } from "~/lib/translatedLabels";

const LabelContext = createContext<Labels>(DEFAULT_LABELS);

function getLabelsForLocale(locale: string | null): Labels {
  if (!locale) return DEFAULT_LABELS;
  const labels = translatedLabels[locale];
  return labels ?? DEFAULT_LABELS;
}

export function LabelProvider({ children }: { children: ReactNode }) {
  const [labels, setLabels] = useState<Labels>(DEFAULT_LABELS);

  useLayoutEffect(() => {
    const locale = detectTargetLocale();
    const resolved = getLabelsForLocale(locale);
    if (resolved !== DEFAULT_LABELS) {
      setLabels(resolved);
    }
  }, []);

  return <LabelContext value={labels}>{children}</LabelContext>;
}

export function useLabel(key: LabelKey): string {
  return useContext(LabelContext)[key];
}
