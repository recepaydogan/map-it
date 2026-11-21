/** Keep Shaman totem levels and spell links while translating their effects. */
const spellIds = [8071, 2484, 5730, 8075, 3599, 8143, 5394, 8166, 8181,
  8190, 5675, 8184, 8227, 8177, 10595];
const escapeHtml = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const links = (html) => [...html.matchAll(/data-guide-link="([^"]+)"/g)].map(([, id]) => id);

export function localizeShamanTotemTable(original, labels) {
  const table = original.match(/<table>[\s\S]*?<\/table>/)?.[0];
  if (!table || !labels?.headers || !labels?.elements || labels?.effects?.length !== 15 ||
    JSON.stringify(links(table)) !== JSON.stringify(spellIds.map((id) => `spell:${id}`))) {
    throw new Error("Shaman totem table or labels missing");
  }
  let rowIndex = 0;
  const translated = table.replace(/<th>([^<]+)<\/th>/g, (_, english) => {
    const value = labels.headers[english];
    if (!value) throw new Error(`Missing Shaman totem header ${english}`);
    return `<th>${escapeHtml(value)}</th>`;
  }).replace(/<tr><td>(<a[^>]+>[^<]+<\/a>)<\/td><td>(\d+)<\/td><td>(Earth|Fire|Water|Air)<\/td><td>([^<]+)<\/td><\/tr>/g,
    (_, spell, level, element) => {
      const effect = labels.effects[rowIndex++];
      if (!effect || !labels.elements[element]) {
        throw new Error(`Missing Shaman totem effect ${rowIndex - 1}`);
      }
      return `<tr><td>${spell}</td><td>${level}</td><td>${escapeHtml(labels.elements[element])}</td>` +
        `<td>${escapeHtml(effect)}</td></tr>`;
    });
  if (rowIndex !== 15 || JSON.stringify(links(translated)) !== JSON.stringify(links(table))) {
    throw new Error("Shaman totem rows or links changed");
  }
  return translated;
}
