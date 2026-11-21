/** Keep the published Mage talent links and point allocations while translating advice. */
const escapeHtml = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const links = (html) => [...html.matchAll(/data-guide-link="([^"]+)"/g)].map(([, id]) => id);

export function localizeMageTalentTables(original, labels) {
  const tables = [...original.matchAll(/<table>[\s\S]*?<\/table>/g)].map(([table]) => table);
  if (tables.length !== 2 || !labels?.headers || labels?.rows?.length !== 2) {
    throw new Error("Mage talent tables or labels missing");
  }
  return tables.map((table, tableIndex) => {
    let rowIndex = 0;
    const translated = table.replace(/<th>([^<]+)<\/th>/g, (_, english) => {
      if (!labels.headers[english]) throw new Error(`Missing Mage talent header ${english}`);
      return `<th>${escapeHtml(labels.headers[english])}</th>`;
    }).replace(/<tr><td>([\s\S]*?)<\/td><td>([\s\S]*?)<\/td><td>([\s\S]*?)<\/td><\/tr>/g,
      (_, _build, talents) => {
        const row = labels.rows[tableIndex][rowIndex++];
        if (!row?.title || !row?.description) {
          throw new Error(`Missing Mage talent row ${tableIndex}/${rowIndex}`);
        }
        return `<tr><td>${escapeHtml(row.title)}</td><td>${talents}</td>` +
          `<td>${escapeHtml(row.description)}</td></tr>`;
      });
    if (rowIndex !== 3 || JSON.stringify(links(translated)) !== JSON.stringify(links(table))) {
      throw new Error(`Mage talent rows or links changed in table ${tableIndex}`);
    }
    return translated;
  });
}
