/** Keep all trainer levels and spell IDs while translating the Mage table labels. */
const escapeHtml = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function localizeMageAbilityTable(original, labels) {
  const table = original.match(/<table>[\s\S]*?<\/table>/)?.[0];
  if (!table || !labels?.headers || !labels?.rank) throw new Error("Mage ability table or labels missing");
  if ((table.match(/<tr><td>/g) ?? []).length !== 69) throw new Error("Mage ability rows changed");
  return table.replace(/<th>([^<]+)<\/th>/g, (_, english) => {
    if (!labels.headers[english]) throw new Error(`Missing Mage ability header ${english}`);
    return `<th>${escapeHtml(labels.headers[english])}</th>`;
  }).replace(/<td>Rank (\d+)<\/td>/g, (_, rank) =>
    `<td>${escapeHtml(labels.rank.replace("{rank}", rank))}</td>`);
}
