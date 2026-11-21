const escapeHtml = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const links = (html) => [...html.matchAll(/data-guide-link="([^"]+)"/g)].map(([, id]) => id);

/** Translate trainer/rank cells without changing 80 client-backed spell rows. */
export function localizeDruidAbilityTable(original, generic, labels) {
  const table = original.match(/<table>[\s\S]*?<\/table>/)?.[0];
  if (!table || !generic?.headers || !generic?.rank || !generic?.trainer || !generic?.quest ||
    !labels?.shapeshift || !labels?.foreverQuest) {
    throw new Error("Druid ability table or labels missing");
  }
  let rows = 0;
  const translated = table.replace(/<tr><td>(\d+)<\/td><td>([\s\S]*?)<\/td><td>([\s\S]*?)<\/td><td>([\s\S]*?)<\/td><\/tr>/g,
    (_, level, ability, rank, source) => {
      rows += 1;
      const localizedRank = rank.startsWith("Rank ")
        ? generic.rank.replace("{rank}", rank.slice(5))
        : rank === "Shapeshift" ? labels.shapeshift : rank;
      let learnedFrom;
      if (source === "Trainer") learnedFrom = generic.trainer;
      else if (source === "Quest: The Great Cat Spirit") learnedFrom = labels.foreverQuest;
      else if (/^Quest: .+ \(Classic quest\)$/.test(source)) {
        learnedFrom = generic.quest.replace("{name}",
          source.slice("Quest: ".length, -" (Classic quest)".length));
      } else throw new Error(`Unknown Druid trainer source ${source}`);
      return `<tr><td>${level}</td><td>${ability}</td><td>${escapeHtml(localizedRank)}</td>` +
        `<td>${escapeHtml(learnedFrom)}</td></tr>`;
    });
  if (rows !== 80 || JSON.stringify(links(translated)) !== JSON.stringify(links(table))) {
    throw new Error(`Druid ability rows or links changed: ${rows}`);
  }
  return translated.replace(/<th>([^<]+)<\/th>/g, (_, header) => {
    if (!generic.headers[header]) throw new Error(`Missing Druid ability header ${header}`);
    return `<th>${escapeHtml(generic.headers[header])}</th>`;
  });
}
