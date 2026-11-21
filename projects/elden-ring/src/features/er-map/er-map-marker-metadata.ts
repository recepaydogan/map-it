import type { TFunction } from "i18next";
import { erItemByKey } from "../../data/er-items-data";
import { erMarkers } from "../../data/er-markers-data";
import { localizeErMapText } from "../../data/er-map-text";
import { markersByGame } from "../../data/markers";
import type { ItemRef, Marker, MapLayer } from "../../data/types";
import { isErMapEnemyCategory } from "./er-map-enemy-category";
import { erMapMarkerArtUrl } from "./er-map-marker-art";
import type { RawErMapMarker, ErMapEnemyProfile } from "./types";

/** This map's raw id translated into the Map tab's id space — a pure rewrite of
 *  the id, so it answers the same for a marker whose twin exists and one whose
 *  doesn't. Callers that need the twin ITSELF must still look it up (see
 *  `exact` below); callers that need a stable cross-map ADDRESS (community tips)
 *  want this unconditional form. */
export const productionMarkerIdFor = (marker: RawErMapMarker): string | undefined => {
  if (marker.source === "boss") return `er-boss-${marker.id.slice("boss:".length)}`;
  if (marker.source === "world-map-point") return `er-wmp-${marker.id.slice("wmp:".length)}`;
  if (marker.source === "bonfire") return `er-grace-${marker.id.slice("bonfire:".length)}`;
  // MSB spiritsprings/waygates have production twins (build-er-spiritsprings.mjs)
  // whose ids embed the same MSB keys: map + MountJump RegionID for springs,
  // map + model tail + instance for waygates (…:AEG099_510_9000:… → 510-9000).
  if (marker.type === "region/mount-jump" && marker.map && marker.regionId != null) {
    return `er-spring-${marker.map}-mj-${marker.regionId}`;
  }
  if (marker.category === "waygate" && marker.map) {
    const part = marker.id.split(":")[3]?.match(/^AEG\d+_(\d+)_(\d+)$/);
    if (part) return `er-waygate-${marker.map}-${part[1]}-${part[2]}`;
  }
  return undefined;
};

// erMarkers / markersByGame are LIVE BINDINGS reassigned to localized copies on
// every language change (rebuildMarkerIndexes) — a module-load snapshot would pin
// these joins to the boot language. Rebuilt lazily when the source identity moves.
let lookupSource: Marker[] | null = null;
let productionById = new Map<string, Marker>();
let categoryMetadata = new Map<string, Marker>();
const ensureLiveLookups = (): void => {
  const source = markersByGame["elden-ring"];
  if (source === lookupSource) return;
  lookupSource = source;
  productionById = new Map(erMarkers.map((marker) => [marker.id, marker]));
  categoryMetadata = new Map();
  for (const marker of source) {
    if (marker.description && !categoryMetadata.has(marker.category)) {
      categoryMetadata.set(marker.category, marker);
    }
  }
};

/** Re-resolve an ItemRef list's names against the (localized) item DB — exact
 *  itemKey joins only; refs without a key keep their baked text. */
const localizeItemRefs = (refs?: ItemRef[]): ItemRef[] | undefined =>
  refs?.map((ref) => {
    const name = ref.itemKey ? erItemByKey.get(ref.itemKey)?.name : undefined;
    return name && name !== ref.name ? { ...ref, name } : ref;
  });

const layerFor = (marker: RawErMapMarker): MapLayer => {
  if (marker.areaNo === "12") return "underground";
  if (marker.areaNo === "61") return "dlc-realm-of-shadow";
  return "overworld";
};

export interface ErMapDisplayMarker {
  marker: Marker;
  productionMarkerId?: string;
  /** The production twin's boss id backing the fallback dungeonBoss label. It
   * lives in the Map tab's marker space — the panel must translate it through
   * the production-id bridge before it can select anything on this map. */
  productionDungeonBossId?: string;
  /** Resolved connection click-through (raw marker fields, or the waygate warp
   * table below) — carried here so the raw marker is never mutated. */
  connectionTargetView?: string;
  connectionTargetMarkerId?: string;
  /** The localized "Imbued Sword Key" term the description highlight matches. */
  imbuedSwordKeyName?: string;
}

// Destinations are EMEVD-DERIVED, never hand-authored: each gate's warp event
// (common event 90005605 / per-map wrappers) names the destination map and
// player-start entity; the entity's MSB position was resolved to the nearest
// real marker (distances verified 2026-07-16). Regenerate the same way — a
// waygate's destination exists ONLY in the event scripts, not the MSB/params.
const WAYGATE_WARPS: Record<string, { description: string; targetView?: string; targetMarkerId?: string; targetName?: string }> = {
  "1046391600": {
    description: "Sending gate. Teleports to the Bestial Sanctum in northeastern Caelid.",
    targetView: "overworld",
    targetMarkerId: "bonfire:64514300",
    targetName: "Bestial Sanctum",
  },
  "1051361600": {
    description: "Sending gate. Teleports back to the Impassable Greatbridge.",
    targetView: "overworld",
    targetMarkerId: "bonfire:64503600",
    targetName: "Impassable Greatbridge",
  },
  "1051371600": {
    description: "Sending gate. Teleports to the beach of Starscourge Radahn's arena.",
    targetView: "overworld",
    targetMarkerId: "boss:1052380800",
    targetName: "Starscourge Radahn",
  },
  "34101600": {
    description: "Sending gate. Teleports to the Divine Tower of Limgrave on the other side of the broken bridge.",
    targetView: "overworld",
    targetMarkerId: "bonfire:341002",
    targetName: "Divine Tower of Limgrave",
  },
  "1050561510": {
    description: "Sending gate. Teleports to the entrance of the Cave of the Forlorn.",
    targetView: "overworld",
    targetMarkerId: "bonfire:311200",
    targetName: "Cave of the Forlorn",
  },
  "16001570": {
    description: "Sending gate. Teleports to the Audience Pathway outside Rykard's arena.",
    targetView: "overworld",
    targetMarkerId: "bonfire:160005",
    targetName: "Audience Pathway",
  },
  "1037421610": {
    description: "Sending gate. Teleports to the South Raya Lucaria Gate.",
    targetView: "overworld",
    targetMarkerId: "bonfire:62354500",
    targetName: "South Raya Lucaria Gate",
  },
  "1034511620": {
    description: "Sending gate. Teleports to Ainsel River Main in the underground.",
    targetView: "underground",
    targetMarkerId: "bonfire:120104",
    targetName: "Ainsel River Main",
  },
  "1033461610": {
    description: "Sending gate. Requires an Imbued Sword Key. Teleports to an isolated cliff in Crumbling Farum Azula, near the Crumbling Beast Grave.",
    targetView: "overworld",
    targetMarkerId: "bonfire:130003",
    targetName: "Crumbling Beast Grave",
  },
  "1033471610": {
    description: "Sending gate. Requires an Imbued Sword Key. Teleports to an isolated tower in Nokron, Eternal City.",
    targetView: "underground",
    targetMarkerId: "bonfire:120701",
    targetName: "Nokron, Eternal City",
  },
  "1034471610": {
    description: "Sending gate. Requires an Imbued Sword Key. Teleports back to the Chapel of Anticipation, near the Grafted Scion.",
    targetView: "overworld",
    targetMarkerId: "boss:10010800",
    targetName: "Grafted Scion",
  },
  "1036451620": {
    description: "Sending gate. Teleports to the Northern Liurnia Lake Shore.",
    targetView: "overworld",
    targetMarkerId: "bonfire:62344800",
    targetName: "Northern Liurnia Lake Shore",
  },
  "14001660": {
    description: "Sending gate. Teleports to the Church of Vows.",
    targetView: "overworld",
    targetMarkerId: "bonfire:62374600",
    targetName: "Church of Vows",
  },
  "1039421610": {
    description: "Sending gate. Teleports to the South Raya Lucaria Gate.",
    targetView: "overworld",
    targetMarkerId: "bonfire:62354500",
    targetName: "South Raya Lucaria Gate",
  },
  "1047381610": {
    description: "Sending gate. Teleports to the Impassable Greatbridge in southern Caelid.",
    targetView: "overworld",
    targetMarkerId: "bonfire:64503600",
    targetName: "Impassable Greatbridge",
  },
  "1050361610": {
    description: "Sending gate. Teleports to the Chamber Outside the Plaza inside Redmane Castle (active during the Radahn Festival).",
    targetView: "overworld",
    targetMarkerId: "bonfire:64513601",
    targetName: "Chamber Outside the Plaza",
  },
  "1050361612": {
    description: "Sending gate. Teleports to Redmane Castle, outside the plaza.",
    targetView: "overworld",
    targetMarkerId: "bonfire:64513601",
    targetName: "Chamber Outside the Plaza",
  },
  "1040521640": {
    description: "Sending gate. Teleports to the northern cliffs of Altus Plateau, near the Road of Iniquity Side Path.",
    targetView: "overworld",
    targetMarkerId: "bonfire:63405400",
    targetName: "Road of Iniquity Side Path",
  },
  "1048571500": {
    description: "Sending gate. Teleports to the Haligtree Canopy at Miquella's Haligtree.",
    targetView: "overworld",
    targetMarkerId: "bonfire:150006",
    targetName: "Haligtree Canopy",
  },
  "11001692": {
    description: "Sending gate. Teleports to the Isolated Divine Tower in the middle of the ocean.",
    targetView: "overworld",
    targetMarkerId: "bonfire:341500",
    targetName: "Isolated Divine Tower",
  },
  "11051680": {
    description: "Sending gate. Teleports to the Isolated Divine Tower in the middle of the ocean.",
    targetView: "overworld",
    targetMarkerId: "bonfire:341500",
    targetName: "Isolated Divine Tower",
  },
  "12031500": {
    description: "Sending gate. Near the Prince of Death's Throne. Teleports to the East Capital Rampart in Leyndell, Royal Capital.",
    targetView: "overworld",
    targetMarkerId: "bonfire:110002",
    targetName: "East Capital Rampart",
  },
  "12021670": {
    description: "Sending gate. Teleports up to the Ancestral Woods, near Night's Sacred Ground.",
    targetView: "underground",
    targetMarkerId: "bonfire:120206",
    targetName: "Ancestral Woods",
  },
  "12021203": {
    description: "Sending gate. A short hop onto Siofra River's high cliffs, near the Worshippers' Woods.",
    targetView: "underground",
    targetMarkerId: "bonfire:120204",
    targetName: "Worshippers' Woods",
  },
  "12021204": {
    description: "Sending gate. A short hop onto Siofra River's high cliffs, near the Siofra River Bank.",
    targetView: "underground",
    targetMarkerId: "bonfire:120203",
    targetName: "Siofra River Bank",
  },
  "12021205": {
    description: "Sending gate. A short hop onto Siofra River's high cliffs, near the Worshippers' Woods.",
    targetView: "underground",
    targetMarkerId: "bonfire:120204",
    targetName: "Worshippers' Woods",
  },
};

const FORT_METADATA: Record<string, { description: string; drops?: any[] }> = {
  "wmp:450000": {
    description: "The grand colosseum of Leyndell, the Royal Capital. Closed to the public until the Colosseum Update, it now serves as an arena for PvP combat.",
    drops: [
      {
        id: "21080000",
        name: "Star Fist",
        category: "weapon",
        itemId: 21080000,
        iconId: 10808,
        itemKey: "weapon:21080000"
      },
      {
        id: "4090",
        name: "Ritual Shield Talisman",
        category: "talisman",
        itemId: 4090,
        iconId: 18580,
        itemKey: "accessory:4090"
      }
    ]
  },
  "wmp:450100": {
    description: "The colosseum of Limgrave, situated on the northern cliffs. Gladiators once fought here; it now hosts PvP combat trials."
  },
  "wmp:450200": {
    description: "The colosseum of Caelid, guarded by the Great-Jar. Step inside to participate in PvP combat trials."
  },
  "wmp:61423702": {
    description: "A heavily fortified gate blocking passage from Limgrave to the Stormhill. Guarded by Godrick Soldiers and a Giant."
  },
  "wmp:61443400": {
    description: "A heavily fortified bridge connecting Limgrave to Weeping Peninsula. Guarded by soldiers, barricades, and a ballista."
  },
  "wmp:61463600": {
    description: "A small fort in eastern Limgrave, built to defend the Mistwood. Captured by demi-humans after its commander, Kenneth Haight, fled."
  },
  "wmp:63355400": {
    description: "A fortress in western Mt. Gelmir, built near the Seethewater River. Guarded by Fire Monks and Prelates."
  },
  "wmp:64473801": {
    description: "A fortress in western Caelid, guarding the border with Limgrave. Guarded by Radahn Soldiers and a Lion Guardian."
  },
  "wmp:64493801": {
    description: "A defensive gate guarding the town of Sellia in Caelid."
  },
  "wmp:64513900": {
    description: "A fort located in the Dragonbarrow, Caelid. Infested with giant bats, harpies, and phantom soldiers."
  },
  "wmp:65525500": {
    description: "A garrison located in the Mountaintops of the Giants, near the Giants' Gravepost. Guarded by Fire Guardians."
  },
  "wmp:69474500": {
    description: "A fort nestled inside the Fog Rift valley in Gravesite Plain. Guarded by Messmer Soldiers, Vulgar Militiamen, and Black Knight Garrew."
  },
  "wmp:69494301": {
    description: "A dark fort in southern Scadu Altus, used as a prison and execution ground. Guarded by Omenkillers, Messmer Soldiers, and Black Knight Edredd."
  }
};

export const erMapDisplayMarker = (
  raw: RawErMapMarker,
  enemyProfile?: ErMapEnemyProfile,
  categoryDef?: { description?: string },
  t?: TFunction,
): ErMapDisplayMarker => {
  ensureLiveLookups();
  // The hand-authored waygate/fort facts resolve into LOCALS — never onto `raw`
  // (those objects are cached across language switches; a baked-in English write
  // would survive the switch). Their prose localizes through the UI catalog keys
  // (erMap.waygateDesc.* / erMap.fortDesc.*, English until translated).
  let description = raw.description;
  let connectionTarget = raw.connectionTarget;
  let connectionTargetView = raw.connectionTargetView;
  let connectionTargetMarkerId = raw.connectionTargetMarkerId;
  let drops = raw.drops;
  if (raw.category === "waygate" && raw.entityId != null) {
    const warp = WAYGATE_WARPS[String(raw.entityId)];
    if (warp) {
      description = t
        ? t(`erMap.waygateDesc.${raw.entityId}`, { defaultValue: warp.description })
        : warp.description;
      if (warp.targetMarkerId) {
        connectionTarget = warp.targetName
          ? localizeErMapText(warp.targetName)
          : t ? t("erMap.destinationFallback") : "destination";
        connectionTargetView = warp.targetView || "overworld";
        connectionTargetMarkerId = warp.targetMarkerId;
      }
    }
  }

  if (raw.category === "fort" && FORT_METADATA[raw.id]) {
    const fort = FORT_METADATA[raw.id];
    description = t
      ? t(`erMap.fortDesc.${raw.id.replace("wmp:", "")}`, { defaultValue: fort.description })
      : fort.description;
    if (fort.drops) drops = fort.drops;
  }

  const productionMarkerId = productionMarkerIdFor(raw);
  const exact = productionMarkerId ? productionById.get(productionMarkerId) : undefined;
  const categoryFallback = categoryMetadata.get(raw.category);

  const resolvedDescription = description
    ?? categoryDef?.description
    ?? exact?.description
    ?? categoryFallback?.description;

  // The highlight term must be spelled exactly as the description spells it —
  // English today, the official localized item name once the prose is translated.
  const imbuedSwordKeyName = erItemByKey.get("goods:8186")?.name ?? "Imbued Sword Key";
  const imbuedHighlight = resolvedDescription?.includes(imbuedSwordKeyName)
    ? imbuedSwordKeyName
    : resolvedDescription?.includes("Imbued Sword Key") ? "Imbued Sword Key" : undefined;

  return {
    productionMarkerId: exact ? productionMarkerId : undefined,
    productionDungeonBossId: raw.dungeonBosses?.length ? undefined : exact?.dungeonBossId,
    connectionTargetView,
    connectionTargetMarkerId,
    imbuedSwordKeyName,
    marker: {
      id: raw.id,
      game: "elden-ring",
      layer: layerFor(raw),
      // The streamed map owns the current taxonomy. Its boss-tier split
      // (great/legendary/evergaol/invasion) is more specific than the production
      // twin's legacy `boss` bucket and drives category-scoped detail features.
      category: raw.category,
      name: exact?.name ?? raw.name,
      // Region is the one field the builder resolves BETTER than the production
      // twin, so it wins here (every other field still prefers production).
      // The builder already consults the twin's region, then normalizes Paramdex's
      // inconsistent spellings, drops its non-places ("Legacy Dungeon"), and falls
      // back to the nearest MACRO-region anchor — so the twin's raw value only ever
      // re-introduces what that pass just cleaned up.
      region: raw.region ?? exact?.region,
      pixel: { x: 0, y: 0 },
      // Marker-specific text first (builder-resolved: connection targets…), then
      // the manifest's OFFICIAL TutorialBody text — the game's own words beat the
      // production twin's authored blurb (user rule: game text wherever it exists).
      // Production text stays only as the last resort, mirroring the Map tab.
      description: resolvedDescription,
      descriptionHighlights: [
        connectionTarget,
        imbuedHighlight,
      ].filter((x): x is string => !!x),
      stats: exact?.stats,
      // Names re-resolved against the live (localized) item DB by exact itemKey.
      drops: localizeItemRefs(
        drops ?? exact?.drops ?? (isErMapEnemyCategory(raw.category) ? enemyProfile?.drops : undefined),
      ),
      // Builder-resolved wares (talk-script shop ranges → ShopLineupParam)
      // beat the production twin's authored list.
      shopItems: localizeItemRefs(raw.shop ?? exact?.shopItems),
      bossMeta: exact?.bossMeta ?? (isErMapEnemyCategory(raw.category) ? enemyProfile?.bossMeta : undefined),
      // The builder's interior-map join names every boss in the dungeon and gives
      // ids this map can actually select. The production twin's single boss is the
      // fallback and renders as a plain label here: its dungeonBossId belongs to the
      // Map tab's marker space, so the panel resolves productionDungeonBossId (above)
      // through the production-id bridge before wiring the row as a click-through.
      dungeonBosses: raw.dungeonBosses?.map(({ name, id }) => ({ name, id })),
      dungeonBoss: raw.dungeonBosses?.length ? undefined : exact?.dungeonBoss,
      dungeonEntrances: raw.dungeonEntrances?.map(({ name, id }) => ({ name, id })),
      // Merged portal hub: the panel renders these as a destination list; the
      // per-option view stays on the raw marker (linkViewById resolves it).
      // A single-destination portal synthesizes the same one-row list when its
      // arrival resolved — one blue button UI whether one crossing or five.
      // (No row when unresolved: a label-only "you are already here" row is
      // exactly what the hub pass just removed.)
      connectionOptions: raw.connectionOptions?.map(({ name, id }) => ({ name, id }))
        ?? (raw.category === "connection" && connectionTarget && connectionTargetMarkerId
          ? [{ name: connectionTarget, id: connectionTargetMarkerId }]
          : undefined),
      itemId: raw.itemId,
      iconId: raw.itemIconId,
      itemKey: raw.itemKey,
      mapIcon: raw.mapIcon,
      custom: raw.custom,
      customIcon: erMapMarkerArtUrl(raw),
    },
  };
};
