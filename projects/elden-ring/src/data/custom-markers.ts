import type { CategoryDef, CategoryGroup, Game, MapLayer, Marker } from "./types";

/**
 * User-authored markers. Unlike every other marker (extracted from the game), a
 * custom marker is created in-app by the player: pick a type, name it, optionally
 * give it an image (a preset symbol or their own upload) and a description, then
 * drop it on the map. They persist in the map-store (localStorage) exactly like
 * bookmarks/found progress, and flow through the normal marker pipeline by being
 * converted to a plain `Marker` via `customToMarker`.
 */
export interface CustomMarker {
  /** "custom:<time>-<rand>" — guaranteed not to collide with any extracted id. */
  id: string;
  game: Game;
  layer: MapLayer;
  /** One of CUSTOM_TYPES' keys — drives colour, default glyph and the filter row. */
  category: string;
  name: string;
  description?: string;
  /** NOMINAL-space pixel (same coordinate space as every extracted marker). */
  pixel: { x: number; y: number };
  /** Chosen image: a preset symbol URL or an uploaded data URL. Absent → the
   * type's glyph is shown instead. */
  icon?: string;
  /** Epoch ms; used only for stable ordering. */
  createdAt: number;
}

/**
 * The selectable custom marker "types". Each is a real CategoryDef so a custom
 * marker participates in the existing colour / glyph / clustering / filter system
 * with zero special-casing — the type IS its category. Shared across both games.
 */
export const CUSTOM_TYPES: CategoryDef[] = [
  { key: "custom-poi", label: "Point of Interest", color: "#5ab0c9", icon: "pin" },
  { key: "custom-boss", label: "Boss", color: "#e5342a", icon: "skull" },
  { key: "custom-loot", label: "Item / Loot", color: "#c9b15a", icon: "treasure" },
  { key: "custom-npc", label: "NPC", color: "#5ac9a0", icon: "npc" },
  { key: "custom-secret", label: "Secret", color: "#c95a9b", icon: "eye" },
  { key: "custom-objective", label: "Objective", color: "#e0c14e", icon: "flag" },
  { key: "custom-favorite", label: "Favorite Spot", color: "#fbbf24", icon: "star" },
  { key: "custom-note", label: "Note", color: "#9ba8b4", icon: "note" },
];

/** Same list, exposed as CategoryDef[] for appending to the category dictionaries. */
export const CUSTOM_CATEGORIES: CategoryDef[] = CUSTOM_TYPES;

/** Quick membership test: is this category key a user-marker type? */
export const CUSTOM_CATEGORY_KEYS = new Set(CUSTOM_TYPES.map((t) => t.key));
export const isCustomCategory = (key: string): boolean => CUSTOM_CATEGORY_KEYS.has(key);

/** The default type a fresh create dialog starts on. */
export const DEFAULT_CUSTOM_TYPE = CUSTOM_TYPES[0].key;

/** Resolve a custom type's definition (falls back to the first type). */
export const customTypeDef = (key: string): CategoryDef =>
  CUSTOM_TYPES.find((t) => t.key === key) ?? CUSTOM_TYPES[0];

/**
 * The filter-rail group that bundles every custom type. Injected at the TOP of the
 * rail (and only when the user actually has custom markers) by map-experience.
 */
export const CUSTOM_GROUP: CategoryGroup = {
  key: "custom",
  label: "Your Markers",
  icon: "star",
  categories: CUSTOM_TYPES.map((t) => t.key),
};

/**
 * "Default images we show" — the curated palette offered in the create dialog
 * before the user falls back to uploading their own. These are the authentic,
 * game-art POI symbols already shipped in /public, so a preset marker looks
 * native on the map (same dark-disc + ring treatment as extracted POIs).
 */
export interface PresetImage {
  label: string;
  url: string;
}
export const PRESET_MARKER_IMAGES: PresetImage[] = [
  { label: "Grace", url: "/poi-icons/nightreign/Site_of_Grace.png" },
  { label: "Bonfire", url: "/icons/elden-ring/map/01_Bonfire.png" },
  { label: "Treasure", url: "/poi-icons/nightreign/Buried_Treasure.png" },
  { label: "Scarab", url: "/poi-icons/nightreign/Scarab.png" },
  { label: "Boss", url: "/poi-icons/nightreign/Field_Boss.png" },
  { label: "Boss (red)", url: "/poi-icons/nightreign/Field_Boss_Red.png" },
  { label: "Evergaol", url: "/poi-icons/nightreign/Evergaol.png" },
  { label: "Church", url: "/poi-icons/nightreign/Church.png" },
  { label: "Great Church", url: "/poi-icons/nightreign/Great_Church.png" },
  { label: "Castle", url: "/poi-icons/nightreign/Castle.png" },
  { label: "Fort", url: "/poi-icons/nightreign/Fort.png" },
  { label: "Ruins", url: "/poi-icons/nightreign/Ruins.png" },
  { label: "Township", url: "/poi-icons/nightreign/Township.png" },
  { label: "Merchant", url: "/poi-icons/nightreign/Scale_Bearing_Merchant.png" },
  { label: "Tunnel", url: "/poi-icons/nightreign/Tunnel_Entrance.png" },
  { label: "Spiritstream", url: "/poi-icons/nightreign/Spiritstream.png" },
  { label: "Hawk Tree", url: "/poi-icons/nightreign/Spectral_Hawk_Tree.png" },
];

/**
 * Project a stored CustomMarker into the plain Marker the renderer/detail panel
 * consume. `custom: true` lets the rest of the app recognise a user marker (it's
 * draggable, editable and deletable); `customIcon` is checked first by markerArtUrl.
 */
export const customToMarker = (cm: CustomMarker): Marker => ({
  id: cm.id,
  game: cm.game,
  layer: cm.layer,
  category: cm.category,
  name: cm.name,
  description: cm.description,
  pixel: cm.pixel,
  custom: true,
  customIcon: cm.icon,
});

/** Generate a collision-proof id for a new custom marker. */
export const newCustomMarkerId = (): string =>
  `custom:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
