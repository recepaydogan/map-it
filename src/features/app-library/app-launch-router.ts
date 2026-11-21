export type LaunchContext = { source: string; parameter?: string };
type GameInfo = { isRunning?: boolean; classId?: number } | null | undefined;
type LaunchEvent = { origin?: string; parameter?: string };
type EventApi<T> = { addListener(listener: (event: T) => void): void; removeListener(listener: (event: T) => void): void };
type Platform = {
  games: { getRunningGameInfo(callback: (info: GameInfo) => void): void; onGameInfoUpdated: EventApi<{ gameInfo?: GameInfo }> };
  extensions: { onAppLaunchTriggered: EventApi<LaunchEvent> };
};

export function launchSource(origin: string | null | undefined): string {
  if (!origin) return "dock";
  try { return new URL(origin).searchParams.get("source")?.toLowerCase() || "dock"; }
  catch { return origin.toLowerCase(); }
}

/** Select the matching module; its original controller owns window preferences. */
export function startAppLaunchRouter({ platform, apps, current, activate, showLibrary, initial }: {
  platform: Platform;
  apps: readonly { id: string; gameIds: readonly number[] }[];
  current: () => string | null;
  activate: (id: string | null, launch: LaunchContext) => void;
  showLibrary: () => void;
  initial: LaunchContext;
}): () => void {
  let disposed = false;
  let generation = 0;
  let detected: string | undefined;
  const match = (info: GameInfo) => info?.isRunning ? apps.find(app => app.gameIds.includes(Number(info.classId))) : undefined;
  const resolve = (launch: LaunchContext, cold = false) => {
    const probe = ++generation;
    platform.games.getRunningGameInfo(info => {
      if (disposed || probe !== generation) return;
      const running = match(info);
      if (running) {
        detected = running.id;
        activate(running.id, launch);
      } else if (launch.source !== "gamelaunchevent") {
        activate(current(), launch);
        if (!current()) showLibrary();
      } else if (cold) {
        // Game info may arrive after a cold GameLaunch. Do not boot a stale
        // module (and reveal its windows) while waiting for the correct game.
        activate(null, launch);
      }
    });
  };
  const changed = (event: { gameInfo?: GameInfo }) => {
    if (disposed || !event.gameInfo) return;
    const running = match(event.gameInfo);
    if (!event.gameInfo.isRunning) { detected = undefined; return; }
    if (running && detected !== running.id) {
      generation++;
      detected = running.id;
      activate(running.id, { source: "gamelaunchevent" });
    }
  };
  const launched = (event: LaunchEvent) => resolve({ source: launchSource(event.origin), parameter: event.parameter });
  platform.games.onGameInfoUpdated.addListener(changed);
  platform.extensions.onAppLaunchTriggered.addListener(launched);
  resolve(initial, true);
  return () => {
    disposed = true; generation++;
    platform.games.onGameInfoUpdated.removeListener(changed);
    platform.extensions.onAppLaunchTriggered.removeListener(launched);
  };
}
