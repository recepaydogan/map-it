import { useCallback, useState } from "react";
import { useGameSession } from "../game-session/use-game-session";
import type { GuideSource } from "./guide-source-controls";
import { guideSourceKey, liveGuideSessionKey, resolveGuideSourceSelection } from "./guide-source-selection";

export const useGuideSourceSelection = <Source extends GuideSource>(sources: readonly Source[], options: {
  initialSource?: GuideSource | null;
  fallbackEdition?: string | null;
  fallbackVersion?: string | null;
} = {}) => {
  const live = useGameSession();
  const liveSession = liveGuideSessionKey(live.session);
  const [preference, setPreference] = useState(() => ({
    key: options.initialSource ? guideSourceKey(options.initialSource) : null,
    liveSessionKey: liveSession,
  }));
  const source = resolveGuideSourceSelection({
    sources,
    session: live.session,
    preference,
    fallbackEdition: options.fallbackEdition,
    fallbackVersion: options.fallbackVersion,
  });
  const selectSource = useCallback((gameId: string, edition: string, version: string) => {
    setPreference({ key: `${gameId}:${edition}:${version}`, liveSessionKey: liveSession });
  }, [liveSession]);
  return { source, selectSource };
};
