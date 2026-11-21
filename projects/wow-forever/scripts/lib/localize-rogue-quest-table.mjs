/** Keep Classic quest/NPC evidence while taking place and race names from the client. */
const raceIds = { Human: 1, Dwarf: 3, "Night Elf": 4, Gnome: 7,
  Orc: 2, Undead: 5, Troll: 8 };
const areaKeys = {
  "Elwynn Forest": "AreaTable:12:1", "Dun Morogh": "AreaTable:1:1",
  Teldrassil: "AreaTable:141:1", Durotar: "AreaTable:14:1",
  "Tirisfal Glades": "AreaTable:85:1", "Stormwind City": "AreaTable:1519:1",
  Ironforge: "AreaTable:1537:1", Darnassus: "AreaTable:1657:1",
  Orgrimmar: "AreaTable:1637:1", Undercity: "AreaTable:1497:1",
  "Redridge Mountains": "AreaTable:44:1", "Alterac Mountains": "AreaTable:36:1",
  Westfall: "AreaTable:40:1", "The Barrens": "AreaTable:17:1",
};
const itemQuestKeys = {
  "Encrypted Letter": "ItemSparse:9555:4",
  "Encrypted Memorandum": "ItemSparse:9558:4",
  "Encrypted Rune": "ItemSparse:9550:4",
  "Encrypted Sigil": "ItemSparse:9551:4",
  "Encrypted Parchment": "ItemSparse:9560:4",
  "Encrypted Tablet": "ItemSparse:9554:4",
  "Encrypted Scroll": "ItemSparse:9559:4",
  "Onin's Report": "ItemSparse:7715:4",
  "Horns of Nez'ra": "ItemSparse:7906:4",
};
const escapeHtml = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function localizeRogueQuestTable(original, labels, source, locale) {
  const table = original.match(/<table>[\s\S]*?<\/table>/)?.[0];
  if (!table || !labels?.headers || !labels?.factions || !labels?.undeadOnly ||
    !labels?.allRaces || !labels?.unspecified || !labels?.noGiver || !labels?.and ||
    !labels?.then || !labels?.separator) throw new Error("Rogue quest table or translations missing");
  const indices = new Map(source.keys.map((key, index) => [key, index]));
  const clientName = (key, expected) => {
    const index = indices.get(key);
    if (index === undefined || source.values[index] !== expected || !locale.values[index]) {
      throw new Error(`Missing client Rogue quest term ${key}`);
    }
    return escapeHtml(locale.values[index]);
  };
  const race = (english) => clientName(`ChrRaces:${raceIds[english]}:2`, english);
  const audience = (english) => {
    if (labels.factions[english]) return escapeHtml(labels.factions[english]);
    if (english === "All races") return escapeHtml(labels.allRaces);
    if (english === "No race or faction in the data") return escapeHtml(labels.unspecified);
    if (english === "Horde; Fenwick Thatros is Undead only") {
      return `${escapeHtml(labels.factions.Horde)}; ${escapeHtml(labels.undeadOnly)}`;
    }
    return english.split(", ").map(race).join(escapeHtml(labels.separator));
  };
  let row = 0;
  const translated = table.replace(/<th>([^<]+)<\/th>/g, (_, english) => {
    if (!labels.headers[english]) throw new Error(`Missing Rogue quest header ${english}`);
    return `<th>${escapeHtml(labels.headers[english])}</th>`;
  }).replace(/<tr><td>(\d+)<\/td><td>([^<]+)<\/td><td>([^<]+)<\/td><td>([\s\S]*?)<\/td><\/tr>/g,
    (_, level, quest, englishAudience, englishStart) => {
      const questNames = quest.split(", ").map((name) => itemQuestKeys[name]
        ? clientName(itemQuestKeys[name], name) : name).join(escapeHtml(labels.separator));
      let start = englishStart;
      for (const [english, key] of Object.entries(areaKeys).sort((a, b) => b[0].length - a[0].length)) {
        start = start.replaceAll(english, clientName(key, english));
      }
      start = start.replaceAll(" and ", ` ${escapeHtml(labels.and)} `)
        .replaceAll(", then ", `, ${escapeHtml(labels.then)} `)
        .replace("The data names no giver", escapeHtml(labels.noGiver));
      row += 1;
      return `<tr><td>${level}</td><td>${questNames}</td><td>${audience(englishAudience)}</td>` +
        `<td>${start}</td></tr>`;
    });
  if (row !== 30) throw new Error(`Expected 30 Rogue quest rows, found ${row}`);
  return translated;
}
