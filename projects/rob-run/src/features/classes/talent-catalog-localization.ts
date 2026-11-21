import type { CalculatorClass } from "./talent-calculator";

interface Translation {
  source: string;
  sources?: string[];
  text: string;
}

export interface TalentCatalogLocalePack {
  version: 1;
  sourceBuild: string;
  language: string;
  entries: Record<string, { name?: Translation; ranks?: Record<string, Translation> }>;
}

export function localizeTalentCatalog(
  classes: CalculatorClass[], sourceBuild: string, language: string, pack: TalentCatalogLocalePack,
): CalculatorClass[] {
  if (pack.version !== 1 || pack.sourceBuild !== sourceBuild || pack.language !== language ||
    !pack.entries || typeof pack.entries !== "object") {
    throw new Error("Invalid talent locale pack");
  }
  const localized = structuredClone(classes);
  const remaining = new Set(Object.keys(pack.entries));
  for (const cls of localized) for (const tree of cls.trees) for (const talent of tree.talents) {
    const key = String(talent.id);
    const entry = pack.entries[key];
    if (!entry) continue;
    remaining.delete(key);
    if (entry.name) {
      if (entry.name.source !== talent.n || !entry.name.text?.trim()) {
        throw new Error(`Stale talent name: ${key}`);
      }
      talent.n = entry.name.text;
    }
    for (const [indexText, value] of Object.entries(entry.ranks ?? {})) {
      const index = Number(indexText);
      if (!Number.isInteger(index) || index < 0 || index >= talent.d.length ||
        (value.source !== talent.d[index] && !value.sources?.includes(talent.d[index])) || !value.text?.trim()) {
        throw new Error(`Stale talent rank: ${key}/${indexText}`);
      }
      talent.d[index] = value.text;
    }
  }
  if (remaining.size) throw new Error(`Unknown talent translations: ${[...remaining].slice(0, 3).join(", ")}`);
  return localized;
}
