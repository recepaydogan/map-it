import { localizeGuideSectionLinks } from "./localize-warrior-ability-table.mjs";

const races = { "Night Elf": 4, "High Order Skyborne": 95, Tauren: 6,
  "Windshaper Skyborne": 96 };
const zones = { Teldrassil: 141, "Zephras Isle": 16593, Mulgore: 215 };
const escapeHtml = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Keep the source racial links and obtain race/zone names from the installed client. */
export function localizeDruidRacialTable(original, labels, source, locale) {
  const table = original.match(/<table>[\s\S]*?<\/table>/)?.[0];
  if (!table || !labels?.headers || !labels?.factions || !labels?.descriptions ||
    !labels?.skyborneLevels) throw new Error("Druid racial table or labels missing");
  const indices = new Map(source.keys.map((key, index) => [key, index]));
  const clientName = (key, english) => {
    const index = indices.get(key);
    if (index === undefined || source.values[index] !== english || !locale.values[index]) {
      throw new Error(`Missing client Druid term ${key}: ${english}`);
    }
    return escapeHtml(locale.values[index]);
  };
  let rows = 0;
  const translated = table.replace(/<tr><td>(Night Elf|High Order Skyborne|Tauren|Windshaper Skyborne) \((Alliance|Horde)\)<\/td><td>([^<]+)<\/td><td>([\s\S]*?)<\/td><\/tr>/g,
    (_, race, faction, start, description) => {
      if (!labels.factions[faction] || !labels.descriptions[race]) {
        throw new Error(`Missing Druid racial prose for ${race}`);
      }
      const expectedZone = start.replace(", levels 1–12", "");
      if (!zones[expectedZone]) throw new Error(`Unexpected Druid starting zone ${start}`);
      const raceName = clientName(`ChrRaces:${races[race]}:2`, race);
      const zone = clientName(`AreaTable:${zones[expectedZone]}:1`, expectedZone);
      const note = localizeGuideSectionLinks(description, labels.descriptions[race]);
      rows += 1;
      return `<tr><td>${raceName} (${escapeHtml(labels.factions[faction])})</td>` +
        `<td>${zone}${race.includes("Skyborne") ? escapeHtml(labels.skyborneLevels) : ""}</td>` +
        `<td>${note}</td></tr>`;
    });
  if (rows !== 4) throw new Error(`Expected four Druid racial rows, found ${rows}`);
  return translated.replace(/<th>([^<]+)<\/th>/g, (_, header) => {
    if (!labels.headers[header]) throw new Error(`Missing Druid table header ${header}`);
    return `<th>${escapeHtml(labels.headers[header])}</th>`;
  });
}
