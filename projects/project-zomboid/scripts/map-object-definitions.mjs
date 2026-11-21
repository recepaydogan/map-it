export const MAP_OBJECT_CATEGORY_IDS = [
  "object-water",
  "object-fuel",
  "object-heat",
  "object-power",
  "object-blacksmithing",
  "object-grinding",
  "object-production",
  "object-workbenches",
  "object-preservation",
  "object-ranching",
  "object-freezers",
  "object-water-dispensers",
  "object-barbecues",
];

const TYPES_BY_CUSTOM_NAME = new Map([
  ["Generator", ["generator", "object-power"]],
  ["Forge", ["forge", "object-blacksmithing"]],
  ["Anvil", ["anvil", "object-blacksmithing"]],
  ["Blacksmith Anvil", ["anvil", "object-blacksmithing"]],
  ["Stone Furnace", ["stone-furnace", "object-blacksmithing"]],
  ["Grinder", ["grinder", "object-grinding"]],
  ["Grindstone", ["grindstone", "object-grinding"]],
  ["Grinding Slab", ["grinding-slab", "object-grinding"]],
  ["Loom", ["loom", "object-production"]],
  ["Pottery Wheel", ["pottery-wheel", "object-production"]],
  ["Distillery", ["distillery", "object-production"]],
  ["Mill", ["mill", "object-production"]],
  ["Quern", ["quern", "object-production"]],
  ["Press", ["press", "object-production"]],
  ["Tannin Barrel", ["tannin-barrel", "object-production"]],
  ["Workbench", ["workbench", "object-workbenches"]],
  ["Drying Rack", ["drying-rack", "object-preservation"]],
  ["Trough", ["trough", "object-ranching"]],
  ["Freezer", ["freezer", "object-freezers"]],
  ["Barbecue", ["barbecue", "object-barbecues"]],
]);

const classifyTile = (tileName, properties) => {
  if (tileName === "camping_01_16" || properties.CustomName === "Well") {
    return ["well", "object-water"];
  }
  if (properties.fuelAmount) {
    return ["gas-pump", "object-fuel"];
  }
  if (properties.CustomName === "Oven" && properties.GroupName === "Antique") {
    return ["antique-oven", "object-heat"];
  }
  if (properties.CustomName === "Fireplace" || properties.container?.toLowerCase() === "fireplace") {
    return ["fireplace", "object-heat"];
  }
  if (properties.container?.toLowerCase() === "stonefurnace") {
    return ["stone-furnace", "object-blacksmithing"];
  }
  if (properties.CustomName === "Dispenser" && properties.GroupName === "Water") {
    return ["water-dispenser", "object-water-dispensers"];
  }
  return TYPES_BY_CUSTOM_NAME.get(properties.CustomName) ?? null;
};

const isGridAnchor = (properties) => !properties.SpriteGridPos || properties.SpriteGridPos === "0,0";

export const buildMapObjectTileDefinitions = (tileDefinitions) => {
  const objects = new Map();
  for (const [tileName, properties] of tileDefinitions) {
    if (!isGridAnchor(properties)) continue;
    const classification = classifyTile(tileName, properties);
    if (!classification) continue;
    const [type, category] = classification;
    objects.set(tileName, { type, category });
  }
  return objects;
};

export const createMapObjectLabels = (locale) => ({
  types: locale.map.objectTypes,
  categories: Object.fromEntries(MAP_OBJECT_CATEGORY_IDS.map((id) => [id, locale.map.categories[id]])),
});
