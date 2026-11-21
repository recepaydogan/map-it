import type { WorldLibrarySnapshot } from "./world-types.ts";

export interface WorldLibraryState {
  ready: boolean;
  data: WorldLibrarySnapshot | null;
  error: Error | null;
}

/** Cached snapshots are required by useSyncExternalStore. Newer reads always win. */
export const createWorldLibraryController = (read: () => Promise<WorldLibrarySnapshot>) => {
  let state: WorldLibraryState = { ready: false, data: null, error: null };
  let request = 0;
  const listeners = new Set<() => void>();
  const publish = (next: WorldLibraryState) => {
    state = next;
    for (const listener of listeners) listener();
  };
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    async refresh() {
      const token = ++request;
      try {
        const data = await read();
        if (token === request) publish({ ready: true, data, error: null });
      } catch (error) {
        if (token !== request) return;
        const failure = error instanceof Error ? error : new Error(String(error));
        console.error("[World library] Read failed", failure);
        publish({ ...state, ready: true, error: failure });
      }
    },
  };
};
