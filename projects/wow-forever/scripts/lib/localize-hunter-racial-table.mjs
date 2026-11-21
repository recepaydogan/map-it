import { localizeGuideSectionLinks } from "./localize-warrior-ability-table.mjs";

const raceIds = { Human: 1, Dwarf: 3, "Night Elf": 4, "High Order Skyborne": 95,
  Orc: 2, Tauren: 6, Troll: 8, "Windshaper Skyborne": 96 };
const escapeHtml = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Preserve racial spell links while taking race and spell names from the installed client. */
export function localizeHunterRacialTable(original, labels, source, locale) {
  const table = original.match(/<table>[\s\S]*?<\/table>/)?.[0];
  if (!table || !labels?.headers || !labels?.factions || !labels?.descriptions) {
    throw new Error("Hunter racial table or labels missing");
  }
  const indices = new Map(source.keys.map((key, index) => [key, index]));
  let rows = 0;
  const translated = table.replace(/<tr><td>([^<]+)<\/td><td>(Alliance|Horde)<\/td><td>([\s\S]*?)<\/td><\/tr>/g,
    (_, race, faction, description) => {
      const id = raceIds[race];
      const index = indices.get(`ChrRaces:${id}:2`);
      const note = labels.descriptions[race] ?? (race.endsWith("Skyborne") ? labels.descriptions.Skyborne : null);
      if (!id || index === undefined || source.values[index] !== race || !locale.values[index] ||
        !labels.factions[faction] || !note) {
        throw new Error(`Missing Hunter racial translation: ${race}`);
      }
      rows += 1;
      return `<tr><td>${escapeHtml(locale.values[index])}</td>` +
        `<td>${escapeHtml(labels.factions[faction])}</td>` +
        `<td>${localizeGuideSectionLinks(description, note)}</td></tr>`;
    });
  if (rows !== 8) throw new Error(`Expected eight Hunter racial rows, found ${rows}`);
  return translated.replace(/<th>([^<]+)<\/th>/g, (_, header) => {
    if (!labels.headers[header]) throw new Error(`Missing Hunter table header ${header}`);
    return `<th>${escapeHtml(labels.headers[header])}</th>`;
  });
}
