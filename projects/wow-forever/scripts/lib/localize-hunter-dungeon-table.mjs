const areaIds = { "Silverpine Forest": 130, Ashenvale: 331, Stormwind: 1519,
  "The Barrens": 17, "Dun Morogh": 1, Wetlands: 11, "Tirisfal Glades": 85, Badlands: 3 };
const bossIds = [3480, 3481, 3644, 3482];
const escapeHtml = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Preserve dungeon links and get place/boss names from the installed client. */
export function localizeHunterDungeonTable(original, labels, source, locale) {
  const table = original.match(/<table>[\s\S]*?<\/table>/)?.[0];
  if (!table || !labels?.headers || !labels?.from || !labels?.plus || !labels?.range ||
    !labels?.newlyOpened || !labels?.excavationNote) throw new Error("Hunter dungeon labels missing");
  const indices = new Map(source.keys.map((key, index) => [key, index]));
  const name = (key, english) => {
    const index = indices.get(key);
    if (index === undefined || !source.values[index].includes(english) || !locale.values[index]) {
      throw new Error(`Missing client dungeon term ${key}: ${english}`);
    }
    return escapeHtml(locale.values[index]);
  };
  let rows = 0;
  const translated = table.replace(/<tr><td>([\s\S]*?)<\/td><td>([^<]+)<\/td><td>([^<]+)<\/td><\/tr>/g,
    (_, dungeonCell, level, place) => {
      const dungeon = dungeonCell.replace(/<[^>]+>/g, "");
      const zone = place.split(";")[0];
      if (!areaIds[zone]) throw new Error(`Unexpected Hunter dungeon zone ${zone}`);
      let localizedLevel;
      if (level.startsWith("from ")) localizedLevel = labels.from.replace("{level}", level.slice(5));
      else if (level === "25+ (Blizzard)" || level === "30+ (Blizzard)") {
        localizedLevel = labels.plus.replace("{level}", level.slice(0, 2));
      } else if (level === "26–31 (Blizzard)") localizedLevel = labels.range;
      else throw new Error(`Unexpected Hunter dungeon level ${level}`);
      const location = name(`AreaTable:${areaIds[zone]}:1`, zone);
      let note = "";
      if (dungeon === "Razorfen Downs" || dungeon === "Uldaman") note = `; ${escapeHtml(labels.newlyOpened)}`;
      if (dungeon === "Excavation Site: Wetlands") {
        const bosses = bossIds.map((id, index) => name(`DungeonEncounter:${id}:0`,
          ["Saltspine", "Shadetooth", "Highland Horror", "Relic Guardian"][index]));
        note = `; ${escapeHtml(labels.excavationNote)}: ${bosses.join(", ")}`;
      }
      rows += 1;
      const cell = dungeon === "Scarlet Monastery" ?
        name("LFGDungeons:17:0", dungeon) : dungeonCell;
      return `<tr><td>${cell}</td><td>${escapeHtml(localizedLevel)}</td><td>${location}${note}</td></tr>`;
    });
  if (rows !== 9) throw new Error(`Expected nine Hunter dungeon rows, found ${rows}`);
  return translated.replace(/<th>([^<]+)<\/th>/g, (_, header) => {
    if (!labels.headers[header]) throw new Error(`Missing Hunter dungeon header ${header}`);
    return `<th>${escapeHtml(labels.headers[header])}</th>`;
  });
}
