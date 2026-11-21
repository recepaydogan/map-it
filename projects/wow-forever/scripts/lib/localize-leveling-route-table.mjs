/** Translate route-table labels while preserving the English guide's levels and quest counts. */
const raceIds = { Humans: [1], "Dwarves, Gnomes": [3, 7], "Night Elves": [4],
  "High Order Skyborne": [95], "Windshaper Skyborne": [96],
  "Orcs, Trolls": [2, 8], Tauren: [6], Undead: [5] };
const flightPointNames = {
  "Tidegear Coast": { key: "TaxiNodes:3205:0", zoneKey: "AreaTable:1:1", source: "Tidegear Coast, Dun Morogh" },
  "Fishing Village": { key: "TaxiNodes:57:0", zoneKey: "AreaTable:141:1", source: "Fishing Village, Teldrassil" },
};
const escapeHtml = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function localizeLevelingRouteTable(original, labels, source, locale, language, faction) {
  const table = original.match(/<table>[\s\S]*?<\/table>/)?.[0];
  if (!table || !labels?.headers || !labels?.contested || !labels?.neutral ||
    !labels?.notCounted || !labels?.notInData || !labels?.alteracNote) {
    throw new Error("Leveling route table or labels missing");
  }
  const indices = new Map(source.keys.map((key, index) => [key, index]));
  const areas = new Map();
  source.keys.forEach((key, index) => {
    if (!key.startsWith("AreaTable:") || !key.endsWith(":1")) return;
    const english = source.values[index];
    if (!areas.has(english)) areas.set(english, []);
    if (locale.values[index]) areas.get(english).push(locale.values[index]);
  });
  const client = (key) => {
    const index = indices.get(key);
    if (index === undefined || !locale.values[index]) throw new Error(`Missing client route term ${key}`);
    return escapeHtml(locale.values[index]);
  };
  const flightPoint = (english) => {
    const record = flightPointNames[english];
    const index = indices.get(record.key);
    const zoneIndex = indices.get(record.zoneKey);
    if (index === undefined || zoneIndex === undefined || source.values[index] !== record.source ||
      !locale.values[index] || !locale.values[zoneIndex]) {
      throw new Error(`Missing client flight point ${english}`);
    }
    const full = locale.values[index];
    const zone = locale.values[zoneIndex];
    const suffix = [`, ${zone}`, `，${zone}`, ` - ${zone}`, ` (${zone})`]
      .find((value) => full.endsWith(value));
    if (!suffix || full.length <= suffix.length) {
      throw new Error(`Unexpected client flight point format ${english}`);
    }
    return escapeHtml(full.slice(0, -suffix.length));
  };
  const area = (english) => {
    if (english === "Crossroads") english = "The Crossroads";
    if (english === "Stormwind") return client("Faction:72:0");
    if (Object.hasOwn(flightPointNames, english)) return flightPoint(english);
    const candidates = [...new Set(areas.get(english) ?? [])];
    const plain = candidates.filter((name) => !name.includes("("));
    const preferred = plain.length ? plain : candidates;
    const value = preferred.find((name) => name.includes("’")) ?? preferred[0];
    if (value) return escapeHtml(value);
    throw new Error(`Missing client route area ${english}`);
  };
  const separator = language.startsWith("zh") ? "、" : ", ";
  const placeList = (value) => value.split(", ").map((part) => {
    if (part === "Ratchet (neutral)") return `${area("Ratchet")} (${labels.neutral})`;
    if (part.startsWith("Tarren Mill (")) {
      return `${area("Tarren Mill")} (${labels.alteracNote.replace("{area}", area("Alterac Mountains"))})`;
    }
    return area(part);
  }).join(separator);
  const zone = (value) => {
    const match = value.match(/^(.*) \(([^()]*)\)$/);
    const english = match ? match[1] : value;
    const name = english.startsWith("<a ") ? english : area(english);
    if (!match) return name;
    const qualifier = match[2];
    if (qualifier === "contested") return `${name} (${labels.contested})`;
    const ids = raceIds[qualifier];
    if (!ids) throw new Error(`Unknown route qualifier ${qualifier}`);
    return `${name} (${ids.map((id) => client(`ChrRaces:${id}:2`)).join(separator)})`;
  };
  let rows = 0;
  const translated = table.replace(/<tr><td>([\s\S]*?)<\/tr>/g, (row) => {
    const cells = [...row.matchAll(/<td>([\s\S]*?)<\/td>/g)].map(([, value]) => value);
    if (cells.length !== 5) throw new Error("Route row must have five cells");
    rows += 1;
    const [levels, areaName, quests, towns, flight] = cells;
    const values = [levels, zone(areaName), quests === "not counted" ? labels.notCounted : quests,
      placeList(towns), flight === "not in our data" ? labels.notInData : placeList(flight)];
    return `<tr>${values.map((value) => `<td>${value}</td>`).join("")}</tr>`;
  });
  const expectedRows = faction === "alliance" ? 13 : faction === "horde" ? 10 : 0;
  if (rows !== expectedRows) throw new Error(`Expected ${expectedRows} ${faction} route rows, found ${rows}`);
  return translated.replace(/<th>([^<]+)<\/th>/g, (_, value) => {
    if (!labels.headers[value]) throw new Error(`Missing route table header ${value}`);
    return `<th>${labels.headers[value]}</th>`;
  });
}
