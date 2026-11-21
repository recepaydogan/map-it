export const JEWELLERY_SLOTS = new Set(["amulet", "ring", "cloak"]);
const RARITY_RANK = { common: 0, uncommon: 1, rare: 2, veryrare: 3, legendary: 4 };

export const findUniqueEquipmentClass = (gameplay) => {
  if (!gameplay || (RARITY_RANK[gameplay.rarity?.toLocaleLowerCase("en-US") ?? "common"] ?? 0) < 1) return null;
  const type = gameplay.type?.toLocaleLowerCase("en-US");
  const slot = gameplay.slot?.toLocaleLowerCase("en-US") ?? "";
  const shieldLike = /shield/i.test(`${gameplay.weaponType ?? ""} ${gameplay.armorType ?? ""} ${gameplay.proficiency ?? ""}`)
    || slot === "melee offhand weapon";
  if (type === "weapon") return shieldLike ? "shield" : "weapon";
  if (type !== "armor") return null;
  if (shieldLike) return "shield";
  return JEWELLERY_SLOTS.has(slot) ? "jewellery" : "armor";
};
