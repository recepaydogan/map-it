import type { InspectorSection } from "../inspector/inspector-types";
import type { KnowledgeSubjectDisplay } from "../knowledge/mechanics-inspector-content";

export interface StructureDiscoveries {
  readonly mobs: readonly StructureDiscoverySubject[];
  readonly loot: readonly StructureDiscoverySubject[];
}

type StructureDiscoverySubject = string | Readonly<{
  id: string;
  since?: Readonly<Record<string, string>>;
}>;

const versionParts = (version: string) => version.split(".").map(part => Number.parseInt(part, 10));
export const isAtLeastVersion = (version: string, minimum: string) => {
  const current = versionParts(version), required = versionParts(minimum);
  for (let index = 0; index < Math.max(current.length, required.length); index++) {
    const difference = (current[index] ?? 0) - (required[index] ?? 0);
    if (difference) return difference > 0;
  }
  return true;
};

export const availableDiscoveryIds = (entries: readonly StructureDiscoverySubject[], edition: string, version: string) => entries
  .filter(entry => typeof entry === "string" || !entry.since?.[edition] || isAtLeastVersion(version, entry.since[edition]))
  .map(entry => typeof entry === "string" ? entry : entry.id);

const discoveryLinks = (
  kind: "entity" | "item",
  ids: readonly string[],
  display: KnowledgeSubjectDisplay,
) => ids.map((id, index) => {
  const subject = { kind, id } as const;
  return { key: `structure:${kind}:${index}:${id}`, subject, ...display(kind, id) };
});

/** Builds compact, guide-linked structure summaries from game-owned IDs. */
export const createStructureDiscoverySections = (
  discoveries: StructureDiscoveries,
  display: KnowledgeSubjectDisplay,
  titles: Readonly<{ mobs: string; loot: string }>,
  context: Readonly<{ edition: string; version: string }>,
): InspectorSection[] => {
  const mobs = availableDiscoveryIds(discoveries.mobs, context.edition, context.version);
  const loot = availableDiscoveryIds(discoveries.loot, context.edition, context.version);
  return [
    ...(mobs.length ? [{
      key: "structure:mobs",
      title: titles.mobs,
      links: discoveryLinks("entity", mobs, display),
    }] : []),
    ...(loot.length ? [{
      key: "structure:loot",
      title: titles.loot,
      links: discoveryLinks("item", loot, display),
    }] : []),
  ];
};
