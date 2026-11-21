/** Keep published Warlock talent points and links while translating build advice. */
const specIds = { Affliction: 355, Demonology: 354, Destruction: 593 };
const escapeHtml = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const links = (html) => [...html.matchAll(/data-guide-link="([^"]+)"/g)].map(([, id]) => id);

export function localizeWarlockTalentTables(original, labels, source, locale) {
  const tables = [...original.matchAll(/<table>[\s\S]*?<\/table>/g)].map(([table]) => table);
  if (tables.length !== 2 || !labels?.headers || labels?.rows?.length !== 2) {
    throw new Error("Warlock talent tables or labels missing");
  }
  const indices = new Map(source.keys.map((key, index) => [key, index]));
  return tables.map((table, tableIndex) => {
    let rowIndex = 0;
    const translated = table.replace(/<th>([^<]+)<\/th>/g, (_, english) => {
      const value = labels.headers[english];
      if (!value) throw new Error(`Missing Warlock talent header ${english}`);
      return `<th>${escapeHtml(value)}</th>`;
    }).replace(/<tr><td><b>(Affliction|Demonology|Destruction)<\/b>: ([^<]+)<\/td><td>([\s\S]*?)<\/td><td>([\s\S]*?)<\/td><\/tr>/g,
      (_, spec, _englishTitle, talents) => {
        const localizedSpec = locale.values[indices.get(`SkillLine:${specIds[spec]}:0`)];
        const row = labels.rows[tableIndex]?.[rowIndex++];
        if (!localizedSpec || !row?.title || !row?.description) {
          throw new Error(`Missing Warlock talent row ${tableIndex}/${spec}`);
        }
        return `<tr><td><b>${escapeHtml(localizedSpec)}</b>: ${escapeHtml(row.title)}</td>` +
          `<td>${talents}</td><td>${escapeHtml(row.description)}</td></tr>`;
      });
    if (rowIndex !== 3 || JSON.stringify(links(translated)) !== JSON.stringify(links(table))) {
      throw new Error(`Warlock talent rows or links changed in table ${tableIndex}`);
    }
    return translated;
  });
}
