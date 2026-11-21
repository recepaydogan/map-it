/** Preserve dungeon links and level numbers while translating the route guide's table. */
export function localizeLevelingDungeonTable(original, labels, source, locale) {
  const table = original.match(/<table>[\s\S]*?<\/table>/)?.[0];
  if (!table || !labels) throw new Error("Leveling dungeon table or labels missing");
  if ([...table.matchAll(/<tr><td>/g)].length !== 14) {
    throw new Error("Expected fourteen leveling dungeon rows");
  }
  const scarletNames = [...new Set(source.keys.flatMap((key, index) =>
    key.startsWith("LFGDungeons:") && source.values[index] === "Scarlet Monastery" && locale.values[index]
      ? [locale.values[index]] : []))];
  if (scarletNames.length !== 1) throw new Error("Scarlet Monastery client name is ambiguous");
  const replacements = { ...labels, "Scarlet Monastery": scarletNames[0] };
  const phrases = Object.entries(replacements).sort(([left], [right]) => right.length - left.length);
  const translated = table.split(/(<[^>]+>)/g).map((part) => {
    if (part.startsWith("<")) return part;
    let value = part;
    for (const [english, localized] of phrases) value = value.replaceAll(english, localized);
    return value;
  }).join("");
  if ([...translated.matchAll(/<tr><td>/g)].length !== 14) {
    throw new Error("Leveling dungeon row count changed");
  }
  return translated;
}
