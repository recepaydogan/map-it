import { GAME_GUIDE_REDSTONE_COMPONENTS, GAME_GUIDE_REDSTONE_SIGNAL_LINE } from "../../game-config.ts";

export type RedstoneGuideComponent = (typeof GAME_GUIDE_REDSTONE_COMPONENTS)[number];

export const redstoneGuideItemId = (component: RedstoneGuideComponent, edition: string): string =>
  edition === "bedrock" && "bedrockId" in component ? component.bedrockId : component.id;

export const createRedstoneGuideIndex = (edition: string): ReadonlyMap<string, RedstoneGuideComponent> =>
  new Map(GAME_GUIDE_REDSTONE_COMPONENTS.map(component => [redstoneGuideItemId(component, edition), component]));

export const redstoneSignalAt = (distance: number, powered: boolean, repeater: boolean): number => {
  if (!Number.isInteger(distance) || distance < 1 || distance > GAME_GUIDE_REDSTONE_SIGNAL_LINE.maxDistance)
    throw new Error(`Invalid redstone line distance: ${distance}`);
  if (!powered) return 0;
  const repeatedDistance = repeater && distance > GAME_GUIDE_REDSTONE_SIGNAL_LINE.repeaterAfter
    ? distance - GAME_GUIDE_REDSTONE_SIGNAL_LINE.repeaterAfter : distance;
  return Math.max(0, 16 - repeatedDistance);
};
