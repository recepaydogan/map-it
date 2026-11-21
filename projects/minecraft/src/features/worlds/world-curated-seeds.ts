import { GAME_CURATED_WORLD_PICKS } from "../../game-config.ts";

export type CuratedWorldPick = (typeof GAME_CURATED_WORLD_PICKS)[number];

/** Returns only picks whose edition, generation release and preset match exactly. */
export const curatedWorldPicksFor = (edition: string, version: string, preset: string): readonly CuratedWorldPick[] =>
  GAME_CURATED_WORLD_PICKS.filter(pick => pick.preset === preset && pick.contexts.some(context =>
    context.edition === edition && (context.versions as readonly string[]).includes(version)));

/** Resolves an ID inside the active generator context; IDs cannot cross a version boundary. */
export const resolveCuratedWorldPick = (id: string, edition: string, version: string, preset: string): CuratedWorldPick | null =>
  curatedWorldPicksFor(edition, version, preset).find(pick => pick.id === id) ?? null;

/** Public, deterministic preview path for one exact edition/release rendering. */
export const curatedWorldPreviewPath = (pick: CuratedWorldPick, edition: string, version: string): string =>
  `curated-worlds/${edition}-${version.replaceAll(".", "-")}-${pick.id}.webp`;
