export const createSceneVendorResolver = (catalog) => {
  const profiles = new Map((catalog?.profiles ?? []).map((profile) => [`${profile.characterContentId}/${profile.anchorContentId}`, profile]));
  if (profiles.size !== (catalog?.profiles ?? []).length) throw new Error("Duplicate scene vendor profiles");
  return (destination) => destination
    ? profiles.get(`${destination.characterContentId}/${destination.anchorContentId}`) : undefined;
};

export const createStockTitleResolver = (gameplayCatalog, rootTemplateCatalog) => (rawId, language = "en") => {
  const statsId = gameplayCatalog?.entries?.[rawId] ? rawId : rawId?.replace(/^I_/, "");
  const gameplay = gameplayCatalog?.entries?.[statsId];
  if (!gameplay?.rootTemplate) return "";
  const template = rootTemplateCatalog?.templates?.[gameplay.rootTemplate.toLocaleLowerCase("en-US")];
  return template?.displayName?.[language] || template?.displayName?.en || "";
};

export const buildSceneVendorProfile = (profile, treasureCatalog, titleForId) => {
  const unresolvedStockIds = new Set();
  const titles = (ids) => [...new Set(ids.map((id) => {
    const title = titleForId(id);
    if (!title) unresolvedStockIds.add(id);
    return title;
  }).filter(Boolean))].sort((a, b) => a.localeCompare(b, "en"));
  const vendor = {
    tradeTables: profile.tradeTables,
    stockCategories: [],
    namedStock: titles(profile.tradeTables.flatMap((tableId) => treasureCatalog.tables[tableId].namedStockIds)),
    conditionalStock: profile.conditionalStock.map((variant) => ({ ...variant, namedStock: titles(variant.stockIds) })),
    sceneContext: { id: profile.id, characterContentId: profile.characterContentId, anchorContentId: profile.anchorContentId,
      evidence: profile.evidence, reason: profile.reason },
  };
  // Keep unresolved native table references explicit for source review. Never
  // guess a replacement item from a similar name or silently erase the ID.
  return { ...vendor, ...(unresolvedStockIds.size ? { unresolvedStockIds: [...unresolvedStockIds] } : {}) };
};
