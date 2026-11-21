import type { MapLayer } from "./types";

/**
 * Major-region name labels for the Elden Ring maps, drawn in the game's own map
 * voice (engraved Cinzel caps) by region-labels-layer.tsx.
 *
 * The map art ships with EMPTY parchment ribbons baked into the tiles — in the
 * game engine the region name is rendered onto them at runtime, so the raw
 * texture only carries illegible pseudo-text. Every `ribbon: true` entry below
 * sits EXACTLY on one of those baked ribbons (positions measured off the source
 * images at full resolution); the text completes the art. Regions without a
 * baked ribbon get a plain "engraved on the terrain" label, sized a touch
 * larger since no band constrains them.
 *
 * Coordinates are NOMINAL 2048-space (the marker pipeline's space), scaled to
 * the real image per layer by the renderer. `tilt` (deg, positive = left end
 * lower) and `arc` (sagitta, NOMINAL px) follow each ribbon's drawn curve.
 *
 * `names.en` is the stable lookup key for the shared game-FMG overlay. The
 * remaining entries are legacy harvested fallbacks for names absent from that
 * dictionary; proper nouns ultimately fall back to English.
 *
 * `tone` picks the ink for the background it sits on: "ink" (dark umber, for
 * parchment sea / light terrain / ribbon bands) or "chalk" (pale parchment,
 * for the near-black underground rock and other dark art).
 */
export interface RegionLabel {
  layer: MapLayer;
  /** Label center, NOMINAL 2048-space. */
  x: number;
  y: number;
  /** Cap height, NOMINAL px. */
  size: number;
  /** Baseline path width (ribbon band width when on one), NOMINAL px. */
  w?: number;
  /** Baseline rotation in degrees (matches the ribbon's drawn slope). */
  tilt?: number;
  /** Upward bow of the baseline (quadratic sagitta), NOMINAL px. */
  arc?: number;
  /** Sits on a baked parchment ribbon (affects nothing but documentation). */
  ribbon?: boolean;
  tone?: "ink" | "chalk";
  /** UI fallback for labels that do not exist as a standalone game FMG entry. */
  translationKey?: "layer.dlc-realm-of-shadow";
  names: { en: string } & Partial<Record<"de" | "es" | "fr" | "pt" | "zh-Hans", string>>;
}

export const REGION_LABELS: RegionLabel[] = [
  // ── Overworld ────────────────────────────────────────────────────────────
  {
    layer: "overworld", x: 501, y: 1381, size: 15, w: 140, arc: 5, ribbon: true,
    names: { en: "Limgrave", es: "Necrolimbo", fr: "Nécrolimbe" },
  },
  {
    layer: "overworld", x: 585, y: 1610, size: 20,
    names: {
      en: "Weeping Peninsula", de: "Halbinsel der Tränen", es: "Península del Llanto",
      fr: "Péninsule larmoyante", pt: "Península das Lágrimas",
    },
  },
  {
    layer: "overworld", x: 647, y: 934, size: 15, w: 150, arc: 3, tilt: -2, ribbon: true,
    names: { en: "Liurnia" },
  },
  {
    layer: "overworld", x: 1075, y: 1499, size: 15, w: 157, arc: 4, tilt: -2, ribbon: true,
    names: { en: "Caelid" },
  },
  {
    layer: "overworld", x: 1165, y: 1150, size: 18,
    names: { en: "Dragonbarrow" },
  },
  {
    layer: "overworld", x: 586, y: 386, size: 15, w: 136, arc: 4, ribbon: true,
    names: { en: "Altus Plateau", de: "Altus-Plateau", es: "Meseta Altus", fr: "Plateau Altus", pt: "Platô Altus" },
  },
  {
    layer: "overworld", x: 420, y: 548, size: 18,
    names: { en: "Mt. Gelmir", de: "Gelmir", es: "Monte Gelmir", fr: "Mont Gelmir", pt: "Monte Gelmir" },
  },
  {
    layer: "overworld", x: 1336, y: 696, size: 13, w: 123, arc: 3, tilt: -3, ribbon: true,
    names: {
      en: "Mountaintops of the Giants", de: "Berggipfel der Riesen", es: "Picos de los gigantes",
      fr: "Cimes des Géants", pt: "Montanha dos Gigantes",
    },
  },
  {
    layer: "overworld", x: 1050, y: 330, size: 20,
    names: {
      en: "Consecrated Snowfield", de: "Geweihtes Schneefeld", es: "Campo sacroníveo",
      fr: "Champs enneigés consacrés", pt: "Campo de Neve Consagrado",
    },
  },

  {
    // Roundtable Hold is a teleport-only interior; the game's own map placement
    // (WorldMapLegacyConvParam) anchors it in the sea west of Limgrave — vanilla
    // draws its map icon offshore for the same reason. Its ~30 entity pins
    // (merchants, NPCs, enemies) all project onto that anchor, so this small
    // caption sits just under the cluster to name what the pins belong to.
    // Cluster spans nominal x 548-567 / y 1475-1489 (measured 2026-07-17).
    layer: "overworld", x: 558, y: 1499, size: 9,
    names: { en: "Roundtable Hold" },
  },

  // ── Underground ──────────────────────────────────────────────────────────
  {
    layer: "underground", x: 419, y: 691, size: 17, w: 224, tilt: -7, ribbon: true,
    names: { en: "Ainsel River" },
  },
  {
    layer: "underground", x: 1563, y: 1280, size: 17, w: 224, tilt: -5, ribbon: true,
    names: { en: "Siofra River", de: "Siofra", es: "Río Siofra", fr: "La Siofra", pt: "Rio Siofra" },
  },
  {
    layer: "underground", x: 1175, y: 263, size: 16, w: 230, arc: 6, ribbon: true,
    names: {
      en: "Deeproot Depths", de: "Tiefen von Tiefwurz", es: "Fondo de Raíz Profunda",
      fr: "Profondeurs de Fonderacine", pt: "Abismos da Raiz Profunda",
    },
  },
  {
    layer: "underground", x: 1650, y: 1445, size: 17, tone: "chalk",
    names: {
      en: "Mohgwyn Palace", de: "Mohgwyn-Palast", es: "Palacio de Mohgwyn",
      fr: "Palais Mohgwyn", pt: "Palácio de Mohgwyn",
    },
  },
  {
    layer: "underground", x: 1285, y: 1680, size: 15, tone: "chalk",
    names: {
      en: "Nokron, Eternal City", de: "Nokron, die Ewige Stadt", es: "Nokron, Ciudad Eterna",
      fr: "Nokron, la Ville éternelle", pt: "Nokron, Cidade Eterna",
    },
  },
  {
    layer: "underground", x: 478, y: 1000, size: 15, tone: "chalk",
    names: {
      en: "Lake of Rot", de: "Fäulnissee", es: "Lago de la Putrefacción",
      fr: "Lac putréfié", pt: "Lago da Podridão",
    },
  },

  // ── Realm of Shadow (DLC) ────────────────────────────────────────────────
  {
    // The lone ribbon on the DLC map names the whole realm; the localized
    // strings mirror the app's layer label (i18n `layer.dlc-realm-of-shadow`).
    layer: "dlc-realm-of-shadow", x: 420, y: 1687, size: 20, w: 300, arc: 6, ribbon: true,
    translationKey: "layer.dlc-realm-of-shadow",
    names: {
      en: "Realm of Shadow", de: "Reich des Schattens", es: "Reino de la Sombra",
      fr: "Royaume de l'Ombre", pt: "Reino das Sombras", "zh-Hans": "幽影之地",
    },
  },
  {
    layer: "dlc-realm-of-shadow", x: 800, y: 1290, size: 20,
    names: {
      en: "Gravesite Plain", de: "Grabfeld-Ebene", es: "Llanura de las Tumbas",
      fr: "Plaine sépulcrale", pt: "Planície do Cemitério",
    },
  },
  {
    layer: "dlc-realm-of-shadow", x: 1080, y: 1055, size: 20,
    names: { en: "Scadu Altus", es: "Altus Umbrío", fr: "Altus Occulte", pt: "Umbra Altus" },
  },
  {
    layer: "dlc-realm-of-shadow", x: 1195, y: 795, size: 16,
    names: {
      en: "Scaduview", de: "Aussicht von Scadu", es: "Vista Sombría",
      fr: "Panorama occulte", pt: "Umbravista",
    },
  },
  {
    layer: "dlc-realm-of-shadow", x: 1035, y: 1900, size: 16,
    names: {
      en: "Cerulean Coast", de: "Himmelblaues Ufer", es: "Costa Cerúlea",
      fr: "Côte céruléenne", pt: "Costa Cerúlea",
    },
  },
  {
    layer: "dlc-realm-of-shadow", x: 1500, y: 1610, size: 16, tone: "chalk",
    names: {
      en: "Jagged Peak", de: "Klingengipfel", es: "Pico escarpado",
      fr: "Pic déchiqueté", pt: "Pico Irregular",
    },
  },
  {
    layer: "dlc-realm-of-shadow", x: 1300, y: 1372, size: 16, tone: "chalk",
    names: {
      en: "Abyssal Woods", de: "Abgrundwald", es: "Bosque del abismo",
      fr: "Bois abyssaux", pt: "Floresta Abissal",
    },
  },
  {
    layer: "dlc-realm-of-shadow", x: 645, y: 915, size: 15,
    names: {
      en: "Ancient Ruins of Rauh", de: "Uralte Ruinen von Rauh", es: "Antiguas ruinas de Rauh",
      fr: "Ruines antiques de Rauh", pt: "Antigas Ruínas de Rauh",
    },
  },
];
