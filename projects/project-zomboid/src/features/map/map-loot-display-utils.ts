import type { MapLootItem } from "./types";

export interface MapLootDisplayGroup {
  key: string;
  name: string;
  count: number;
  weight: number;
  variants: string[];
}

const BOOK_VOLUME_PATTERN = /^(.+?)\s+(?:I|II|III|IV|V|VI|VII|VIII|IX|X)(?::|$)/;
const NAMED_FAMILY_PATTERNS = [
  /^(Picture) of\b/i,
  /^(Map) of\b/i,
];
const VARIANT_SEPARATOR_PATTERN = /^(.+?)(?::|\s+-\s+)/;

const getDisplayName = (item: MapLootItem) => item.name ?? item.id.replace(/^.*[.]/, "");

const getCandidateFamilyName = (itemName: string) => {
  const bookFamily = itemName.match(BOOK_VOLUME_PATTERN)?.[1]?.trim();
  if (bookFamily) return bookFamily;
  for (const pattern of NAMED_FAMILY_PATTERNS) {
    const family = itemName.match(pattern)?.[1]?.trim();
    if (family) return family;
  }
  return itemName.match(VARIANT_SEPARATOR_PATTERN)?.[1]?.trim() ?? itemName;
};

export const groupMapLootItems = (items: MapLootItem[]): MapLootDisplayGroup[] => {
  const candidates = items.map((item) => {
    const itemName = getDisplayName(item);
    const familyName = getCandidateFamilyName(itemName);
    return { item, itemName, familyName, familyKey: familyName.toLocaleLowerCase("en-US") };
  });
  const familyCounts = candidates.reduce((counts, { familyKey }) => {
    counts.set(familyKey, (counts.get(familyKey) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());
  const groups = new Map<string, MapLootDisplayGroup & { firstName: string }>();

  for (const { item, itemName, familyName: candidateName, familyKey } of candidates) {
    const familyName = familyCounts.get(familyKey)! > 1 ? candidateName : itemName;
    const key = familyName.toLocaleLowerCase("en-US");
    const current = groups.get(key);
    if (current) {
      current.count += 1;
      current.weight = Math.max(current.weight, item.weight);
      if (!current.variants.includes(itemName)) current.variants.push(itemName);
      continue;
    }
    groups.set(key, {
      key,
      name: familyName,
      firstName: itemName,
      count: 1,
      weight: item.weight,
      variants: [itemName],
    });
  }

  return [...groups.values()]
    .sort((left, right) => right.weight - left.weight || left.name.localeCompare(right.name))
    .map(({ firstName, ...group }) => ({
      ...group,
      name: group.count === 1 ? firstName : group.name,
    }));
};
