/** Keep bound variants distinguishable while accepting the game's localized annotation. */
export const getItemDisplayName = (name: string, translated = name): string => {
  const originalCount = name.match(/\(Bound\)/g)?.length ?? 0;
  if (originalCount === 0) return translated;
  const translatedCount = translated.match(/\(Bound\)/g)?.length ?? 0;
  const trailingAnnotations = translated.match(/(?:\s*\([^()]+\))+$/)?.[0].match(/\([^()]+\)/g)?.length ?? 0;
  if (translatedCount >= originalCount || trailingAnnotations >= originalCount) return translated;
  const missing = originalCount - translatedCount;
  let base = translated;
  for (let index = 0; index < missing; index += 1) {
    const trailingAnnotation = /\s*\([^()]+\)$/.exec(base);
    if (!trailingAnnotation || trailingAnnotation[0] === " (Bound)") break;
    base = base.slice(0, -trailingAnnotation[0].length);
  }
  return `${base}${" (Bound)".repeat(missing)}`;
};
