const escapeHtml = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Preserve the six profession combinations while translating their advice. */
export function localizeProfessionsPairTable(original, labels) {
  const table = original.match(/<table>[\s\S]*?<\/table>/)?.[0];
  if (!table || !labels?.headers || labels?.rows?.length !== 6) {
    throw new Error("Professions pair table or labels missing");
  }
  let rows = 0;
  const translated = table.replace(/<tr><td>([^<]+)<\/td><td>([^<]+)<\/td><td>([^<]+)<\/td><\/tr>/g,
    () => {
      const row = labels.rows[rows++];
      if (!row?.pair || !row?.why || !row?.handy) {
        throw new Error(`Missing profession pair ${rows}`);
      }
      return `<tr><td>${escapeHtml(row.pair)}</td><td>${escapeHtml(row.why)}</td>` +
        `<td>${escapeHtml(row.handy)}</td></tr>`;
    });
  if (rows !== 6) throw new Error(`Expected six profession pairs, found ${rows}`);
  return translated.replace(/<th>([^<]+)<\/th>/g, (_, header) => {
    if (!labels.headers[header]) throw new Error(`Missing profession pair header ${header}`);
    return `<th>${escapeHtml(labels.headers[header])}</th>`;
  });
}
