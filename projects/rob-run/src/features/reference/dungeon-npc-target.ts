import type { ReferenceTarget } from "./reference-types";

export const isDungeonNpcTarget = (target: ReferenceTarget | null | undefined): boolean =>
  target?.category === "dungeons" && target.group?.startsWith("npc:") === true;

export const dungeonNpcTarget = (dungeonId: string, name: string): ReferenceTarget => ({
  category: "dungeons",
  id: dungeonId,
  group: `npc:${encodeURIComponent(name)}`,
  name,
});

export const dungeonNpcName = (target: ReferenceTarget): string =>
  decodeURIComponent(target.group?.slice("npc:".length) ?? "");
