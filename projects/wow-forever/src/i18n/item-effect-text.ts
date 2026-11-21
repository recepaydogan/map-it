export interface ItemEffectPack {
  version: number;
  translations: Record<string, string>;
}

export function createItemEffectDictionary(pack: ItemEffectPack): Map<string, string> {
  if (pack.version !== 1 || !pack.translations ||
    typeof pack.translations !== "object" || Array.isArray(pack.translations)) {
    throw new Error("Invalid item effect locale pack");
  }
  for (const [english, translated] of Object.entries(pack.translations)) {
    if (!english || typeof translated !== "string" || !translated.trim()) {
      throw new Error(`Invalid item effect translation: ${english}`);
    }
  }
  return new Map(Object.entries(pack.translations));
}
