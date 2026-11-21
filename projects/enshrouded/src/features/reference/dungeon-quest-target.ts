import type { ReferenceTarget } from "./reference-types";

export const isDungeonQuestTarget = (target: ReferenceTarget | null | undefined): boolean =>
  target?.category === "dungeons" && /^quest:\d+$/.test(target.group ?? "");

export const dungeonQuestTarget = (dungeonId: string, questId: string, name: string): ReferenceTarget => ({
  category: "dungeons",
  id: dungeonId,
  group: `quest:${questId}`,
  name,
});

export const dungeonQuestId = (target: ReferenceTarget): string =>
  target.group?.slice("quest:".length) ?? "";
