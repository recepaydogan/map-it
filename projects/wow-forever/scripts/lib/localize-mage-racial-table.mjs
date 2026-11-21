import { localizeGuideSectionLinks } from "./localize-warrior-ability-table.mjs";

const races = { Human: 1, Gnome: 7, "High Order Skyborne": 95, Orc: 2, Undead: 5, Troll: 8 };
const zones = { "Elwynn Forest": 12, "Dun Morogh": 1, "Zephras Isle": 16593,
  Durotar: 14, "Tirisfal Glades": 85 };
const escapeHtml = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Keep each source racial link and obtain race/zone names from the installed client. */
export function localizeMageRacialTable(original, labels, source, locale) {
  const table = original.match(/<table>[\s\S]*?<\/table>/)?.[0];
  if (!table || !labels?.headers || !labels?.factions || !labels?.descriptions || !labels?.skyborneLevels) {
    throw new Error("Mage racial table or labels missing");
  }
  const indices = new Map(source.keys.map((key, index) => [key, index]));
  const clientName = (key, english) => {
    const index = indices.get(key);
    if (index === undefined || source.values[index] !== english || !locale.values[index]) {
      throw new Error(`Missing client Mage term ${key}: ${english}`);
    }
    return escapeHtml(locale.values[index]);
  };
  let rows = 0;
  const translated = table.replace(/<tr><td>(Human|Gnome|High Order Skyborne|Orc|Undead|Troll) \((Alliance|Horde)\)<\/td><td>([^<]+)<\/td><td>([\s\S]*?)<\/td><\/tr>/g,
    (_, race, faction, start, description) => {
      if (!labels.factions[faction] || !labels.descriptions[race]) {
        throw new Error(`Missing Mage racial prose for ${race}`);
      }
      const expectedZone = start.replace(", levels 1–12", "");
      if (!zones[expectedZone]) throw new Error(`Unexpected Mage starting zone ${start}`);
      const zone = clientName(`AreaTable:${zones[expectedZone]}:1`, expectedZone);
      const raceName = clientName(`ChrRaces:${races[race]}:2`, race);
      const note = localizeGuideSectionLinks(description, labels.descriptions[race]);
      rows += 1;
      return `<tr><td>${raceName} (${escapeHtml(labels.factions[faction])})</td>` +
        `<td>${zone}${race === "High Order Skyborne" ? escapeHtml(labels.skyborneLevels) : ""}</td>` +
        `<td>${note}</td></tr>`;
    });
  if (rows !== 6) throw new Error(`Expected six Mage racial rows, found ${rows}`);
  return translated.replace(/<th>([^<]+)<\/th>/g, (_, header) => {
    if (!labels.headers[header]) throw new Error(`Missing Mage table header ${header}`);
    return `<th>${escapeHtml(labels.headers[header])}</th>`;
  });
}
