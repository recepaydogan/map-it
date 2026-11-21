import type { ReferenceTarget } from "./reference-types";

export const isDungeonBossTarget = (target: ReferenceTarget | null | undefined): boolean =>
  target?.category === "dungeons" && /^boss:\d+$/.test(target.group ?? "");

export const dungeonBossTarget = (dungeonId: string, bossIndex: number, name: string): ReferenceTarget => ({
  category: "dungeons",
  id: dungeonId,
  group: `boss:${bossIndex}`,
  name,
});

export const dungeonBossIndex = (target: ReferenceTarget): number =>
  Number(target.group?.slice("boss:".length) ?? -1);
