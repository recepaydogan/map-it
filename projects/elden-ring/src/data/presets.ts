import type { FilterPreset, Game } from "./types";

/**
 * Intent-based presets — the primary filter control. Most players have a goal
 * ("show me upgrades"), not a desire to curate 40 toggles. One click sets the
 * right set; the accordion is for fine-tuning afterwards.
 *
 * Two kinds live here, told apart by `categories`:
 *  - INTENTS (explicit allow-list) — the hero pills the rail leads with.
 *  - BULK    ("all" / "none")      — light utility toggles, not goals.
 * "Completionist" used to duplicate "Show all" exactly (both = every category);
 * the redundant intent was dropped so each control does one distinct thing.
 */
const ER_PRESETS: FilterPreset[] = [
  { key: "bosses", label: "Bosses", icon: "skull", categories: ["boss", "miniboss"] },
  {
    key: "loot",
    label: "Loot",
    icon: "sword",
    categories: [
      "weapon", "shield", "armor", "talisman", "ash-of-war", "spirit-ash",
      "sorcery", "incantation", "revered-spirit-ash",
    ],
  },
  {
    key: "upgrades",
    label: "Upgrades",
    icon: "seed",
    categories: ["golden-seed", "sacred-tear", "smithing-stone", "glovewort", "scadutree-fragment", "larval-tear"],
  },
  {
    key: "exploration",
    label: "Exploration",
    icon: "castle",
    categories: ["site-of-grace", "cave", "catacomb", "tunnel", "evergaol", "legacy-dungeon", "divine-tower"],
  },
  { key: "show-all", label: "All", icon: "eye", categories: "all" },
  { key: "hide-all", label: "None", icon: "eye-off", categories: "none" },
];

const NR_PRESETS: FilterPreset[] = [
  {
    key: "bosses",
    label: "Bosses",
    icon: "skull",
    categories: ["field-boss", "night-boss", "evergaol-boss", "arena-boss"],
  },
  { key: "loot", label: "Loot", icon: "treasure", categories: ["buried-treasure", "scarab", "smithing-table", "rot-blessing", "mountaintop-buff"] },
  { key: "circles", label: "Circles", icon: "event", categories: ["circle-day1", "circle-day2", "shifting-earth-event"] },
  { key: "show-all", label: "All", icon: "eye", categories: "all" },
  { key: "hide-all", label: "None", icon: "eye-off", categories: "none" },
];

export const presetsByGame: Record<Game, FilterPreset[]> = {
  "elden-ring": ER_PRESETS,
  nightreign: NR_PRESETS,
};

/** True for the bulk show-all / hide-all toggles (vs an explicit intent set). */
export const isBulkPreset = (preset: FilterPreset): boolean =>
  preset.categories === "all" || preset.categories === "none";
