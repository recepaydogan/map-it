const PROFILE_RULES = [
  {
    id: "medical",
    patterns: [/^Medical(?:Cabinet|Clinic|Storage)/, /^DoctorTools$/, /^NurseTools$/, /^StoreShelfMedical$/],
  },
  {
    id: "pharmacy",
    patterns: [/^Medical(?:Cabinet|ClinicDrugs|StorageDrugs)/, /^Pharmacy/, /^StoreShelfMedical$/],
  },
  {
    id: "police",
    patterns: [/^Police(?:Evidence|Storage|Tools)/, /^PrisonArmory/, /^SWATStorage/],
  },
  {
    id: "fire",
    patterns: [/^FireDept/, /^Fireman/, /^FireStorage/, /^ForestFireTools$/],
  },
  {
    id: "fuel",
    patterns: [/^GasStore/, /^GasStorage/, /^CarSupplyGasCans$/],
  },
  {
    id: "vehicle",
    patterns: [/^CarSupply/, /^GarageMechanics$/, /^Mechanic(?:Shelf|Special|Tools)/, /^StoreShelfMechanics$/],
  },
  {
    id: "supplies",
    patterns: [/^Grocery(?:Stand|Storage)/, /^StoreShelf(?:Combo|Drinks|Snacks|Spices)$/, /^Gigamart(?:Baking|CannedFood|DryGoods|Farming|Housewares|Pots)$/],
  },
  {
    id: "food",
    patterns: [/^Bakery/, /^DinerKitchen/, /^RestaurantKitchen/, /^StoreKitchen(?:Baking|Butcher|Cafe|Cutlery|Pots|Sauce)$/],
  },
  {
    id: "industrial",
    patterns: [/^Crate(?:Carpentry|Farming|Mechanics|Metalwork|Tools)/, /^FactoryLockers$/, /^RailYardTools$/, /^WeldingWorkshopTools$/],
  },
  {
    id: "community",
    patterns: [/^BankDeposit$/, /^Library(?:Books|GeneralReference|Magazines|Medical|Outdoors)$/, /^Office(?:Counter|Desk|Drawers|ShelfSupplies)/, /^School(?:GymSportsGear|Lockers)/],
  },
  {
    id: "lodging",
    patterns: [/^Motel(?:Fridge|Linens|SideTable|Towels)$/, /^BathroomCounterMotel$/, /^CampingStore(?:Gear|Lighting|SleepingBags|Tents)$/],
  },
  {
    id: "military",
    patterns: [/^Army(?:Bunker|Hangar|Storage|Surplus)/, /^MilitaryHangar/, /^SWATStorage/],
  },
  {
    id: "weapons",
    patterns: [/^GunStore(?:Accessories|Ammunition|BodyArmor|Guns|Knives|Pistols|Rifles|Shotguns)/, /^PawnShop(?:Guns|Knives|Tools)/, /^ToolStore(?:Carpentry|Farming|Metalwork|Tools)$/],
  },
];

const PROFILE_BY_SUBTYPE = {
  Pharmacy: "pharmacy",
};

const ITEM_NAME_OVERRIDES = {
  CanteenEmpty: "Empty Canteen",
  PetrolCanEmpty: "Empty Gas Can",
};

const countCharacter = (value, character) =>
  [...value].reduce((count, candidate) => count + Number(candidate === character), 0);

export const parseProceduralDistributionBlocks = (source) => {
  const blocks = new Map();
  const lines = source.split(/\r?\n/);
  let currentName;
  let currentLines = [];
  let depth = 0;

  for (const line of lines) {
    if (!currentName) {
      const match = line.match(/^\t([A-Za-z0-9_]+) = \{$/);
      if (!match) continue;
      currentName = match[1];
      currentLines = [line];
      depth = 1;
      continue;
    }

    currentLines.push(line);
    depth += countCharacter(line, "{") - countCharacter(line, "}");
    if (depth > 0) continue;
    blocks.set(currentName, currentLines.join("\n"));
    currentName = undefined;
    currentLines = [];
  }

  return blocks;
};

const extractWeightedItems = (source) => {
  const items = [];
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*"([A-Za-z0-9_.-]+)",\s*(\d+(?:\.\d+)?),?\s*$/);
    if (!match) continue;
    items.push({ id: match[1], weight: Number(match[2]) });
  }
  return items;
};

const getItemName = (itemId, itemNames) => {
  const qualifiedId = itemId.includes(".") ? itemId : `Base.${itemId}`;
  const rawId = itemId.replace(/^.*\./, "");
  return itemNames[qualifiedId] ?? itemNames[itemId] ?? ITEM_NAME_OVERRIDES[rawId] ?? rawId
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ");
};

export const buildMapLootProfiles = (
  distributionSource,
  itemNames,
  itemLimit = Number.POSITIVE_INFINITY,
) => {
  const blocks = parseProceduralDistributionBlocks(distributionSource);
  return Object.fromEntries(PROFILE_RULES.map(({ id, patterns }) => {
    const scores = new Map();
    let matchedDistributions = 0;
    for (const [name, block] of blocks) {
      if (!patterns.some((pattern) => pattern.test(name))) continue;
      matchedDistributions += 1;
      for (const item of extractWeightedItems(block)) {
        scores.set(item.id, (scores.get(item.id) ?? 0) + item.weight);
      }
    }
    const rankedItems = [...scores.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
    const strongestWeight = rankedItems[0]?.[1] ?? 1;
    const items = rankedItems
      .slice(0, itemLimit)
      .map(([itemId, weight]) => ({
        id: itemId,
        name: getItemName(itemId, itemNames),
        weight: Math.max(1, Math.round((weight / strongestWeight) * 100)),
      }));
    return [id, { id, items, matchedDistributions }];
  }));
};

export const getMapLootProfileId = (subtype, category) =>
  PROFILE_BY_SUBTYPE[subtype] ?? category;
