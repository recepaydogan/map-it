/** Translate Warlock table labels while retaining all 61 client spell rows. */
const escapeHtml = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function localizeWarlockAbilityTable(original, labels) {
  const table = original.match(/<table>[\s\S]*?<\/table>/)?.[0];
  if (!table || !labels?.headers || !labels?.rank || !labels?.summon ||
    !labels?.trainer || !labels?.classicQuest) {
    throw new Error("Warlock ability table or labels missing");
  }
  if ([...table.matchAll(/<tr><td>/g)].length !== 61) {
    throw new Error("Expected 61 Warlock ability rows");
  }
  return table.replace(/<th>([^<]+)<\/th>/g, (_, label) => {
    const translated = labels.headers[label];
    if (!translated) throw new Error(`Missing Warlock ability header ${label}`);
    return `<th>${escapeHtml(translated)}</th>`;
  }).replace(/<td>(Rank (\d+)|Summon|Trainer|Quest: ([^<]+) \(Classic quest\))<\/td>/g,
    (_, value, rank, quest) => {
      let translated;
      if (rank) translated = labels.rank.replace("{rank}", rank);
      else if (value === "Summon") translated = labels.summon;
      else if (value === "Trainer") translated = labels.trainer;
      else translated = labels.classicQuest.replace("{quest}", quest);
      return `<td>${escapeHtml(translated)}</td>`;
    });
}
