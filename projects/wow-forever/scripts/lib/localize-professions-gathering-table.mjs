const zones = {
  "Elwynn Forest": 12, "Dun Morogh": 1, Teldrassil: 141, Durotar: 14,
  Mulgore: 215, "Tirisfal Glades": 85, Westfall: 40, "Loch Modan": 38,
  "Silverpine Forest": 130, "The Barrens": 17, Darkshore: 148,
  "Redridge Mountains": 44, "Stonetalon Mountains": 406, Ashenvale: 331,
  Wetlands: 11, Duskwood: 10,
};
const herbs = {
  Silverleaf: 765, Peacebloom: 2447, Earthroot: 2449, Mageroyal: 785,
  Stranglekelp: 3820, Bruiseweed: 2453, Briarthorn: 2450,
  "Khadgar's Whisker": 3358, Fadeleaf: 3818, "Wild Steelbloom": 3355,
  Kingsblood: 3356, "Grave Moss": 3369, Liferoot: 3357,
};
const ore = { Copper: 2770, Tin: 2771, Silver: 2775, Iron: 2772, Gold: 2776 };
const escapeHtml = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Keep Classic spawn counts, with zone and resource names from the installed client. */
export function localizeProfessionsGatheringTable(original, labels, source, locale) {
  const table = original.match(/<table>[\s\S]*?<\/table>/)?.[0];
  if (!table || !labels?.headers || !labels?.noneListed) {
    throw new Error("Gathering table or labels missing");
  }
  const indices = new Map(source.keys.map((key, index) => [key, index]));
  const name = (key, expected) => {
    const index = indices.get(key);
    if (index === undefined || source.values[index] !== expected || !locale.values[index]) {
      throw new Error(`Unavailable gathering client name ${key}`);
    }
    return escapeHtml(locale.values[index]);
  };
  const list = (text, catalog, suffix = "") => {
    if (text === "none listed") return escapeHtml(labels.noneListed);
    return text.split(", ").map((entry) => {
      const match = entry.match(/^(.+) (\d+)$/);
      if (!match || !catalog[match[1]]) throw new Error(`Unknown gathering resource ${entry}`);
      return `${name(`ItemSparse:${catalog[match[1]]}:4`, match[1] + suffix)} ${match[2]}`;
    }).join(", ");
  };
  const rows = [...table.matchAll(/<tr><td>([^<]+)<\/td><td>([^<]+)<\/td><td>([^<]+)<\/td><td>([^<]+)<\/td><\/tr>/g)]
    .map(([, zone, levels, herbList, oreList]) => {
      if (!zones[zone] || !/^\d+–\d+$/.test(levels)) {
        throw new Error(`Unknown gathering zone or quest levels ${zone}: ${levels}`);
      }
      const zoneKey = `AreaTable:${zones[zone]}:${[141, 14, 215, 40, 148, 331, 11, 10].includes(zones[zone]) ? 0 : 1}`;
      return `<tr><td>${name(zoneKey, zone)}</td><td>${levels}</td>` +
        `<td>${list(herbList, herbs)}</td><td>${list(oreList, ore, " Ore")}</td></tr>`;
    });
  if (rows.length !== 16 || Object.keys(zones).length !== 16) {
    throw new Error(`Expected 16 Classic gathering zone rows, found ${rows.length}`);
  }
  const headers = ["Zone", "Quest levels", "Herbs (spawn points)", "Ore veins (spawn points)"];
  return `<table><thead><tr>${headers.map((header) => {
    if (!labels.headers[header]) throw new Error(`Missing gathering table header ${header}`);
    return `<th>${escapeHtml(labels.headers[header])}</th>`;
  }).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table>`;
}
