import type { CharacterSnapshot, CharacterProfession } from "../character-sync/character-snapshot";
import type { ProfessionSourceRecipe } from "../professions/use-profession-details";
import { recipeAvailability } from "../character-sync/recipe-availability";

export function craftingPlan(recipe: ProfessionSourceRecipe, character: CharacterSnapshot | undefined, profession: CharacterProfession | undefined, quantity: number, includeBank: boolean) {
  const crafts = Number.isFinite(quantity) ? Math.min(999, Math.max(1, Math.floor(quantity))) : 1;
  const counted = new Map<number, number>();
  for (const [id, count] of recipe.r ?? []) counted.set(id, (counted.get(id) ?? 0) + count * crafts);
  const inventoryKnown = Boolean(character?.bags) && (!includeBank || Boolean(character?.bank));
  const materials = [...counted].map(([id, need]) => {
    const have = inventoryKnown ? (character!.bags!.counts[String(id)] ?? 0) + (includeBank ? character!.bank!.counts[String(id)] ?? 0 : 0) : null;
    return { id, need, have, missing: have === null ? null : Math.max(0, need - have) };
  });
  const observed = character && profession ? recipeAvailability(recipe, profession, character, includeBank) : null;
  const materialsReady = inventoryKnown && Array.isArray(recipe.r) && materials.every(m => m.have !== null && m.have >= m.need);
  return { crafts, materials, inventoryKnown, materialsReady, knowledge: observed?.knowledge ?? "unknown",
    craftable: Boolean(observed?.craftable && materialsReady), output: recipe.make ? recipe.make[1] * crafts : null };
}
