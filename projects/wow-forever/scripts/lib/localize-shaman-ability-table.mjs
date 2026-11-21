/** Keep all 74 Shaman client abilities while translating the table labels. */
const escapeHtml = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function localizeShamanAbilityTable(original, labels) {
  const table = original.match(/<table>[\s\S]*?<\/table>/)?.[0];
  if (!table || !labels?.headers || !labels?.rank || !labels?.passive ||
    !labels?.trainer || !labels?.classicQuest) {
    throw new Error("Shaman ability table or labels missing");
  }
  if ([...table.matchAll(/<tr><td>/g)].length !== 74) {
    throw new Error("Expected 74 Shaman ability rows");
  }
  let translatedCells = 0;
  const translated = table.replace(/<th>([^<]+)<\/th>/g, (_, label) => {
    const value = labels.headers[label];
    if (!value) throw new Error(`Missing Shaman ability header ${label}`);
    return `<th>${escapeHtml(value)}</th>`;
  }).replace(/<td>(Rank (\d+)|Passive|Trainer|Quest: ([^<]+) \(Classic quest\))<\/td>/g,
    (_, value, rank, quest) => {
      translatedCells += 1;
      const result = rank ? labels.rank.replace("{rank}", rank)
        : value === "Passive" ? labels.passive
          : value === "Trainer" ? labels.trainer
            : labels.classicQuest.replace("{quest}", quest);
      return `<td>${escapeHtml(result)}</td>`;
    });
  if (translatedCells < 130 || translated.includes("<td>Trainer</td>") ||
    translated.includes("(Classic quest)")) {
    throw new Error("Shaman ability table labels were not fully translated");
  }
  return translated;
}
