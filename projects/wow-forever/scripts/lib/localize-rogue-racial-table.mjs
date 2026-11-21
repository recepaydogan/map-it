import { localizeGuideSectionLinks } from "./localize-warrior-ability-table.mjs";

/** Keep racial links and client race names while translating their Rogue effects. */
const raceIds = { Human: 1, Dwarf: 3, "Night Elf": 4, Gnome: 7,
  "High Order Skyborne": 95, Orc: 2, Undead: 5, Troll: 8,
  "Windshaper Skyborne": 96 };
const escapeHtml = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function localizeRogueRacialTable(original, labels, source, locale) {
  const table = original.match(/<table>[\s\S]*?<\/table>/)?.[0];
  if (!table || !labels?.headers || !labels?.factions || labels?.descriptions?.length !== 9) {
    throw new Error("Rogue racial table or translations missing");
  }
  const indices = new Map(source.keys.map((key, index) => [key, index]));
  let row = 0;
  const translated = table.replace(/<th>([^<]+)<\/th>/g, (_, english) => {
    if (!labels.headers[english]) throw new Error(`Missing Rogue racial header ${english}`);
    return `<th>${escapeHtml(labels.headers[english])}</th>`;
  }).replace(/<tr><td>([^<]+)<\/td><td>(Alliance|Horde)<\/td><td>([\s\S]*?)<\/td><\/tr>/g,
    (_, english, faction, abilities) => {
      const id = raceIds[english];
      const index = indices.get(`ChrRaces:${id}:2`);
      if (!id || index === undefined || source.values[index] !== english || !locale.values[index] ||
        !labels.factions[faction]) throw new Error(`Missing client Rogue race ${english}`);
      const description = localizeGuideSectionLinks(abilities, labels.descriptions[row]);
      row += 1;
      return `<tr><td>${escapeHtml(locale.values[index])}</td><td>${escapeHtml(labels.factions[faction])}</td>` +
        `<td>${description}</td></tr>`;
    });
  if (row !== 9) throw new Error(`Expected 9 Rogue race rows, found ${row}`);
  return translated;
}
