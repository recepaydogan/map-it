import { localizeGuideSectionLinks } from "./localize-warrior-ability-table.mjs";

const raceIds = { Human: 1, Dwarf: 3, "Night Elf": 4, Gnome: 7, Undead: 5, Troll: 8 };
const escapeHtml = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Preserve the trainer/racial spell links and source claims while using client race and spell names. */
export function localizePriestRacialTable(original, labels, source, locale) {
  const table = original.match(/<table>[\s\S]*?<\/table>/)?.[0];
  if (!table || !labels?.headers || !labels?.factions || !labels?.descriptions) {
    throw new Error("Priest racial table or labels missing");
  }
  const indices = new Map(source.keys.map((key, index) => [key, index]));
  let rows = 0;
  const translated = table.replace(/<tr><td>([^<]+)<\/td><td>(Alliance|Horde)<\/td><td>([\s\S]*?)<\/td><td>([\s\S]*?)<\/td><\/tr>/g,
    (_, race, faction, priestSpells, racials) => {
      const id = raceIds[race];
      const index = indices.get(`ChrRaces:${id}:2`);
      const note = labels.descriptions[race];
      if (!id || index === undefined || source.values[index] !== race || !locale.values[index] ||
        !labels.factions[faction] || !note?.spells || !note?.racials) {
        throw new Error(`Missing Priest racial translation: ${race}`);
      }
      rows += 1;
      return `<tr><td>${escapeHtml(locale.values[index])}</td>` +
        `<td>${escapeHtml(labels.factions[faction])}</td>` +
        `<td>${localizeGuideSectionLinks(priestSpells, note.spells)}</td>` +
        `<td>${localizeGuideSectionLinks(racials, note.racials)}</td></tr>`;
    });
  if (rows !== 6) throw new Error(`Expected six Priest racial rows, found ${rows}`);
  return translated.replace(/<th>([^<]+)<\/th>/g, (_, header) => {
    if (!labels.headers[header]) throw new Error(`Missing Priest table header ${header}`);
    return `<th>${escapeHtml(labels.headers[header])}</th>`;
  });
}
