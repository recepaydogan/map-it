/** Keep the client's race and place names in the starting-zone table. */
const raceIds = { Human: 1, Dwarf: 3, Gnome: 7, "Night Elf": 4,
  "High Order Skyborne": 95, Orc: 2, Troll: 8, Tauren: 6, Undead: 5,
  "Windshaper Skyborne": 96 };

export function localizeLevelingStartingTable(original, labels, source, locale, language) {
  const table = original.match(/<table>[\s\S]*?<\/table>/)?.[0];
  if (!table || !labels) throw new Error("Leveling starting table or labels missing");
  const indices = new Map(source.keys.map((key, index) => [key, index]));
  const areas = new Map();
  source.keys.forEach((key, index) => {
    if (!key.startsWith("AreaTable:") || !key.endsWith(":1")) return;
    if (!areas.has(source.values[index])) areas.set(source.values[index], []);
    if (locale.values[index]) areas.get(source.values[index]).push(locale.values[index]);
  });
  const area = (english) => {
    const candidates = [...new Set(areas.get(english) ?? [])];
    const choices = candidates.filter((value) => !value.includes("("));
    const preferred = choices.length ? choices : candidates;
    const value = preferred.find((name) => name.includes("’")) ?? preferred[0];
    if (!value) throw new Error(`Missing client starting area: ${english}`);
    return value;
  };
  const race = (english) => {
    const id = raceIds[english];
    const index = indices.get(`ChrRaces:${id}:2`);
    if (!id || index === undefined || !locale.values[index]) {
      throw new Error(`Missing client starting race: ${english}`);
    }
    return locale.values[index];
  };
  const separator = language.startsWith("zh") ? "、" : ", ";
  let rows = 0;
  const translated = table.replace(/<tr><td>([\s\S]*?)<\/tr>/g, (row) => {
    const cells = [...row.matchAll(/<td>([\s\S]*?)<\/td>/g)].map(([, value]) => value);
    if (cells.length !== 6) throw new Error("Starting-zone row must have six cells");
    rows += 1;
    const [races, faction, zone, levels, towns, next] = cells;
    const values = [
      races.split(", ").map(race).join(separator),
      labels[faction],
      zone.startsWith("<a ") ? zone : area(zone),
      levels.replace("(Blizzard)", `(${labels.Blizzard})`),
      towns.split(", ").map(area).join(separator),
      labels[next] ?? area(next),
    ];
    if (values.some((value) => !value)) throw new Error(`Missing starting row label: ${races}`);
    return `<tr>${values.map((value) => `<td>${value}</td>`).join("")}</tr>`;
  });
  if (rows !== 8) throw new Error(`Expected eight starting rows, found ${rows}`);
  return translated.replace(/<th>([^<]+)<\/th>/g, (_, value) => {
    if (!labels[value]) throw new Error(`Missing starting table header: ${value}`);
    return `<th>${labels[value]}</th>`;
  });
}
