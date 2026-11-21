import i18n from "../../i18n";

export const humanizeNativeLabel = (key: string): string => {
  const words = key.replace(/^b(?=[A-Z])/, "").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2").replaceAll("_", " ").trim();
  return words.split(/\s+/).map((word, index) => /^(?:HP|MP|XP|ID|UI|DPS|NPC|[A-Z]\d*)$/.test(word)
    ? word : index === 0 ? word[0]?.toUpperCase() + word.slice(1).toLowerCase() : word.toLowerCase()).join(" ");
};
export const nativeFieldLabel = (key: string): string => i18n.t(`wiki.fields.${key}`, {
  defaultValue: i18n.t(`wiki.sections.${key}`, { defaultValue: humanizeNativeLabel(key) }),
});
