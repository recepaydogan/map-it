/** Localize Paladin racial notes while keeping client race and spell identities. */
const raceIds = { Human: 1, Dwarf: 3, Undead: 5 };
const escapeHtml = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function localizePaladinRacialTable(original, labels, source, locale) {
  const table = original.match(/<table>[\s\S]*?<\/table>/)?.[0];
  if (!table || !labels?.headers || !labels?.descriptions || !labels?.factions) {
    throw new Error("Paladin racial table or labels missing");
  }
  const indices = new Map(source.keys.map((key, index) => [key, index]));
  let rows = 0;
  const translated = table.replace(/<tr><td>(Human|Dwarf|Undead)<\/td><td>(Alliance|Horde)<\/td><td>([\s\S]*?)<\/td><\/tr>/g,
    (_, english, faction, abilities) => {
      const index = indices.get(`ChrRaces:${raceIds[english]}:2`);
      if (index === undefined || source.values[index] !== english || !locale.values[index]) {
        throw new Error(`Missing client Paladin race ${english}`);
      }
      let notes = 0;
      const localized = abilities.replace(/\(([^()]*)\)/g, (_, description) => {
        const value = labels.descriptions[description];
        if (!value) throw new Error(`Missing Paladin racial description ${description}`);
        notes += 1;
        return `(${escapeHtml(value)})`;
      });
      if (notes !== 3 || !labels.factions[faction]) {
        throw new Error(`Paladin racial notes or faction changed: ${english}`);
      }
      rows += 1;
      return `<tr><td>${escapeHtml(locale.values[index])}</td><td>${escapeHtml(labels.factions[faction])}</td><td>${localized}</td></tr>`;
    });
  if (rows !== 3) throw new Error(`Expected three Paladin racial rows, found ${rows}`);
  return translated.replace(/<th>([^<]+)<\/th>/g, (_, header) => {
    if (!labels.headers[header]) throw new Error(`Missing Paladin racial header ${header}`);
    return `<th>${escapeHtml(labels.headers[header])}</th>`;
  });
}
