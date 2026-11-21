/** Preserve race/class eligibility and game links from the source guide. */
const raceIds = { Human: 1, Dwarf: 3, "Night Elf": 4, Gnome: 7, "High Order Skyborne": 95,
  Orc: 2, Undead: 5, Tauren: 6, Troll: 8, "Windshaper Skyborne": 96 };
const classIds = { Warrior: 1, Paladin: 2, Hunter: 3, Rogue: 4, Priest: 5,
  Shaman: 7, Mage: 8, Warlock: 9, Druid: 11 };
const anchorPattern = /<a\b[^>]*\bdata-guide-link="[^"]+"[^>]*>[^<]*<\/a>/g;

function clientNames(source, locale, table, field, ids) {
  const indices = new Map(source.keys.map((key, index) => [key, index]));
  return Object.fromEntries(Object.entries(ids).map(([english, id]) => {
    const index = indices.get(`${table}:${id}:${field}`);
    if (index === undefined || !locale.values[index]) {
      throw new Error(`Missing client ${table} name: ${english}`);
    }
    return [english, locale.values[index]];
  }));
}

export function localizeGettingStartedRaceTable(original, labels, source, locale, language) {
  const table = [...original.matchAll(/<table>[\s\S]*?<\/table>/g)][0]?.[0];
  if (!table || !labels) throw new Error("Getting-started race table or labels missing");
  const races = clientNames(source, locale, "ChrRaces", 2, raceIds);
  const classes = clientNames(source, locale, "ChrClasses", 0, classIds);
  const separator = language.startsWith("zh") ? "、" : ", ";
  let rows = 0;
  const translated = table.replace(/<tr><td>([^<]+)<\/td><td>(Alliance|Horde)<\/td><td>([^<]+)<\/td><td>(<a[\s\S]*?<\/a>)<\/td><\/tr>/g,
    (_, race, faction, classNames, areaLink) => {
      rows += 1;
      if (!races[race] || !labels[faction]) throw new Error(`Unknown race/faction: ${race}/${faction}`);
      const classList = classNames.split(", ").map((name) => {
        if (!classes[name]) throw new Error(`Unknown race-table class: ${name}`);
        return classes[name];
      }).join(separator);
      return `<tr><td>${races[race]}</td><td>${labels[faction]}</td><td>${classList}</td><td>${areaLink}</td></tr>`;
    });
  if (rows !== 10) throw new Error(`Expected 10 race rows, found ${rows}`);
  return translated.replace(/<th>([^<]+)<\/th>/g, (_, value) => {
    if (!labels[value]) throw new Error(`Missing race-table header: ${value}`);
    return `<th>${labels[value]}</th>`;
  });
}

export function localizeGettingStartedRacialLists(original, descriptions, source, locale) {
  const lists = [...original.matchAll(/<ul>([\s\S]*?)<\/ul>/g)];
  if (lists.length !== 2 || descriptions?.length !== 10) {
    throw new Error("Getting-started racial list needs ten translated entries");
  }
  const races = clientNames(source, locale, "ChrRaces", 2, raceIds);
  let index = 0;
  return lists.map(([, list]) => {
    const entries = [...list.matchAll(/<li><b>([^<]+):<\/b>([\s\S]*?)<\/li>/g)];
    if (entries.length !== 5) throw new Error("Racial list must have five entries");
    return `<ul>${entries.map(([, english, body]) => {
      const links = [...body.matchAll(anchorPattern)].map(([anchor]) => anchor);
      const description = descriptions[index++];
      const placeholders = [...description.matchAll(/\{\{(\d+)\}\}/g)].map(([, number]) => Number(number));
      if (links.length !== 4 || JSON.stringify(placeholders) !== JSON.stringify([0, 1, 2, 3])) {
        throw new Error(`Racial description links changed: ${english}`);
      }
      if (!races[english]) throw new Error(`Unknown racial race: ${english}`);
      return `<li><b>${races[english]}:</b> ${description.replace(/\{\{(\d+)\}\}/g,
        (_, number) => links[Number(number)])}</li>`;
    }).join("")}</ul>`;
  });
}

export function localizeGettingStartedPriestTable(original, labels, descriptions, source, locale) {
  const table = [...original.matchAll(/<table>[\s\S]*?<\/table>/g)][1]?.[0];
  if (!table || !labels || descriptions?.length !== 6) {
    throw new Error("Getting-started priest table or translations missing");
  }
  const races = clientNames(source, locale, "ChrRaces", 2, raceIds);
  let row = 0;
  const translated = table.replace(/<tr><td>([^<]+)<\/td><td>(<a[^>]+>[^<]+<\/a>): ([^<]+)<\/td><td>(<a[^>]+>[^<]+<\/a>): ([^<]+)<\/td><\/tr>/g,
    (_, race, level10, _description10, level20, _description20) => {
      const localized = descriptions[row++];
      if (!races[race] || !localized?.[0] || !localized?.[1]) {
        throw new Error(`Missing priest row: ${race}`);
      }
      return `<tr><td>${races[race]}</td><td>${level10}: ${localized[0]}</td><td>${level20}: ${localized[1]}</td></tr>`;
    });
  if (row !== 6) throw new Error(`Expected six priest rows, found ${row}`);
  return translated.replace(/<th>([^<]+)<\/th>/g, (_, value) => {
    if (!labels[value]) throw new Error(`Missing priest-table header: ${value}`);
    return `<th>${labels[value]}</th>`;
  });
}
