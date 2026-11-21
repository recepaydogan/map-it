// Copy one representative extracted icon per item category into
// public/icons/_fallback/<category>.png. These small (~556KB total) icons ship in
// the OPK and are shown beneath an item's real icon while it streams from the CDN
// (and kept if it never arrives, e.g. offline). See src/data/fallback-icons.ts for
// the runtime side — keep FALLBACK_CATEGORIES there in sync with FALLBACKS here.
//
// To change a pick: edit the icon id below and re-run `node scripts/build-fallback-icons.mjs`.
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
// The item icons no longer live in this repo (they're in ER-Atlas-Assets, served
// via the CDN). Point ITEMS_SRC at a local copy of that set to re-pick fallbacks,
// e.g. ITEMS_SRC="C:/Users/recep/ER-Atlas-Assets/icons/elden-ring/items". Falls
// back to the old in-repo path if it still exists (e.g. right after re-extraction).
const SRC = process.env.ITEMS_SRC || path.join(ROOT, "public/icons/elden-ring/items");
const OUT = path.join(ROOT, "public/icons/_fallback");

if (!fs.existsSync(SRC)) {
  console.error(`Item icon source not found: ${SRC}`);
  console.error('Set ITEMS_SRC to your ER-Atlas-Assets icons/elden-ring/items folder and re-run.');
  process.exit(1);
}

// category → representative game icon id (chosen from that group's own icons).
const FALLBACKS = {
  // Equipment
  weapon: 10040,        // Longsword
  shield: 12069,        // Heater Shield
  armor: 14990,         // Knight Helm
  talisman: 18040,      // Erdtree's Favor
  "ash-of-war": 8401,   // Ash of War: Storm Stomp
  "spirit-ash": 104,    // Lone Wolf Ashes
  sorcery: 6000,        // Glintstone Pebble
  incantation: 6200,    // Catch Flame
  // Upgrades & collectibles
  "smithing-stone": 2005,
  "golden-seed": 383,
  "sacred-tear": 384,
  glovewort: 2110,      // Ghost Glovewort [1]
  "larval-tear": 3075,
  "map-fragment": 261,  // Map: Limgrave, West
  "bell-bearing": 3142,
  cookbook: 3119,       // Nomadic Warrior's Cookbook [1]
  key: 228,             // Stonesword Key
  whetblade: 3020,      // Iron Whetblade
  // NPC group, item icon
  "teardrop-scarab": 15310, // Crimson Tear Scarab
  // Codex-only goods buckets
  consumable: 15,       // Flask of Crimson Tears
  material: 526,        // Erdleaf Flower
};

fs.mkdirSync(OUT, { recursive: true });
let ok = 0;
const missing = [];
for (const [cat, id] of Object.entries(FALLBACKS)) {
  const from = path.join(SRC, `${id}.png`);
  if (!fs.existsSync(from)) {
    missing.push(`${cat} (icon ${id})`);
    continue;
  }
  fs.copyFileSync(from, path.join(OUT, `${cat}.png`));
  ok++;
}

console.log(`Wrote ${ok}/${Object.keys(FALLBACKS).length} fallback icons to public/icons/_fallback/`);
if (missing.length) {
  console.error("MISSING source icons:\n  " + missing.join("\n  "));
  process.exit(1);
}
