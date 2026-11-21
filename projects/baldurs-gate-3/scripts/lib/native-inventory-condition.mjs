/** Native loadout eligibility, not AI source/target combat-use conditions. */
export const readNativeInventoryCondition = (entry) => {
  const only = entry.OnlyInNPCLoadout ?? [], exclude = entry.ExcludeInNPCLoadout ?? [];
  // Current sources use one predicate per row. Do not invent AND/OR semantics
  // if a future extraction introduces compound loadout requirements.
  if (only.length + exclude.length > 1) throw new Error("Compound native inventory loadout conditions require source review");
  const value = (only[0] ?? exclude[0])?.Object?.value;
  if (!only.length && !exclude.length) return {};
  if (typeof value !== "string" || !value) throw new Error("Missing native inventory loadout ID");
  return { inventoryCondition: { flagId: value.toLowerCase(), present: only.length === 1 } };
};
