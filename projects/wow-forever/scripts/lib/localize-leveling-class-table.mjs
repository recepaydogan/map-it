/** Preserve class navigation while taking every class name from the installed client. */
const classIds = { Warrior: 1, Paladin: 2, Hunter: 3, Rogue: 4, Priest: 5,
  Shaman: 7, Mage: 8, Warlock: 9, Druid: 11 };

export function localizeLevelingClassTable(original, labels, source, locale) {
  const table = original.match(/<table>[\s\S]*?<\/table>/)?.[0];
  if (!table || !labels?.headers || !labels?.guide || !labels?.builds || !labels?.abilities) {
    throw new Error("Leveling class table or labels missing");
  }
  const indices = new Map(source.keys.map((key, index) => [key, index]));
  let rows = 0;
  const translated = table.replace(/<tr><td>([^<]+)<\/td><td>(<a[^>]+>)[^<]+<\/a><\/td><td>(<a[^>]+>)[^<]+<\/a><\/td><td>(<a[^>]+>)[^<]+<\/a><\/td><\/tr>/g,
    (_, english, guideLink, buildsLink, abilitiesLink) => {
      const id = classIds[english];
      const index = indices.get(`ChrClasses:${id}:0`);
      if (!id || index === undefined || !locale.values[index]) {
        throw new Error(`Missing client class ${english}`);
      }
      rows += 1;
      const name = locale.values[index];
      const text = (template) => template.replace("{class}", name);
      return `<tr><td>${name}</td><td>${guideLink}${text(labels.guide)}</a></td>` +
        `<td>${buildsLink}${text(labels.builds)}</a></td>` +
        `<td>${abilitiesLink}${text(labels.abilities)}</a></td></tr>`;
    });
  if (rows !== 9) throw new Error(`Expected nine class guide rows, found ${rows}`);
  return translated.replace(/<th>([^<]+)<\/th>/g, (_, value) => {
    if (!labels.headers[value]) throw new Error(`Missing class table header ${value}`);
    return `<th>${labels.headers[value]}</th>`;
  });
}
