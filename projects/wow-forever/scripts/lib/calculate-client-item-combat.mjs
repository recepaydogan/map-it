/** Calculate base item stats from the installed client scaling tables. */
const floatBits = Buffer.allocUnsafe(4);
const asFloat = (bits) => {
  floatBits.writeUInt32LE(bits >>> 0, 0);
  return floatBits.readFloatLE(0);
};

const budgetSlot = new Map([
  ...[1, 4, 5, 7, 15, 17, 20, 25].map((slot) => [slot, 0]),
  ...[3, 6, 8, 10, 12].map((slot) => [slot, 1]),
  ...[2, 9, 11, 14, 16, 23].map((slot) => [slot, 2]),
  ...[13, 21, 22].map((slot) => [slot, 3]),
  [28, 4],
  [26, 0],
]);

export const calculateClientItemCombat = (item, sparse, tables) => {
  const slotIndex = budgetSlot.get(item.inventoryType);
  const budgetRow = tables.randPropPoints.getRowData(item.itemLevel);
  const budgetField = item.qualityCode === 2 ? 6
    : item.qualityCode === 3 || item.qualityCode === 7 ? 5
    : item.qualityCode >= 4 && item.qualityCode <= 6 ? 4 : null;
  const budget = slotIndex !== undefined && budgetField !== null && budgetRow
    ? asFloat(budgetRow[budgetField].data[slotIndex]) : 0;
  // Socketed items need an additional allocation adjustment; withhold those totals.
  const hasSocketAllocation = sparse.statPercentageOfSocket.some((amount) => amount !== 0);
  const stats = !hasSocketAllocation && budget > 0
    ? sparse.statModifierBonusStat.flatMap((code, index) => {
      const percent = sparse.statPercentEditor[index];
      const value = Math.round(percent * budget / 10000);
      return code >= 0 && Number.isFinite(value) && value !== 0 ? [{ code, value }] : [];
    }) : [];

  let baseArmor;
  if (item.classCode === 4 && item.subclassCode >= 1 && item.subclassCode <= 4) {
    const armorSlot = item.inventoryType === 20 ? 5 : item.inventoryType;
    const total = tables.itemArmorTotal.getRowData(item.itemLevel);
    const quality = tables.itemArmorQuality.getRowData(item.itemLevel);
    const location = tables.armorLocation.getRowData(armorSlot);
    if (total && quality && location && item.qualityCode < 7) {
      const typeIndex = item.subclassCode - 1;
      const amount = Math.floor(asFloat(total[typeIndex + 1].data)
        * asFloat(quality[0].data[item.qualityCode])
        * asFloat(location[typeIndex].data));
      if (Number.isFinite(amount) && amount > 0) baseArmor = amount;
    }
  }
  return { ...(baseArmor ? { baseArmor } : {}), ...(stats.length ? { stats } : {}) };
};
