export const mechanicsCatalogFixture = (edition: string, version: string) => {
  const revision = "c".repeat(40), root = `https://example.test/mechanics/${revision}`;
  const provenance = (path: string) => ({ path, sha256: "d".repeat(64), url: `${root}/${path}` });
  const text = (name: string, description?: string) => ({ en: { name, ...(description ? { description } : {}) } });
  const ref = (kind: "item" | "entity" | "poi", id: string, extra = {}) => ({ kind, id, ...extra });
  return { schemaVersion: 1, kind: "mechanics-catalog", source: { edition, version, revision, title: "Diagnostic mechanics", url: root },
    subjects: [
      { kind: "entity", id: "fixture:mount", text: text("Mount", "Synthetic browser fixture entity.") },
      { kind: "item", id: "fixture:tack", text: text("Tack") },
      { kind: "item", id: "fixture:hide", text: text("Hide") },
      { kind: "poi", id: "minecraft:village", text: text("Village guide", "Synthetic POI fixture for inspector navigation only.") },
    ],
    mechanics: [
      { id: "fixture:equip_mount", kind: "equipment", subject: ref("entity", "fixture:mount"), text: text("Equip mount"),
        requirements: [ref("item", "fixture:tack", { count: { min: 1, max: 1 } })], inputs: [], outputs: [], related: [],
        provenance: provenance("equipment.json") },
      { id: "fixture:mount_drop", kind: "drop", subject: ref("entity", "fixture:mount"), text: text("Mount drops"),
        requirements: [], inputs: [], outputs: [ref("item", "fixture:hide", { count: { min: 0, max: 2 }, chance: 0.75 })], related: [],
        provenance: provenance("drops.json") },
      { id: "fixture:village_help", kind: "interaction", subject: ref("poi", "minecraft:village"), text: text("Use village services"),
        requirements: [], inputs: [], outputs: [], related: [ref("item", "fixture:tack")],
        provenance: provenance("village.json") },
    ] };
};
