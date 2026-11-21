import { useEffect, useState } from "react";
import { IS_OVERWOLF } from "../../utils/platform";
import { getSelectedAppId, MAP_GAMES, selectApp } from "./app-selection";
import { resolveStartupSelection } from "./app-startup-selection";

export function useStartupSelection(): boolean {
  const [ready, setReady] = useState(!IS_OVERWOLF);
  useEffect(() => {
    if (!IS_OVERWOLF) return;
    return resolveStartupSelection({
      games: overwolf.games, apps: MAP_GAMES, current: getSelectedAppId,
      select: selectApp, ready: () => setReady(true),
    });
  }, []);
  return ready;
}
