const raceIds = { Human: 1, Dwarf: 3, "Night Elf": 4, Undead: 5, Troll: 8 };
const areaIds = { "Elwynn Forest": 12, "Dun Morogh": 1, Teldrassil: 141,
  "Tirisfal Glades": 85, Durotar: 14, "Stormwind City": 1519,
  Ironforge: 1537, Darnassus: 1657, Orgrimmar: 1637,
  Undercity: 1497, "Thunder Bluff": 1638 };
const escapeHtml = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const npcNames = [
  "Marshal McBride", "Sten Stoutarm", "Conservator Ilthalaine", "Shadow Priest Sarvis",
  "Gornek", "Priestess Anetta", "Branstock Khalder", "Shanda", "Dark Cleric Duesten",
  "Ken'jai", "Priestess Josetta", "Maxan Anvol", "Laurna Morninglight",
  "Dark Cleric Beryl", "Tai'jin", "High Priest Rohan", "Priestess Alathea",
  "Ur'kyo", "Father Lankester", "High Priestess Laurena", "Toldren Deepiron",
  "Lariia", "Brother Joshua", "Astarii Starseeker", "Zayus", "Father Cobb", "Miles Welsh",
];

/** Use ID-matched game names for the Priest quest table alongside client race and area names. */
export function localizePriestQuestTable(original, labels, source, locale,
  entitySource, entityLocale, language, npcCatalogs) {
  const table = original.match(/<table>[\s\S]*?<\/table>/)?.[0];
  if (!table || !labels?.headers || !labels?.phrases || entitySource?.version !== 1 ||
    entityLocale?.version !== 1 || entitySource.keys.length !== entitySource.values.length ||
    entityLocale.values.length !== entitySource.keys.length ||
    Object.keys(labels.questNames ?? {}).sort().join(",") !==
      ["A Lack of Fear", "Devouring Plague"].sort().join(",") ||
    Object.values(labels.questNames).some((value) => typeof value !== "string" || !value.trim()) ||
    npcNames.some((name) => !table.includes(name)) ||
    !Array.isArray(npcCatalogs) || npcCatalogs.length !== 3 ||
    npcCatalogs.some((catalog) => !catalog?.names) || !language) {
    throw new Error("Priest quest table, labels or game names missing");
  }
  const indices = new Map(source.keys.map((key, index) => [key, index]));
  const gameIndices = new Map();
  for (const [index, key] of entitySource.keys.entries()) {
    const type = key.split(":")[0];
    if (type !== "Quest" && type !== "Creature") continue;
    const name = entitySource.values[index];
    const matches = gameIndices.get(`${type}:${name}`) ?? [];
    matches.push(index);
    gameIndices.set(`${type}:${name}`, matches);
  }
  const gameName = (type, name) => {
    const matches = gameIndices.get(`${type}:${name}`) ?? [];
    const values = matches.map((index) => entityLocale.values[index]);
    const reviewed = type === "Creature" ? [...new Set(npcCatalogs
      .map((catalog) => catalog.names[name]?.[language]).filter(Boolean))] : [];
    if (values.length && values.every((value) => value && value === values[0])) {
      return escapeHtml(values[0]);
    }
    // The Portuguese client differs only in capitalization across the six
    // Desperate Prayer quest records; use the spelling present in five of them.
    if (type === "Quest" && name === "Desperate Prayer" && language === "pt-BR" &&
      values.filter((value) => value === "Prece desesperada").length === 5) {
      return escapeHtml("Prece desesperada");
    }
    if (reviewed.length === 1) return escapeHtml(reviewed[0]);
    return type === "Quest" && labels.questNames[name]
      ? escapeHtml(labels.questNames[name]) : name;
  };
  const clientValue = (key, expected) => {
    const index = indices.get(key);
    if (index === undefined || source.values[index] !== expected || !locale.values[index]) {
      throw new Error(`Missing Priest quest term ${key}`);
    }
    return escapeHtml(locale.values[index]);
  };
  let rows = 0;
  const translated = table.replace(/<tr><td>(\d+)<\/td><td>([\s\S]*?)<\/td><td>([^<]+)<\/td><td>([\s\S]*?)<\/td><\/tr>/g,
    (_, level, quest, races, starts) => {
      rows += 1;
      const localizedQuest = quest.split(", ").map((name) => gameName("Quest", name)).join(", ");
      const localizedRaces = races.split(", ").map((race) =>
        clientValue(`ChrRaces:${raceIds[race]}:2`, race)).join(", ");
      let localizedStarts = starts;
      for (const name of npcNames.sort((left, right) => right.length - left.length)) {
        localizedStarts = localizedStarts.replaceAll(name, gameName("Creature", name));
      }
      for (const name of quest.split(", ")) {
        localizedStarts = localizedStarts.replaceAll(name, gameName("Quest", name));
      }
      for (const [area, id] of Object.entries(areaIds)) {
        localizedStarts = localizedStarts.replaceAll(area, clientValue(`AreaTable:${id}:1`, area));
      }
      for (const [phrase, replacement] of Object.entries(labels.phrases)) {
        localizedStarts = localizedStarts.replaceAll(phrase, escapeHtml(replacement));
      }
      return `<tr><td>${level}</td><td>${localizedQuest}</td><td>${localizedRaces}</td>` +
        `<td>${localizedStarts}</td></tr>`;
    });
  if (rows !== 22) throw new Error(`Expected 22 Priest quest rows, found ${rows}`);
  return translated.replace(/<th>([^<]+)<\/th>/g, (_, header) => {
    if (!labels.headers[header]) throw new Error(`Missing Priest quest header ${header}`);
    return `<th>${escapeHtml(labels.headers[header])}</th>`;
  });
}
