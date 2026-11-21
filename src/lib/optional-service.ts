/** Optional integrations may fail to load without preventing the app from booting. */
export function createOptionalService<T>(load: () => Promise<T>, onError: (error: unknown) => void) {
  let state: "idle" | "loading" | "ready" | "disabled" = "idle";
  let service: T;
  const pending: ((value: T) => void)[] = [];
  return {
    async start(initialize: (value: T) => void) {
      if (state !== "idle") return;
      state = "loading";
      try {
        const loaded = await load();
        initialize(loaded);
        service = loaded;
        state = "ready";
        for (const action of pending.splice(0)) action(service);
      } catch (error) {
        state = "disabled";
        pending.length = 0;
        onError(error);
      }
    },
    call(action: (value: T) => void) {
      if (state === "ready") action(service);
      else if (state !== "disabled" && pending.length < 100) pending.push(action);
    },
    disable() {
      state = "disabled";
      pending.length = 0;
    },
  };
}
