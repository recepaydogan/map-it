import { nativeDisplayContent } from "./native-wiki-content-model";

type Section = { label: string; value: unknown };
/** Keep each explanation once; configuration evidence stays in the data files. */
export const distinctNativeSections = (sections: Section[], descriptions: { text: string }[]): Section[] => {
  const shown = new Set(descriptions.map(description => description.text.trim()));
  return sections.filter(section => {
    // These are SetByCaller tags and multipliers without a player-facing effect description.
    if (section.label === "DefaultGEUIData") return false;
    if (typeof section.value === "string") {
      const text = section.value.trim();
      if (shown.has(text)) return false;
      shown.add(text);
      return true;
    }
    const content = nativeDisplayContent(section.value);
    if (content?.kind !== "effects" || content.effects.some(effect => effect.title || effect.equipped)) return true;
    if (content.effects.every(effect => shown.has(effect.text.trim()))) return false;
    content.effects.forEach(effect => shown.add(effect.text.trim()));
    return true;
  });
};
