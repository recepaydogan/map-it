/** Translate the crowd-control table while preserving client spell and class names. */
export function localizeFirstDungeonCrowdControlTable(originalSection, labels, source, locale) {
  const table = originalSection.match(/<table>[\s\S]*?<\/table>/)?.[0];
  if (!table) throw new Error("First-dungeon crowd-control table is missing");
  if (!labels) throw new Error("First-dungeon crowd-control labels are missing");
  const classes = new Map();
  for (let index = 0; index < source.keys.length; index += 1) {
    if (source.keys[index].startsWith("ChrClasses:") && source.keys[index].endsWith(":0")) {
      classes.set(source.values[index], locale.values[index]);
    }
  }
  const spellNames = new Set([...table.matchAll(/data-guide-link="spell:[^"]+">([^<]+)<\/a>/g)].map((match) => match[1]));
  return table.split(/(<[^>]+>)/g).map((part) => {
    if (part.startsWith("<") || !part.trim() || /^\d+$/.test(part) || spellNames.has(part)) return part;
    if (classes.has(part)) return classes.get(part);
    if (labels[part]) return labels[part];
    throw new Error(`Untranslated crowd-control table text: ${part}`);
  }).join("");
}
