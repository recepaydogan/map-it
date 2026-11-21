import type { GameSession } from "../game-session/session-types.ts";

export interface VersionedGuideSource {
  readonly gameId: string;
  readonly edition: string;
  readonly version: string;
}

export interface GuideSourcePreference {
  readonly key: string | null;
  readonly liveSessionKey: string | null;
}

export const guideSourceKey = (source: VersionedGuideSource): string =>
  `${source.gameId}:${source.edition}:${source.version}`;

export const liveGuideSessionKey = (session: GameSession | null): string | null =>
  session?.connected
    ? `${session.id}:${session.edition}:${session.gameVersion ?? "unknown"}`
    : null;

/** Keeps the live edition authoritative; exact version wins when packaged, otherwise the newest packaged edition source is explicit in the UI. */
export const resolveLiveGuideSource = <Source extends VersionedGuideSource>(
  sources: readonly Source[], session: GameSession | null,
): Source | null => {
  if (!liveGuideSessionKey(session)) return null;
  return sources.find(source => source.edition === session!.edition && source.version === session!.gameVersion)
    ?? sources.find(source => source.edition === session!.edition)
    ?? null;
};

/** Keep the selected world's guide in its edition while a different game starts. */
export const resolveWorldGuideSource = <Source extends VersionedGuideSource & { readonly recipeIdentity?: unknown }>(
  sources: readonly Source[], world: { edition: string; version: string } | null, liveSource: Source | null,
): Source | null => {
  if (!world) return null;
  if (liveSource?.edition === world.edition && liveSource.recipeIdentity) return liveSource;
  return sources.find(source => source.edition === world.edition && source.version === world.version && source.recipeIdentity)
    ?? sources.find(source => source.edition === world.edition && source.recipeIdentity)
    ?? null;
};

/** A new live session/version wins once; an explicit choice can then override it for comparison. */
export const resolveGuideSourceSelection = <Source extends VersionedGuideSource>({
  sources, session, preference, fallbackEdition, fallbackVersion,
}: {
  sources: readonly Source[];
  session: GameSession | null;
  preference: GuideSourcePreference;
  fallbackEdition?: string | null;
  fallbackVersion?: string | null;
}): Source => {
  const liveSession = liveGuideSessionKey(session);
  const liveSource = resolveLiveGuideSource(sources, session);
  const preferred = preference.key === null ? null
    : sources.find(source => guideSourceKey(source) === preference.key) ?? null;
  const source = liveSource && preference.liveSessionKey !== liveSession ? liveSource
    : preferred
      ?? liveSource
      ?? sources.find(candidate => candidate.edition === fallbackEdition && candidate.version === fallbackVersion)
      ?? sources.find(candidate => candidate.edition === fallbackEdition)
      ?? sources[0];
  if (!source) throw new Error("Guide source list must not be empty.");
  return source;
};
