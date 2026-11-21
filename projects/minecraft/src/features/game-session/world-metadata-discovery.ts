import type { InfoFields } from "./gep-packet.ts";
import type { DiscoveredWorldMetadata, GameSession } from "./session-types.ts";

/** Hash the save root rather than synchronizing a user's filesystem path. */
export const localWorldSourceId = async (directory: unknown, folder: string): Promise<string> => {
  const root = typeof directory === "string" ? directory.trim().replace(/^"|"$/g, "")
    .replaceAll("/", "\\").replace(/\\+$/, "").toLowerCase() : "";
  const bytes = new TextEncoder().encode(JSON.stringify([root, folder.toLowerCase()]));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
};

export const createWorldMetadataDiscovery = (options: {
  read?: (directory: unknown, folder: unknown) => Promise<DiscoveredWorldMetadata | null>;
  getSession: () => GameSession;
  commit: (metadata: DiscoveredWorldMetadata, sourceId: string) => void;
  schedule: (callback: () => void, delay: number) => () => void;
  debug: (message: string, detail?: unknown) => void;
}) => {
  let game: InfoFields = {}, key: string | null = null, request = 0, failures = 0;
  let cancelRetry: (() => void) | null = null, disposed = false;
  const consider = (fields: InfoFields) => {
    game = { ...game, ...fields };
    const session = options.getSession();
    const folder = session.identity.worldName;
    if (disposed || !options.read || !session.connected || !session.inWorld || !folder
      || session.identity.server || session.identity.realmId) return;
    const nextKey = JSON.stringify([session.id, session.generation, game.game_dir, folder]);
    if (key === nextKey) return;
    cancelRetry?.(); cancelRetry = null;
    key = nextKey;
    const token = ++request;
    const stillCurrent = () => !disposed && token === request
      && options.getSession().id === session.id && options.getSession().generation === session.generation
      && options.getSession().identity.worldName === folder && options.getSession().inWorld
      && !options.getSession().identity.server && !options.getSession().identity.realmId;
    const retry = () => {
      if (!stillCurrent()) return;
      const delay = Math.min(30_000, 1_000 * 2 ** Math.min(failures++, 5));
      cancelRetry = options.schedule(() => {
        cancelRetry = null; key = null; consider({});
      }, delay);
    };
    const directory = game.game_dir;
    void Promise.resolve().then(() => stillCurrent() ? options.read!(directory, folder) : null).then(async metadata => {
      if (!stillCurrent()) return;
      if (!metadata) { retry(); return; }
      const sourceId = await localWorldSourceId(directory, folder);
      if (!stillCurrent()) return;
      failures = 0;
      options.commit(metadata, sourceId);
    }).catch(error => {
      if (!stillCurrent()) return;
      options.debug("local world metadata read failed", error instanceof Error ? error.message : String(error));
      retry();
    });
  };
  const reset = () => {
    request++; key = null; failures = 0;
    game = { game_dir: game.game_dir };
    cancelRetry?.(); cancelRetry = null;
  };
  return { consider, reset, dispose() { disposed = true; reset(); } };
};
