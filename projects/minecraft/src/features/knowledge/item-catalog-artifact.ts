export const ITEM_CATALOG_FILE_LIMIT = 512 * 1024;
const RESOURCE_ID = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/;

export interface ItemCatalogIdentity {
  readonly edition: string;
  readonly version: string;
  readonly revision: string;
}

export interface ValidatedItemCatalog {
  readonly source: Readonly<ItemCatalogIdentity & { url: string }>;
  readonly items: readonly string[];
}

const record = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Invalid ${label}.`);
  return value as Record<string, unknown>;
};

const text = (value: unknown, label: string, limit: number) => {
  if (typeof value !== "string" || !value || value.length > limit) throw new Error(`Invalid ${label}.`);
  return value;
};

export const parseItemCatalogArtifact = (value: unknown, expected: ItemCatalogIdentity): ValidatedItemCatalog => {
  const root = record(value, "item catalog"), rawSource = record(root.source, "item catalog source");
  if (root.schemaVersion !== 1 || root.kind !== "item-catalog") throw new Error("Unsupported item catalog schema.");
  const source = Object.freeze({
    edition: text(rawSource.edition, "item catalog edition", 64),
    version: text(rawSource.version, "item catalog version", 64),
    revision: text(rawSource.revision, "item catalog revision", 128),
    url: text(rawSource.url, "item catalog source URL", 4096),
  });
  if (source.edition !== expected.edition || source.version !== expected.version || source.revision !== expected.revision)
    throw new Error("Item catalog does not match the selected edition, version and source revision.");
  if (!/^https:\/\/[^\s]+$/i.test(source.url) || !source.url.includes(source.revision))
    throw new Error("Item catalog source URL does not identify its HTTPS revision.");
  if (!Array.isArray(root.items) || !root.items.length || root.items.length > 10000) throw new Error("Invalid item catalog records.");
  const items = root.items.map((entry, index) => {
    const id = text(entry, `item catalog identity ${index}`, 256);
    if (!RESOURCE_ID.test(id)) throw new Error(`Invalid item catalog identity ${index}.`);
    return id;
  });
  if (new Set(items).size !== items.length) throw new Error("Duplicate item catalog identity.");
  if (!items.every((item, index) => index === 0 || items[index - 1].localeCompare(item, "en") < 0))
    throw new Error("Item catalog identities are not sorted.");
  return Object.freeze({ source, items: Object.freeze(items) });
};
