/** Preserve level and linked client abilities while translating table UI. */
export function localizeRogueAbilityTable(original, labels) {
  const table = original.match(/<table>[\s\S]*?<\/table>/)?.[0];
  if (!table || !labels?.headers || !labels?.rank || !labels?.passive) {
    throw new Error("Rogue ability table or translations missing");
  }
  const rows = (table.match(/<tr><td>/g) ?? []).length;
  if (rows !== 43) throw new Error(`Expected 43 Rogue ability rows, found ${rows}`);
  const translated = table.replace(/<th>([^<]+)<\/th>/g, (_, english) => {
    if (!labels.headers[english]) throw new Error(`Missing Rogue ability header ${english}`);
    return `<th>${labels.headers[english]}</th>`;
  }).replace(/<td>(Rank (\d+)|Passive)<\/td>/g, (_, english, rank) =>
    `<td>${rank ? labels.rank.replace("{rank}", rank) : labels.passive}</td>`);
  if (translated.includes("<td>Passive</td>") || translated.includes("<td>Rank ")) {
    throw new Error("Untranslated Rogue ability table cell");
  }
  return translated;
}
