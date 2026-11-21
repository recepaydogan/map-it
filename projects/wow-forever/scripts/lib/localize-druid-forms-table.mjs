const escapeHtml = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const links = (html) => [...html.matchAll(/data-guide-link="([^"]+)"/g)].map(([, id]) => id);

/** Preserve the four linked forms and level requirements while translating their roles. */
export function localizeDruidFormsTable(original, labels) {
  const table = original.match(/<table>[\s\S]*?<\/table>/)?.[0];
  if (!table || !labels?.headers || !labels?.descriptions || !labels?.quest) {
    throw new Error("Druid forms table or labels missing");
  }
  let rows = 0;
  const translated = table.replace(/<tr><td>([\s\S]*?)<\/td><td>([^<]+)<\/td><td>([\s\S]*?)<\/td><\/tr>/g,
    (_, form, level) => {
      const description = labels.descriptions[rows++];
      if (!description) throw new Error(`Missing Druid form description ${rows}`);
      const localizedLevel = level === "20 (quest)" ? `20 (${labels.quest})` : level;
      return `<tr><td>${form}</td><td>${escapeHtml(localizedLevel)}</td>` +
        `<td>${escapeHtml(description)}</td></tr>`;
    });
  if (rows !== 4 || JSON.stringify(links(translated)) !== JSON.stringify(links(table))) {
    throw new Error(`Druid form rows or links changed: ${rows}`);
  }
  return translated.replace(/<th>([^<]+)<\/th>/g, (_, header) => {
    if (!labels.headers[header]) throw new Error(`Missing Druid form header ${header}`);
    return `<th>${escapeHtml(labels.headers[header])}</th>`;
  });
}
