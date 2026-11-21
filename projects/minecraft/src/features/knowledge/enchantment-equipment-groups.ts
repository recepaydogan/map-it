import type { KnowledgeSubjectRef } from "./mechanics-types.ts";

export const ENCHANTMENT_EQUIPMENT_TYPES = [
  "boots",
  "leggings",
  "chestplates",
  "helmets",
  "swords",
  "spears",
  "axes",
  "pickaxes",
  "shovels",
  "hoes",
  "headwear",
] as const;

export type EnchantmentEquipmentType = typeof ENCHANTMENT_EQUIPMENT_TYPES[number];

export interface EnchantmentEquipmentGroup {
  key: string;
  type?: EnchantmentEquipmentType;
  item?: KnowledgeSubjectRef;
}

const MATERIAL_PREFIX = /^(?:wooden|stone|golden|iron|copper|diamond|netherite|leather|chainmail|turtle)_/;
const MATERIAL_EQUIPMENT_TYPES = new Map<string, EnchantmentEquipmentType>([
  ["boots", "boots"],
  ["leggings", "leggings"],
  ["chestplate", "chestplates"],
  ["helmet", "helmets"],
  ["sword", "swords"],
  ["spear", "spears"],
  ["axe", "axes"],
  ["pickaxe", "pickaxes"],
  ["shovel", "shovels"],
  ["hoe", "hoes"],
]);
const HEADWEAR = new Set([
  "carved_pumpkin",
  "creeper_head",
  "dragon_head",
  "piglin_head",
  "player_head",
  "skeleton_skull",
  "wither_skeleton_skull",
  "zombie_head",
]);

/** Collapse material variants into the equipment types players actually need. */
export const groupEnchantmentEquipment = (requirements: readonly KnowledgeSubjectRef[]): EnchantmentEquipmentGroup[] => {
  const groups = new Map<string, EnchantmentEquipmentGroup>();
  for (const item of requirements) {
    if (item.kind !== "item") continue;
    const path = item.id.split(":").at(-1) ?? item.id;
    const materialType = path.replace(MATERIAL_PREFIX, "");
    const type = MATERIAL_EQUIPMENT_TYPES.get(materialType) ?? (HEADWEAR.has(path) ? "headwear" : undefined);
    const key = type ? `type:${type}` : `item:${item.id}`;
    if (!groups.has(key)) groups.set(key, type ? { key, type } : { key, item });
  }
  return [...groups.values()];
};
