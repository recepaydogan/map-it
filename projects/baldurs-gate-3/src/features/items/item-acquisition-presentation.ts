import type { ItemAcquisition, ItemAcquisitionKind } from "./types";

const COMBINED_METHODS: ItemAcquisitionKind[] = ["drop", "pickpocket"];

export interface ItemAcquisitionPresentation {
  id: string;
  kind: ItemAcquisitionKind;
  methods: ItemAcquisitionKind[];
  acquisitions: ItemAcquisition[];
}

const hasMethod = (acquisitions: ItemAcquisition[], kind: ItemAcquisitionKind) =>
  acquisitions.some((acquisition) => acquisition.kind === kind);

const localizedKey = (values: Record<string, string> | undefined) => values
  ? Object.entries(values).sort(([left], [right]) => left.localeCompare(right, "en")) : null;

// Different story conditions, quantities or identities cannot share one card.
const contextKey = (acquisition: ItemAcquisition) => JSON.stringify([
  acquisition.source, localizedKey(acquisition.localizedSources), acquisition.certainty,
  acquisition.amount ?? null, acquisition.detail ?? null, localizedKey(acquisition.localizedDetails),
  acquisition.locationDetail ?? null, localizedKey(acquisition.localizedLocationDetails),
  acquisition.inventoryVariants?.map((entry) => [entry.amount ?? 1, entry.inventoryCondition?.flagId ?? null,
    entry.inventoryCondition?.present ?? null]).sort() ?? null,
]);

const present = (
  id: string,
  kind: ItemAcquisitionKind,
  methods: ItemAcquisitionKind[],
  acquisitions: ItemAcquisition[],
): ItemAcquisitionPresentation => ({ id, kind, methods, acquisitions });

export const presentItemAcquisitions = (
  acquisitions: ItemAcquisition[],
): ItemAcquisitionPresentation[] => {
  const order = new Map(acquisitions.map((acquisition, index) => [acquisition, index]));
  const sources = new Map<string, ItemAcquisition[]>();

  for (const acquisition of acquisitions) {
    const key = acquisition.sourceId
      ? `source:${acquisition.sourceId}`
      : `acquisition:${acquisition.id}`;
    sources.set(key, [...(sources.get(key) ?? []), acquisition]);
  }

  const presentations: Array<ItemAcquisitionPresentation & { order: number }> = [];
  for (const [sourceKey, sourceAcquisitions] of sources) {
    const contexts = new Map<string, ItemAcquisition[]>();
    for (const acquisition of sourceAcquisitions) {
      const key = contextKey(acquisition);
      const entries = contexts.get(key) ?? [];
      entries.push(acquisition);
      contexts.set(key, entries);
    }
    for (const [contextIndex, entries] of [...contexts.values()].entries()) {
      const locations = new Map<string, ItemAcquisition[]>();
      for (const acquisition of entries) {
        const key = JSON.stringify([acquisition.mapId ?? null, acquisition.locationId ?? null]);
        const matches = locations.get(key) ?? [];
        matches.push(acquisition);
        locations.set(key, matches);
      }
      const groups = new Map<string, ItemAcquisitionPresentation>();
      const add = (kind: ItemAcquisitionKind, methods: ItemAcquisitionKind[], rows: ItemAcquisition[]) => {
        const key = methods.join(":");
        const group = groups.get(key) ?? present(`${sourceKey}:context:${contextIndex}:${key}`, kind, methods, []);
        group.acquisitions.push(...rows);
        groups.set(key, group);
      };
      for (const rows of locations.values()) {
        // Both methods must be proven at this location under these conditions.
        const combines = COMBINED_METHODS.every((kind) => hasMethod(rows, kind));
        if (combines) {
          add("carried", COMBINED_METHODS, rows.filter(({ kind }) => COMBINED_METHODS.includes(kind) || kind === "carried"));
        }
        for (const row of rows) {
          if (combines && (COMBINED_METHODS.includes(row.kind) || row.kind === "carried")) continue;
          add(row.kind, [row.kind], [row]);
        }
      }
      for (const group of groups.values()) {
        group.acquisitions.sort((left, right) => order.get(left)! - order.get(right)!);
        presentations.push({ ...group, order: order.get(group.acquisitions[0])! });
      }
    }
  }

  return presentations
    .sort((left, right) => left.order - right.order)
    .map(({ id, kind, methods, acquisitions: sourceAcquisitions }) => ({
      id,
      kind,
      methods,
      acquisitions: sourceAcquisitions,
    }));
};

export const uniqueAcquisitionLocations = (acquisitions: ItemAcquisition[]) => {
  const locations = new Map<string, ItemAcquisition>();
  for (const acquisition of acquisitions) {
    if (!acquisition.mapId || !acquisition.locationId) continue;
    const key = `${acquisition.mapId}\u0000${acquisition.locationId}`;
    if (!locations.has(key)) locations.set(key, acquisition);
  }
  return [...locations.values()];
};
