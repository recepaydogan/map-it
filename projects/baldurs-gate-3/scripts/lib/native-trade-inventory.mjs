// A native trade pool describes possible generated contents, not an actor's
// role, current trade permission, carried items, or death drops.
export const buildNativeTradeInventory = (tableIds, treasureCatalog, titleForId) => {
  const tradeTables = [...new Set(tableIds ?? [])];
  if (!tradeTables.length) return null;
  const unresolvedTradeTables = tradeTables.filter((id) => !treasureCatalog?.tables?.[id]);
  const pools = tradeTables.flatMap((id) => treasureCatalog?.tables?.[id] ?? []);
  const stockIds = [...new Set(pools.flatMap((pool) => pool.namedStockIds ?? []))];
  const stockCategories = [...new Set(pools.flatMap((pool) => pool.stockCategories ?? []))];
  if (!stockIds.length && !stockCategories.length && !unresolvedTradeTables.length) return null;
  const unresolvedStockIds = [];
  const names = stockIds.map((id) => {
    const title = titleForId(id);
    if (!title) unresolvedStockIds.push(id);
    return title;
  });
  return {
    sourceKind: "native-trade-pool",
    availability: "unverified",
    scope: "authored-placement",
    tradeTables,
    stockCategories,
    stockIds,
    namedStock: [...new Set(names.filter(Boolean))].sort((a, b) => a.localeCompare(b, "en")),
    ...(unresolvedTradeTables.length ? { unresolvedTradeTables } : {}),
    ...(unresolvedStockIds.length ? { unresolvedStockIds } : {}),
  };
};
