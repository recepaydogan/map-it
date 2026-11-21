const escapeHtml = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const professions = { Cooking: 185, Blacksmithing: 164, Leatherworking: 165,
  Mining: 186, Tailoring: 197, "First Aid": 129, Alchemy: 171 };
const links = (html) => [...html.matchAll(/data-guide-link="([^"]+)"/g)].map(([, id]) => id);

/** Retain recipe links and exact yellow/grey skill thresholds from the client. */
export function localizeProfessionsSkillColorsTable(original, labels) {
  const table = original.match(/<table>[\s\S]*?<\/table>/)?.[0];
  if (!table || !labels?.headers) throw new Error("Skill color table or labels missing");
  let rows = 0;
  const translated = table.replace(/<tr><td>(<a\b[^>]*data-guide-link="[^"]+"[^>]*>[^<]*<\/a>)<\/td><td>([^<]+)<\/td><td>(\d+)<\/td><td>(\d+)<\/td><\/tr>/g,
    (_, recipe, profession, yellow, grey) => {
      rows += 1;
      const id = professions[profession];
      if (!id) throw new Error(`Unknown recipe profession ${profession}`);
      return `<tr><td>${recipe}</td><td>{{CLIENT:SkillLine:${id}:0|${profession}}}</td>` +
        `<td>${yellow}</td><td>${grey}</td></tr>`;
    });
  if (rows !== 8 || JSON.stringify(links(translated)) !== JSON.stringify(links(table))) {
    throw new Error(`Skill color rows or recipe links changed: ${rows}`);
  }
  return translated.replace(/<th>([^<]+)<\/th>/g, (_, header) => {
    if (!labels.headers[header]) throw new Error(`Missing skill color header ${header}`);
    return `<th>${escapeHtml(labels.headers[header])}</th>`;
  });
}
