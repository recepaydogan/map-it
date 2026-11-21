/** Keep class/race eligibility from the English guide while using the installed client names. */
const raceIds = { Human: 1, Dwarf: 3, "Night Elf": 4, Gnome: 7, "High Order": 95,
  Orc: 2, Undead: 5, Tauren: 6, Troll: 8, Windshaper: 96 };

export function localizeGettingStartedClassTable(originalSection, labels, source, locale, language) {
  const table = originalSection.match(/<table>[\s\S]*?<\/table>/)?.[0];
  if (!table || !labels) throw new Error("Getting-started class table or labels missing");
  const indices = new Map(source.keys.map((key, index) => [key, index]));
  const races = Object.fromEntries(Object.entries(raceIds).map(([name, id]) => {
    const index = indices.get(`ChrRaces:${id}:2`);
    if (index === undefined || !locale.values[index]) throw new Error(`Missing client race ${name}`);
    return [name, locale.values[index]];
  }));
  const separator = language.startsWith("zh") ? "、" : ", ";
  let rows = 0;
  const translated = table.replace(/<tr><td>(<a[^>]+>[\s\S]*?<\/a>)<\/td><td>([^<]+)<\/td><td>([^<]+)<\/td><td>([^<]+)<\/td><td>([^<]+)<\/td><\/tr>/g,
    (_, classLink, roles, resource, alliance, horde) => {
      rows += 1;
      const list = (value) => value.split(", ").map((name) => {
        if (!races[name]) throw new Error(`Unknown class-table race ${name}`);
        return races[name];
      }).join(separator);
      if (!labels[roles] || !labels[resource]) throw new Error(`Missing class-table text ${roles}/${resource}`);
      return `<tr><td>${classLink}</td><td>${labels[roles]}</td><td>${labels[resource]}</td><td>${list(alliance)}</td><td>${list(horde)}</td></tr>`;
    });
  if (rows !== 9) throw new Error(`Expected 9 class rows, found ${rows}`);
  return translated.replace(/<th>([^<]+)<\/th>/g, (_, value) => {
    if (!labels[value]) throw new Error(`Missing class-table header ${value}`);
    return `<th>${labels[value]}</th>`;
  });
}
