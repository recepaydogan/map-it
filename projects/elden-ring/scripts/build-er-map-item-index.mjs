import fs from "fs";
import path from "path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const markersPath = path.join(rootDir, "src/data/generated/er-markers.json");
const enemyProfilesPath = path.join(rootDir, "public/data/er-map/elden-ring/enemy-profiles.json");
const manifestPath = path.join(rootDir, "public/data/er-map/elden-ring/manifest.json");
const outputPath = path.join(rootDir, "public/data/er-map/elden-ring/item-index.json");
const acquisitionSourcesPath = path.join(
  rootDir,
  "src/data/generated/er-acquisition-sources.json",
);

// This NPC exposes bell-bearing inventories through conditional talk branches.
// Seeing an item in that combined shop table does not prove it is available
// before the player has acquired and delivered the corresponding bearing.
const CONDITIONAL_RESELLER_NPC_PARAM_IDS = new Set([500020079]);

const ENEMY_CATEGORY_PREFIX = "enemy-";
const isErMapEnemyCategory = (category) =>
  category === "enemy" ||
  category === "teardrop-scarab" ||
  category === "invasion" ||
  category === "elite-enemy" ||
  (category && category.startsWith(ENEMY_CATEGORY_PREFIX));

// Boss tiers all answer "where do I get this" the same way a boss does.
const BOSS_CATEGORIES = new Set(["boss", "great-boss", "legendary-boss", "evergaol-boss"]);

const productionMarkerIdFor = (marker) => {
  if (marker.source === "boss") return `er-boss-${marker.id.slice("boss:".length)}`;
  if (marker.source === "world-map-point") return `er-wmp-${marker.id.slice("wmp:".length)}`;
  if (marker.source === "bonfire") return `er-grace-${marker.id.slice("bonfire:".length)}`;
  if (marker.type === "region/mount-jump" && marker.map && marker.regionId != null) {
    return `er-spring-${marker.map}-mj-${marker.regionId}`;
  }
  if (marker.category === "waygate" && marker.map) {
    const part = marker.id.split(":")[3]?.match(/^AEG\d+_(\d+)_(\d+)$/);
    if (part) return `er-waygate-${marker.map}-${part[1]}-${part[2]}`;
  }
  return undefined;
};

const merchantSourceKey = (marker) => createHash("sha1")
  .update(`${marker.name}|${marker.shop.map((ware) => `${ware.itemKey}:${ware.note ?? ""}`).sort().join("|")}`)
  .digest("hex")
  .slice(0, 12);

// Check if a category is considered an "enemy/combatant" source for dropSources listing
const isCombatantCategory = (category) =>
  BOSS_CATEGORIES.has(category) ||
  category === "miniboss" ||
  category === "teardrop-scarab" ||
  isErMapEnemyCategory(category);

/**
 * WHICH ANSWER a non-combatant row gives to "where do I get this item" — decided
 * here, from fields the extractors already set, and written into the index so the
 * app never has to guess. Merchants are the reason this exists: their category
 * alone can't tell "sells it" from "drops it when killed", and both are true of
 * the same marker.
 *   npc-drop — an NPC/merchant hands it over or drops it on death.
 *   area     — a World Map Point: the PLACE holding the item, not the pickup.
 *              Always the vaguest lead.
 *   treasure — a real MSB placement: the item lying there to be taken.
 * `shop` is never returned here; shop rows come from marker.shop[], which is a
 * separate list, not a drop.
 */
const locationKindFor = (marker) =>
  marker.category === "npc" || marker.category === "merchant" ? "npc-drop"
  : marker.source === "world-map-point" ? "area"
  : "treasure";

function main() {
  console.log("Starting ER-map item index compilation...");

  if (!fs.existsSync(markersPath)) {
    console.error("er-markers.json not found!");
    process.exit(1);
  }
  const erMarkers = JSON.parse(fs.readFileSync(markersPath, "utf-8"));
  const productionById = new Map(erMarkers.map((m) => [m.id, m]));
  console.log(`Loaded ${erMarkers.length} production markers.`);

  if (!fs.existsSync(enemyProfilesPath)) {
    console.error("enemy-profiles.json not found!");
    process.exit(1);
  }
  const enemyProfiles = JSON.parse(fs.readFileSync(enemyProfilesPath, "utf-8"));
  console.log("Loaded enemy profiles.");

  if (!fs.existsSync(manifestPath)) {
    console.error("manifest.json not found!");
    process.exit(1);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));

  const index = {};
  // productionMarkerId → { view, id }: lets codex "show on map" jumps (which
  // carry PRODUCTION marker ids) land on the matching map marker. Exact-key
  // only — markers without a production twin simply aren't listed.
  const productionIdMap = {};

  const addLocation = (itemKey, marker, layer, kind, note) => {
    if (!index[itemKey]) index[itemKey] = { locations: [], dropSources: [] };
    // Identity includes `kind`: one merchant can both SELL an item and drop it
    // when killed, and those are two different answers — deduping on id alone
    // would silently keep whichever was written first.
    if (index[itemKey].locations.some((l) => l.id === marker.id && l.kind === kind)) return;
    index[itemKey].locations.push({
      id: marker.id,
      name: marker.name,
      category: marker.category,
      region: marker.region,
      layer,
      kind,
      // Price for a shop row, "Drops on death" for an NPC — previously dropped
      // on the floor here, which is what made a sale indistinguishable from a kill.
      ...(note ? { note } : {}),
    });
  };

  // Compact, fail-closed recommendation input. Unlike the presentation index,
  // this contains only routes that prove the item is handed to the player.
  const acquisitionSources = {};
  const acquisitionSourceKeys = new Map();
  const addAcquisitionSource = (itemKey, marker, layer, kind, note, identity) => {
    const keys = acquisitionSourceKeys.get(itemKey) ?? new Set();
    if (keys.has(identity)) return;
    keys.add(identity);
    acquisitionSourceKeys.set(itemKey, keys);
    const sources = acquisitionSources[itemKey] ?? [];
    sources.push({
      kind,
      markerId: marker.id,
      layer,
      name: marker.name,
      category: marker.category,
      ...(marker.region ? { region: marker.region } : {}),
      ...(note ? { note } : {}),
    });
    acquisitionSources[itemKey] = sources;
  };

  const addDropSource = (itemKey, marker, layer, note) => {
    if (!index[itemKey]) index[itemKey] = { locations: [], dropSources: [] };
    if (index[itemKey].dropSources.some((d) => d.id === marker.id)) return;
    index[itemKey].dropSources.push({
      id: marker.id,
      name: marker.name,
      category: marker.category,
      region: marker.region,
      note,
      layer,
    });
  };

  for (const view of manifest.views) {
    console.log(`Processing view: ${view.key} (kind: ${view.kind})...`);
    let viewMarkers = [];

    if (view.url) {
      const viewFilePath = path.join(rootDir, "public", view.url);
      if (fs.existsSync(viewFilePath)) {
        viewMarkers = JSON.parse(fs.readFileSync(viewFilePath, "utf-8"));
      } else {
        console.warn(`View file not found: ${viewFilePath}`);
      }
    } else if (view.chunks) {
      for (const [category, chunkUrl] of Object.entries(view.chunks)) {
        const chunkFilePath = path.join(rootDir, "public", chunkUrl);
        if (fs.existsSync(chunkFilePath)) {
          const chunkMarkers = JSON.parse(fs.readFileSync(chunkFilePath, "utf-8"));
          viewMarkers = viewMarkers.concat(chunkMarkers);
        } else {
          console.warn(`Chunk file not found: ${chunkFilePath}`);
        }
      }
    }

    console.log(`Loaded ${viewMarkers.length} markers for view ${view.key}.`);

    for (const marker of viewMarkers) {
      if (marker.type === "part/dummy-enemy") continue;
      const productionMarkerId = productionMarkerIdFor(marker);
      if (productionMarkerId && !productionIdMap[productionMarkerId]) {
        productionIdMap[productionMarkerId] = { view: view.key, id: marker.id };
      }
      // Verified merchant sources use their native spatial ids. Registering the
      // identity mapping lets both codex and in-map detail panels navigate to
      // the seller without inventing a production-marker twin.
      if (marker.shop?.length && !productionIdMap[marker.id]) {
        productionIdMap[marker.id] = { view: view.key, id: marker.id };
      }
      const exact = productionMarkerId ? productionById.get(productionMarkerId) : undefined;
      const enemyProfile = isErMapEnemyCategory(marker.category)
        ? enemyProfiles[String(marker.npcParamId)]
        : undefined;

      // Ground pickups (Treasure events) carry the item they award as itemKey,
      // not a drops list — index them as "where to find" locations directly.
      if (marker.itemKey && !isCombatantCategory(marker.category)) {
        const locationKind = locationKindFor(marker);
        addLocation(marker.itemKey, marker, view.key, locationKind);
        if (locationKind === "treasure") {
          addAcquisitionSource(
            marker.itemKey,
            marker,
            view.key,
            "pickup",
            undefined,
            ["pickup", marker.name, marker.region].join("|"),
          );
        }
      }

      // Merchant wares (ESD OpenRegularShop → ShopLineupParam). A separate list
      // from drops[] and, until now, never indexed at all: buying was the one way
      // of getting an item that the index couldn't answer, even though it's the
      // ONLY source for 257 of them (every Ash of War a merchant stocks, say).
      // The note carries the rune price the extractor resolved.
      for (const ware of marker.shop ?? []) {
        if (!ware.itemKey) continue;
        addLocation(ware.itemKey, marker, view.key, "shop", ware.note);
        if (!CONDITIONAL_RESELLER_NPC_PARAM_IDS.has(marker.npcParamId)) {
          addAcquisitionSource(
            ware.itemKey,
            marker,
            view.key,
            "merchant",
            ware.note,
            `merchant|${merchantSourceKey(marker)}`,
          );
        }
      }

      // Resolve drops
      const drops = marker.drops ?? exact?.drops ?? enemyProfile?.drops;

      if (drops && drops.length > 0) {
        for (const drop of drops) {
          const itemKey = drop.itemKey;
          if (!itemKey) continue;

          if (isCombatantCategory(marker.category)) {
            // It's dropped by this enemy/boss/scarab
            addDropSource(itemKey, marker, view.key, drop.note || "Guaranteed");
            const kind = BOSS_CATEGORIES.has(marker.category) ? "boss-drop" : "enemy-drop";
            const note = drop.note || "Guaranteed";
            addAcquisitionSource(
              itemKey,
              marker,
              view.key,
              kind,
              note,
              [kind, marker.name, marker.category, marker.region, note].join("|"),
            );
          } else {
            // It's a static item location (e.g. chest, corpse, pickup)
            addLocation(itemKey, marker, view.key, locationKindFor(marker), drop.note);
          }
        }
      }
    }
  }

  // Sort lists for presentation: a certain, specific lead beats a chancy or vague
  // one, since consumers (the detail panel) render these in file order.
  const weight = (s) => (s.note === "Guaranteed" ? 1000 : parseInt(s.note || "0", 10) || 0);
  const kindRank = { treasure: 0, shop: 1, "npc-drop": 2, area: 3 };
  for (const itemKey of Object.keys(index)) {
    index[itemKey].dropSources.sort(
      (a, b) => weight(b) - weight(a) || a.name.localeCompare(b.name)
    );
    index[itemKey].locations.sort(
      (a, b) => (kindRank[a.kind] ?? 9) - (kindRank[b.kind] ?? 9)
        || (a.region || "").localeCompare(b.region || "")
        || a.name.localeCompare(b.name),
    );
  }

  fs.writeFileSync(outputPath, JSON.stringify(index, null, 2), "utf-8");
  console.log(`Successfully built ER-map item index with ${Object.keys(index).length} items at: ${outputPath}`);

  // Recommendation code receives only acquisition routes the extracted data can
  // prove directly. Area hints and NPC reward rows are intentionally absent:
  // they identify a vicinity or quest actor, not a first-clear acquisition.
  fs.writeFileSync(acquisitionSourcesPath, JSON.stringify(acquisitionSources), "utf-8");
  console.log(
    `Wrote verified acquisition sources for ${Object.keys(acquisitionSources).length} items to: ${acquisitionSourcesPath}`,
  );

  const productionIdMapPath = path.join(
    rootDir,
    "public/data/er-map/elden-ring/production-id-map.json",
  );
  fs.writeFileSync(productionIdMapPath, JSON.stringify(productionIdMap), "utf-8");
  console.log(
    `Wrote ${Object.keys(productionIdMap).length} production-id mappings to: ${productionIdMapPath}`,
  );
}

main();
