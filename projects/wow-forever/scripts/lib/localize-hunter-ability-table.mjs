const escapeHtml = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const links = (html) => [...html.matchAll(/data-guide-link="([^"]+)"/g)].map(([, id]) => id);

/** Keep all 154 client rows, levels, spell IDs and ranks while translating table labels. */
export function localizeHunterAbilityTable(original, labels) {
  const table = original.match(/<table>[\s\S]*?<\/table>/)?.[0];
  if (!table || !labels?.headers || !labels?.rank || !labels?.trainer || !labels?.quest) {
    throw new Error("Hunter ability table or labels missing");
  }
  let rows = 0;
  const translated = table.replace(/<tr><td>([^<]*)<\/td><td>([\s\S]*?)<\/td><td>([^<]*)<\/td><td>([^<]*)<\/td><\/tr>/g,
    (_, level, ability, rank, learnedFrom) => {
      const rankNumber = rank ? Number(rank.match(/^Rank ([1-5])$/)?.[1]) : null;
      if (rank && !rankNumber) throw new Error(`Unexpected Hunter ability rank ${rank}`);
      const localizedRank = rankNumber ? labels.rank.replace("{rank}", rankNumber) : "";
      let localizedSource;
      if (learnedFrom === "Trainer") localizedSource = labels.trainer;
      else {
        const quest = learnedFrom.match(/^Quest: (Training the Beast|Taming the Beast) \(Classic quest\)$/)?.[1];
        if (!quest) throw new Error(`Unexpected Hunter ability source ${learnedFrom}`);
        localizedSource = labels.quest.replace("{name}", quest);
      }
      rows += 1;
      return `<tr><td>${level}</td><td>${ability}</td><td>${escapeHtml(localizedRank)}</td>` +
        `<td>${escapeHtml(localizedSource)}</td></tr>`;
    });
  if (rows !== 154 || JSON.stringify(links(translated)) !== JSON.stringify(links(table))) {
    throw new Error(`Hunter ability rows or links changed: ${rows}`);
  }
  return translated.replace(/<th>([^<]+)<\/th>/g, (_, header) => {
    if (!labels.headers[header]) throw new Error(`Missing Hunter ability header ${header}`);
    return `<th>${escapeHtml(labels.headers[header])}</th>`;
  });
}
