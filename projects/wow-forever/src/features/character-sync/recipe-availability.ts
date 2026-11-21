import type { CharacterSnapshot, CharacterProfession } from "./character-snapshot";
import type { ProfessionSourceRecipe } from "../professions/use-profession-details";

export function recipeAvailability(recipe: ProfessionSourceRecipe, profession: CharacterProfession, character: CharacterSnapshot, includeBank = false) {
  const id = String(recipe.s);
  const knowledge = profession.learned.includes(id) ? "learned" : profession.unlearned.includes(id) || profession.complete ? "unlearned" : "unknown";
  const requirements = new Map<number, number>();
  for (const [item, count] of recipe.r ?? []) requirements.set(item, (requirements.get(item) ?? 0) + count);
  const materials = [...requirements].map(([id, need]) => {
    const have = character.bags ? (character.bags.counts[String(id)] ?? 0) + (includeBank ? character.bank?.counts[String(id)] ?? 0 : 0) : null;
    return { id, need, have, missing: have === null ? null : Math.max(0, need - have) };
  });
  const inventoryKnown = Boolean(character.bags) && (!includeBank || Boolean(character.bank));
  const skillKnown = recipe.req === undefined ? false : profession.skill !== null && profession.skill >= recipe.req;
  const craftable = knowledge === "learned" && inventoryKnown && skillKnown && character.level !== null && character.level >= (recipe.rl ?? 1)
    && Array.isArray(recipe.r) && materials.every(material => material.have !== null && material.have >= material.need);
  return { knowledge, craftable, materials };
}
