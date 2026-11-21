/** Sum independent stacks, but never add opposite branches of one flag. */
export const getInventoryQuantity = (entries) => {
  let minimum = 0, maximum = 0;
  const flags = new Map();
  for (const { amount = 1, inventoryCondition } of entries) {
    if (!Number.isFinite(amount) || amount < 0) throw new Error(`Invalid inventory quantity: ${amount}`);
    if (!inventoryCondition) { minimum += amount; maximum += amount; continue; }
    const { flagId, present } = inventoryCondition;
    if (!flagId || typeof present !== "boolean") throw new Error("Invalid inventory condition");
    const branches = flags.get(flagId) ?? [0, 0];
    branches[present ? 1 : 0] += amount; flags.set(flagId, branches);
  }
  for (const branches of flags.values()) {
    minimum += Math.min(...branches); maximum += Math.max(...branches);
  }
  return { minimum, maximum, conditional: minimum !== maximum };
};
