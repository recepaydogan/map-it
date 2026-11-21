const ITEM_NAME_OVERRIDES = {
  CanteenEmpty: "Empty Canteen",
  PetrolCanEmpty: "Empty Gas Can",
};

const humanizeItemId = (itemId) => itemId
  .replace(/^.*[.]/, "")
  .replace(/([a-z])([A-Z])/g, "$1 $2")
  .replace(/_/g, " ")
  .trim();

export const qualifyItemId = (itemId, defaultModule = "Base") => (
  itemId.includes(".") ? itemId : `${defaultModule}.${itemId}`
);

export const getMapItemName = (itemId, itemNames) => {
  const qualifiedId = qualifyItemId(itemId);
  const rawId = itemId.replace(/^.*[.]/, "");
  return itemNames[qualifiedId]
    ?? itemNames[itemId]
    ?? ITEM_NAME_OVERRIDES[rawId]
    ?? humanizeItemId(itemId);
};

export const parseScriptItemIds = (scriptSources) => {
  const itemIds = new Set();
  for (const source of scriptSources) {
    let currentModule = "Base";
    for (const line of source.split(/\r?\n/)) {
      const moduleMatch = line.match(/^\s*module\s+([A-Za-z_][A-Za-z0-9_.]*)\s*$/);
      if (moduleMatch) {
        currentModule = moduleMatch[1];
        continue;
      }
      const itemMatch = line.match(/^\s*item\s+([A-Za-z_][A-Za-z0-9_]*)\s*$/);
      if (itemMatch) itemIds.add(qualifyItemId(itemMatch[1], currentModule));
    }
  }
  return itemIds;
};

export const parseScriptItems = (scriptSources) => {
  const items = new Map();
  for (const source of scriptSources) {
    const moduleMatches = [...source.matchAll(/^\s*module\s+([A-Za-z_][A-Za-z0-9_.]*)\s*$/gm)];
    for (const match of source.matchAll(/^\s*item\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{([\s\S]*?)^\s*\}/gm)) {
      const moduleName = [...moduleMatches]
        .reverse()
        .find((candidate) => candidate.index < match.index)?.[1] ?? "Base";
      const id = qualifyItemId(match[1], moduleName);
      const tags = match[2].match(/^\s*Tags\s*=\s*([^,\r\n]+)/mi)?.[1]
        .split(";")
        .map((tag) => tag.trim())
        .filter(Boolean) ?? [];
      items.set(id, { id, tags });
    }
  }
  return items;
};

export const buildMapItemCatalog = (scriptSources, itemNames, lootItemIds = new Set()) => {
  const scriptItems = parseScriptItems(scriptSources);
  const itemIds = new Set(scriptItems.keys());
  for (const itemId of lootItemIds) itemIds.add(qualifyItemId(itemId));
  return [...itemIds]
    .sort((left, right) => left.localeCompare(right))
    .map((id) => ({
      id,
      name: getMapItemName(id, itemNames),
      lootable: lootItemIds.has(id) || lootItemIds.has(id.replace(/^Base[.]/, "")),
      tags: scriptItems.get(id)?.tags ?? [],
    }));
};
