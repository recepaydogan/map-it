/** Preserve Shaman talent choices and point values while translating advice. */
const escapeHtml = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const links = (html) => [...html.matchAll(/data-guide-link="([^"]+)"/g)].map(([, id]) => id);

export function localizeShamanTalentTables(original, labels) {
  const tables = [...original.matchAll(/<table>[\s\S]*?<\/table>/g)].map(([table]) => table);
  if (tables.length !== 2 || !labels?.headers || labels?.rows?.length !== 2 ||
    !labels?.upTo) {
    throw new Error("Shaman talent tables or labels missing");
  }
  return tables.map((table, tableIndex) => {
    let rowIndex = 0;
    const translated = table.replace(/<th>([^<]+)<\/th>/g, (_, english) => {
      const value = labels.headers[english];
      if (!value) throw new Error(`Missing Shaman talent header ${english}`);
      return `<th>${escapeHtml(value)}</th>`;
    }).replace(/<tr><td>(Enhancement|Elemental|Restoration) leveling \((20|30)\)<\/td><td>([\s\S]*?)<\/td><td>([\s\S]*?)<\/td><\/tr>/g,
      (_, spec, level, talents) => {
        const row = labels.rows[tableIndex]?.[rowIndex++];
        if (!row?.title || !row?.description || level !== (tableIndex ? "30" : "20")) {
          throw new Error(`Missing Shaman talent row ${tableIndex}/${spec}`);
        }
        const localizedTalents = talents.replace(/(<\/a>) up to (\d+\/\d+)/g,
          (_, end, points) => `${end} ${escapeHtml(labels.upTo.replace("{points}", points))}`);
        return `<tr><td>${escapeHtml(row.title)}</td><td>${localizedTalents}</td>` +
          `<td>${escapeHtml(row.description)}</td></tr>`;
      });
    if (rowIndex !== 3 || JSON.stringify(links(translated)) !== JSON.stringify(links(table))) {
      throw new Error(`Shaman talent rows or links changed in table ${tableIndex}`);
    }
    return translated;
  });
}
