/** Keep every client-linked ability and its level while translating table labels. */
export function localizePaladinAbilityTable(original, labels) {
  const table = original.match(/<table>[\s\S]*?<\/table>/)?.[0];
  if (!table || !labels?.headers || !labels?.rank || !labels?.trainer || !labels?.classicQuest) {
    throw new Error("Paladin ability table or labels missing");
  }
  const rows = (table.match(/<tr><td>/g) ?? []).length;
  if (rows !== 58) throw new Error(`Expected 58 Paladin ability rows, found ${rows}`);
  const translated = table.replace(/<th>([^<]+)<\/th>/g, (_, english) => {
    if (!labels.headers[english]) throw new Error(`Missing Paladin ability header ${english}`);
    return `<th>${labels.headers[english]}</th>`;
  }).replace(/<td>(Rank (\d+)|Trainer|Quest: (?:The Tome of Divinity|The Tome of Valor) \(Classic quest\))<\/td>/g,
    (_, english, rank) => {
      if (rank) return `<td>${labels.rank.replace("{rank}", rank)}</td>`;
      if (english === "Trainer") return `<td>${labels.trainer}</td>`;
      const questName = english.slice("Quest: ".length, -" (Classic quest)".length);
      return `<td>${labels.classicQuest.replace("{quest}", questName)}</td>`;
    });
  if (translated.includes("<td>Trainer</td>") || translated.includes("<td>Rank ") ||
    translated.includes("(Classic quest)</td>")) {
    throw new Error("Untranslated Paladin ability table cell");
  }
  return translated;
}
