/** Preserve racial links while taking race and ability names from the installed client. */
const raceIds = { Human: 1, Dwarf: 3, "Night Elf": 4, Gnome: 7,
  "High Order Skyborne": 95, Orc: 2, Undead: 5, Tauren: 6,
  Troll: 8, "Windshaper Skyborne": 96 };
const escapeHtml = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function localizeWarriorRacialTable(original, labels, source, locale) {
  const table = original.match(/<table>[\s\S]*?<\/table>/)?.[0];
  if (!table || !labels?.headers || !labels?.descriptions || !labels?.and ||
    !labels?.factions) throw new Error("Warrior racial table or labels missing");
  const indices = new Map(source.keys.map((key, index) => [key, index]));
  let rows = 0;
  const translated = table.replace(/<tr><td>([^<]+)<\/td><td>(Alliance|Horde)<\/td><td>([\s\S]*?)<\/td><\/tr>/g,
    (_, english, faction, abilities) => {
      const id = raceIds[english];
      const index = indices.get(`ChrRaces:${id}:2`);
      if (!id || index === undefined || source.values[index] !== english || !locale.values[index]) {
        throw new Error(`Missing client Warrior race ${english}`);
      }
      let descriptions = 0;
      const localizedAbilities = abilities.replace(/\(([^()]*)\)/g, (match, description) => {
        if (!labels.descriptions[description]) throw new Error(`Missing racial description ${description}`);
        descriptions += 1;
        return `(${labels.descriptions[description]})`;
      }).replace(/<\/a> and <a/g, `</a>${labels.and}<a`);
      if (descriptions < 2) throw new Error(`Missing racial notes for ${english}`);
      rows += 1;
      return `<tr><td>${escapeHtml(locale.values[index])}</td><td>${labels.factions[faction]}</td>` +
        `<td>${localizedAbilities}</td></tr>`;
    });
  if (rows !== 10) throw new Error(`Expected ten racial rows, found ${rows}`);
  return translated.replace(/<th>([^<]+)<\/th>/g, (_, header) => {
    if (!labels.headers[header]) throw new Error(`Missing racial header ${header}`);
    return `<th>${labels.headers[header]}</th>`;
  });
}

export function localizeWarriorRaceList(original, source, locale, language, faction) {
  const races = faction === "alliance"
    ? ["Human", "Dwarf", "Night Elf", "Gnome", "High Order Skyborne"]
    : faction === "horde"
      ? ["Orc", "Undead", "Tauren", "Troll", "Windshaper Skyborne"] : null;
  if (!races) throw new Error(`Unknown Warrior faction ${faction}`);
  const indices = new Map(source.keys.map((key, index) => [key, index]));
  return races.map((english) => {
    if (!original.includes(english)) throw new Error(`Missing source Warrior race ${english}`);
    const index = indices.get(`ChrRaces:${raceIds[english]}:2`);
    if (index === undefined || source.values[index] !== english || !locale.values[index]) {
      throw new Error(`Missing client Warrior race ${english}`);
    }
    return escapeHtml(locale.values[index]);
  }).join(language.startsWith("zh") ? "、" : ", ");
}
