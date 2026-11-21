import { applyGepEvents, applyGepInfo } from "./session-reducer.ts";
import { getGepFields } from "./gep-packet.ts";
import { createWorldMetadataDiscovery } from "./world-metadata-discovery.ts";
import { createGameSession, type DiscoveredWorldMetadata, type GameSession, type TelemetryRules } from "./session-types.ts";

interface ProviderEvent<T> {
  addListener: (listener: (event: T) => void) => void;
  removeListener: (listener: (event: T) => void) => void;
}

export interface GepApi {
  setRequiredFeatures: (features: string[], callback: (result: {
    success: boolean; supportedFeatures?: string[];
  }) => void) => void;
  getInfo: (callback: (result: { success: boolean; res: unknown }) => void) => void;
  onInfoUpdates2: ProviderEvent<unknown>;
  onNewEvents: ProviderEvent<unknown>;
  onError: ProviderEvent<unknown>;
}

export interface GepConnectionOptions {
  api: GepApi;
  id: string;
  gameClassId: number;
  edition: string;
  features: string[];
  requiredFeatures?: string[];
  rules: TelemetryRules;
  publish: (session: GameSession) => void;
  debug?: (message: string, detail?: unknown) => void;
  discoverWorldMetadata?: (gameDirectory: unknown, worldFolder: unknown) => Promise<DiscoveredWorldMetadata | null>;
  now?: () => number;
  schedule?: (callback: () => void, delay: number) => () => void;
}

/** Owns a single provider subscription. Only the background window starts it. */
export const connectGep = (options: GepConnectionOptions): (() => void) => {
  const { api, publish } = options;
  const debug = options.debug ?? (() => {});
  const now = options.now ?? Date.now;
  const schedule = options.schedule ?? ((callback, delay) => {
    const timer = setTimeout(callback, delay);
    return () => clearTimeout(timer);
  });
  let state = createGameSession(options.id, options.gameClassId, options.edition);
  if (options.rules.positionWarmupEditions?.includes(options.edition)) state.positionReady = false;
  let disposed = false;
  let dirtyGame = new Set<string>();
  let dirtyMatch = new Set<string>();
  let request = 0;
  let failures = 0;
  let cancelRetry: (() => void) | null = null;
  let cancelDeadline: (() => void) | null = null;
  let cancelPoll: (() => void) | null = null;
  let worldEnded = false;

  const commit = (next: GameSession) => {
    if (disposed || next === state) return;
    state = next;
    publish(state);
  };
  const cancelPending = () => {
    cancelRetry?.();
    cancelRetry = null;
    cancelDeadline?.();
    cancelDeadline = null;
    cancelPoll?.();
    cancelPoll = null;
  };
  const discovery = createWorldMetadataDiscovery({ read: options.discoverWorldMetadata,
    getSession: () => state, schedule, debug,
    commit: (metadata, localWorldId) => commit({ ...state, worldSeed: metadata.seed, localWorldId,
      worldDisplayName: metadata.name ?? state.worldDisplayName,
      gameVersion: metadata.version ?? state.gameVersion }),
  });
  const scheduleSnapshot = (delay = 2_000) => {
    cancelPoll?.();
    cancelPoll = !disposed && state.registered && !worldEnded ? schedule(readSnapshot, delay) : null;
  };
  const retry = (issue: GameSession["issue"]) => {
    if (disposed) return;
    request += 1;
    cancelPending();
    commit({ ...state, issue, registered: false });
    const delay = Math.min(30_000, 1_000 * 2 ** Math.min(failures++, 5));
    debug("registration retry scheduled", { issue, delay });
    cancelRetry = schedule(register, delay);
  };
  const readSnapshot = () => {
    cancelPoll?.(); cancelPoll = null;
    cancelDeadline?.();
    const token = ++request;
    const atGeneration = state.generation;
    dirtyGame = new Set();
    dirtyMatch = new Set();
    cancelDeadline = schedule(() => retry("provider-error"), 10_000);
    try {
      api.getInfo(result => {
        if (disposed || token !== request) return;
        cancelDeadline?.();
        cancelDeadline = null;
        debug("initial snapshot result", summarizeGepResult(result));
        if (!result.success) { retry("provider-error"); return; }
        // Merge only fields not superseded by updates during this request.
        if (state.generation !== atGeneration) { scheduleSnapshot(); return; }
        const fields = getGepFields(result.res);
        if (!fields) { retry("provider-error"); return; }
        const game = Object.fromEntries(Object.entries(fields.game).filter(([key]) => !dirtyGame.has(key)));
        const match = Object.fromEntries(Object.entries(fields.match).filter(([key]) => !dirtyMatch.has(key)));
        if (worldEnded || dirtyMatch.has("dimension") || dirtyGame.has("world_id")
          || dirtyMatch.has("server") || dirtyMatch.has("realms_info")) delete match.location;
        commit(applyGepInfo(state, { game_info: game, match_info: match }, now(), options.rules));
        discovery.consider(game);
        scheduleSnapshot();
      });
    } catch {
      retry("provider-error");
    }
  };
  function register() {
    if (disposed) return;
    cancelPending();
    const token = ++request;
    cancelDeadline = schedule(() => retry("provider-error"), 10_000);
    debug("registering features", { requested: options.features, required: options.requiredFeatures ?? options.features });
    try {
      api.setRequiredFeatures([...options.features], result => {
        if (disposed || token !== request) return;
        cancelDeadline?.();
        cancelDeadline = null;
        debug("feature registration result", result);
        if (!result.success) { retry("provider-error"); return; }
        const requiredFeatures = options.requiredFeatures ?? options.features;
        if (result.supportedFeatures
          && !requiredFeatures.every(feature => result.supportedFeatures!.includes(feature))) {
          retry("missing-features");
          return;
        }
        failures = 0;
        commit({ ...state, registered: true, issue: null });
        readSnapshot();
      });
    } catch {
      retry("provider-error");
    }
  }
  const onInfo = (packet: unknown) => {
    debug("info update", summarizeGepPacket(packet));
    const fields = getGepFields(packet);
    if (fields) {
      Object.keys(fields.game).forEach(key => dirtyGame.add(key));
      Object.keys(fields.match).forEach(key => dirtyMatch.add(key));
    }
    const generation = state.generation;
    // Late updates after match_end cannot resurrect the previous world's location.
    if (worldEnded) return;
    commit(applyGepInfo(state, packet, now(), options.rules));
    if (state.generation !== generation) discovery.reset();
    if (fields) discovery.consider(fields.game);
  };
  const onEvents = (packet: unknown) => {
    debug("game event", summarizeGepPacket(packet));
    const generation = state.generation;
    commit(applyGepEvents(state, packet));
    if (state.generation !== generation) {
      worldEnded = !state.inWorld;
      request++;
      cancelDeadline?.(); cancelDeadline = null;
      discovery.reset();
      scheduleSnapshot(0);
      if (!state.registered && !cancelRetry) register();
    }
  };
  const onError = (error: unknown) => {
    debug("provider error", error);
    retry("provider-error");
  };

  api.onInfoUpdates2.addListener(onInfo);
  api.onNewEvents.addListener(onEvents);
  api.onError.addListener(onError);
  publish(state);
  register();
  return () => {
    if (disposed) return;
    disposed = true;
    request += 1;
    discovery.dispose();
    cancelPending();
    api.onInfoUpdates2.removeListener(onInfo);
    api.onNewEvents.removeListener(onEvents);
    api.onError.removeListener(onError);
    publish({ ...state, connected: false, position: null, inWorld: false });
  };
};

const hiddenValue = (key: string, value: unknown): unknown => {
  if (key === "game_dir" || key === "chat" || /^player_\d+$/i.test(key)) return "[redacted]";
  if (key.endsWith("_stats")) return "[omitted: statistics payload]";
  return value;
};

const sanitizeRecord = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sanitizeRecord);
  const record = value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
  if (!record) return value;
  const packetKey = typeof record.key === "string" ? record.key : null;
  const hidesPacketData = packetKey === "game_dir" || packetKey === "chat"
    || packetKey !== null && /^player_\d+$/i.test(packetKey)
    || packetKey !== null && packetKey.endsWith("_stats")
    || record.name === "chat";
  return Object.fromEntries(Object.entries(record).map(([key, entry]) => [
    key,
    hidesPacketData && (key === "data" || key === "value")
      ? "[redacted]"
      : hiddenValue(key, sanitizeRecord(entry)),
  ]));
};

/** Keep diagnostics useful without writing chat, player lists, paths or large statistics to logs. */
export const summarizeGepPacket = (packet: unknown): unknown => sanitizeRecord(packet);

const summarizeGepResult = (result: { success: boolean; res: unknown }) => ({
  success: result.success,
  res: summarizeGepPacket(result.res),
});
