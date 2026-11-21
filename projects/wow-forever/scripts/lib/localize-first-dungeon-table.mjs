/** Keep the numeric dungeon list and links synced with English while translating its prose. */
export function localizeFirstDungeonTable(originalSection, labels, source, locale) {
  const table = originalSection.match(/<table>[\s\S]*?<\/table>/)?.[0];
  if (!table) throw new Error("First-dungeon source table is missing");
  const scarletNames = [...new Set(source.keys.flatMap((key, index) =>
    key.startsWith("LFGDungeons:") && source.values[index] === "Scarlet Monastery" && locale.values[index]
      ? [locale.values[index]] : []))];
  if (scarletNames.length !== 1) throw new Error("Scarlet Monastery client name is ambiguous");
  const replacements = { ...labels, "Scarlet Monastery": scarletNames[0] };
  const phrases = Object.entries(replacements).sort(([left], [right]) => right.length - left.length);
  return table.split(/(<[^>]+>)/g).map((part) => {
    if (part.startsWith("<")) return part;
    let text = part;
    for (const [english, translated] of phrases) text = text.replaceAll(english, translated);
    return text;
  }).join("");
}
