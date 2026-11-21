type GameInfo = { isRunning?: boolean; classId?: number } | null | undefined;
type GameEvent = { gameInfo?: GameInfo };
type Games = {
  getRunningGameInfo(callback: (info: GameInfo) => void): void;
  onGameInfoUpdated: {
    addListener(listener: (event: GameEvent) => void): void;
    removeListener(listener: (event: GameEvent) => void): void;
  };
};

/** Resolve the first visible screen before mounting a saved game's UI. The
 * background launch router continues to own later game launches and windows. */
export function resolveStartupSelection({ games, apps, current, select, ready, timeoutMs = 2500 }: {
  games: Games;
  apps: readonly { id: string; gameIds: readonly number[] }[];
  current: () => string | null;
  select: (id: string) => void;
  ready: () => void;
  timeoutMs?: number;
}): () => void {
  const previous = current();
  let settled = false;
  const match = (info: GameInfo) => info?.isRunning ? apps.find(app => app.gameIds.includes(Number(info.classId))) : undefined;
  const cleanup = () => {
    clearTimeout(timer);
    games.onGameInfoUpdated.removeListener(changed);
  };
  const finish = (info?: GameInfo) => {
    if (settled) return;
    settled = true;
    cleanup();
    const running = match(info);
    // A newer selection from the background or another window wins over this
    // asynchronous probe. No running game ever clears a saved choice.
    if (running && current() === previous) select(running.id);
    ready();
  };
  const changed = ({ gameInfo }: GameEvent) => { if (match(gameInfo)) finish(gameInfo); };
  const timer = setTimeout(() => finish(), timeoutMs);
  games.onGameInfoUpdated.addListener(changed);
  try { games.getRunningGameInfo(finish); }
  catch { finish(); }
  return () => { settled = true; cleanup(); };
}
