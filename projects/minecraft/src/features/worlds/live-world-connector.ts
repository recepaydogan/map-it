import type { GameSession } from "../game-session/session-types.ts";
import { autoConnectLiveWorld } from "./auto-connect-live-world.ts";
import { WorldBindingChangedError, type WorldRepository } from "./world-repository.ts";
import { saveWorldResumePosition } from "./world-resume-state.ts";

const connectionKey = (session: GameSession) => JSON.stringify([session.id, session.generation,
  session.identity, session.worldSeed, session.localWorldId, session.inWorld, session.registered, session.issue, session.dimension, session.positionReady]);

/** Coalesce telemetry, retry failed transactions, and invalidate obsolete async work. */
export const createLiveWorldConnector = (options: {
  repository: WorldRepository;
  now?: () => number;
  schedule?: (callback: () => void, delay: number) => () => void;
  onError?: (error: unknown) => void;
}) => {
  const now = options.now ?? Date.now;
  const schedule = options.schedule ?? ((callback, delay) => { const id = setTimeout(callback, delay); return () => clearTimeout(id); });
  let latest: GameSession | null = null, running = false, disposed = false;
  let cancel: (() => void) | null = null;
  const connectedSessions = new Set<string>();
  const queue = (delay: number) => {
    if (disposed || cancel || running) return;
    cancel = schedule(() => { cancel = null; void run(); }, delay);
  };
  const run = async () => {
    if (disposed || running || !latest) return;
    running = true;
    const session = latest, key = connectionKey(session);
    const sessionWorldKey = JSON.stringify([session.id, session.generation, session.identity]);
    const current = () => !disposed && latest !== null && connectionKey(latest) === key;
    try {
      const world = await autoConnectLiveWorld(options.repository, session, now(), current, !connectedSessions.has(sessionWorldKey));
      if (world && current()) {
        connectedSessions.add(sessionWorldKey);
        await saveWorldResumePosition(options.repository, latest!, now(), current);
      }
    } catch (error) {
      if (!(error instanceof WorldBindingChangedError)) {
        (options.onError ?? (failure => console.error("[World session] Connection failed; retrying", failure)))(error);
      }
    } finally {
      running = false;
      if (latest?.connected && latest.inWorld) queue(current() ? 1_000 : 0);
    }
  };
  return {
    observe(session: GameSession) {
      const changed = !latest || connectionKey(latest) !== connectionKey(session);
      latest = structuredClone(session);
      if (changed) { cancel?.(); cancel = null; }
      queue(changed ? 0 : 1_000);
    },
    dispose() { disposed = true; latest = null; cancel?.(); cancel = null; },
  };
};
