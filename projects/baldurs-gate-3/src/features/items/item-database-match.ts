import type { ItemDatabaseEntry } from "./types";

export interface ItemDatabaseReference {
  /** Exact native instance, distinct from its reusable model root. */
  objectId?: string;
  /** The placed object's model root; generated variants may share this root. */
  templateId?: string;
  statsId?: string;
  itemName?: string;
  title: string;
}

export interface ItemDatabaseIndex {
  byObjectId: Map<string, ItemDatabaseEntry>;
  byName: Map<string, ItemDatabaseEntry[]>;
  byStatsId: Map<string, ItemDatabaseEntry[]>;
  byTemplateId: Map<string, ItemDatabaseEntry[]>;
}

const normalizeIdentity = (value: string) => value.trim().toLocaleLowerCase("en-US");

const addToIndex = (
  index: Map<string, ItemDatabaseEntry[]>,
  key: string | undefined,
  item: ItemDatabaseEntry,
) => {
  if (!key) return;
  const normalized = normalizeIdentity(key);
  const matches = index.get(normalized) ?? [];
  if (!matches.some((candidate) => candidate.id === item.id)) matches.push(item);
  index.set(normalized, matches);
};

export const createItemDatabaseIndex = (items: ItemDatabaseEntry[]): ItemDatabaseIndex => {
  const index: ItemDatabaseIndex = {
    byObjectId: new Map(),
    byName: new Map(),
    byStatsId: new Map(),
    byTemplateId: new Map(),
  };

  for (const item of items) {
    if (item.generation?.origin === "placed-identity") {
      const objectId = item.generation.sourceObjectId;
      if (!objectId || index.byObjectId.has(normalizeIdentity(objectId))) {
        throw new Error(`Duplicate or missing placed item identity: ${item.id}`);
      }
      index.byObjectId.set(normalizeIdentity(objectId), item);
      continue;
    }
    addToIndex(index.byTemplateId, item.id, item);
    for (const templateId of item.templateIds) addToIndex(index.byTemplateId, templateId, item);
    addToIndex(index.byStatsId, item.statsId, item);
    addToIndex(index.byName, item.name, item);
    for (const localizedName of Object.values(item.localizedNames)) {
      addToIndex(index.byName, localizedName, item);
    }
  }

  return index;
};

const chooseBestMatch = (
  candidates: ItemDatabaseEntry[],
  reference: ItemDatabaseReference,
) => {
  if (candidates.length <= 1) return candidates[0];
  const names = [reference.title, reference.itemName]
    .filter((name): name is string => Boolean(name))
    .map(normalizeIdentity);
  const exactNameMatches = candidates.filter((item) => (
    names.includes(normalizeIdentity(item.name))
    || Object.values(item.localizedNames).some((name) => names.includes(normalizeIdentity(name)))
  ));
  const documented = exactNameMatches.filter((item) => item.acquisitions.length > 0);
  if (documented.length === 1) return documented[0];
  if (exactNameMatches.length) return exactNameMatches[0];
  return candidates.find((item) => item.unique) ?? candidates[0];
};

export const resolveItemDatabaseEntry = (
  index: ItemDatabaseIndex,
  reference: ItemDatabaseReference,
): ItemDatabaseEntry | undefined => {
  const instance = reference.objectId ? index.byObjectId.get(normalizeIdentity(reference.objectId)) : undefined;
  if (instance) return (!reference.templateId || instance.templateIds.some((id) => normalizeIdentity(id) === normalizeIdentity(reference.templateId!)))
    && (!reference.statsId || normalizeIdentity(instance.statsId) === normalizeIdentity(reference.statsId)) ? instance : undefined;
  // Constrain the root by the authored Stats when both are available. A root
  // alone selects its defaults, not an unrelated stat-generated variant.
  const templateMatches = reference.templateId
    ? index.byTemplateId.get(normalizeIdentity(reference.templateId)) ?? []
    : [];
  if (templateMatches.length > 0) {
    const exact = templateMatches.filter((item) => reference.statsId
      ? normalizeIdentity(item.statsId) === normalizeIdentity(reference.statsId)
      : !item.generation);
    return chooseBestMatch(exact, reference);
  }

  const statsMatches = reference.statsId
    ? index.byStatsId.get(normalizeIdentity(reference.statsId)) ?? []
    : [];
  if (statsMatches.length > 0) return chooseBestMatch(statsMatches, reference);

  for (const name of [reference.title, reference.itemName]) {
    if (!name) continue;
    const nameMatches = index.byName.get(normalizeIdentity(name)) ?? [];
    if (nameMatches.length > 0) return chooseBestMatch(nameMatches, reference);
  }

  return undefined;
};
