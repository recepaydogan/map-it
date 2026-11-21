import { GEP_FEATURES, isTargetGame } from "../../game-config";
import { createGepDataSource } from "./gep-data-source";

/** Raw API capture and per-feature diagnostics, before any app parsing/filtering. */
export function startGepEventMonitor(): () => void {
  const api = overwolf.games?.events;
  if (!api?.setRequiredFeatures) { console.error("[GEP] API unavailable"); return () => {}; }
  const startedAt = new Date().toISOString();
  const records: { at: string; kind: string; data: unknown }[] = [];
  const counts: Record<string, number> = {};
  const file = `${overwolf.io.paths.localAppData}\\WoWForeverMap\\gep-live.json`;
  let stopped = false, active = false, generation = 0, processKey = "";
  let registered = false, snapshotPending = false;
  type FeatureState = { infoUpdates: number; events: number; lastReceivedAt: string | null;
    snapshotKeys: string[]; lastSnapshotAt: string | null; latest: unknown };
  const features: Record<string, FeatureState> = {};
  const featureState = (name: string) => features[name] ??= {
    infoUpdates: 0, events: 0, lastReceivedAt: null, snapshotKeys: [], lastSnapshotAt: null, latest: null,
  };
  for (const name of GEP_FEATURES) featureState(name);
  let retry: number | undefined, flushTimer: number | undefined;
  let writing = false, dirty = false;
  const flush = () => {
    flushTimer = undefined;
    if (writing || !dirty) return;
    dirty = false; writing = true;
    try {
      overwolf.io.writeFileContents(file, JSON.stringify({ startedAt, updatedAt: new Date().toISOString(),
        active, registered, processKey, requestedFeatures: GEP_FEATURES, features, counts, records }), "UTF8" as overwolf.io.enums.eEncoding, false, result => {
        writing = false;
        if (!result.success) console.warn("[GEP] Capture write failed", result);
        if (dirty && !stopped && flushTimer === undefined) flushTimer = window.setTimeout(flush, 2000);
      });
    } catch (error) { writing = false; console.warn("[GEP] Capture write failed", error); }
  };
  const record = (kind: string, data: unknown) => {
    if (stopped) return;
    // Keep the newest raw payloads locally; never send player data to analytics.
    const raw = JSON.stringify(data);
    const bounded = raw && raw.length > 16384 ? { truncated: true, raw: raw.slice(0, 16384) } : data;
    counts[kind] = (counts[kind] ?? 0) + 1;
    records.push({ at: new Date().toISOString(), kind, data: bounded });
    if (records.length > 300) records.shift();
    console.info(`[GEP] ${kind}`, JSON.stringify(bounded));
    dirty = true;
    if (flushTimer === undefined) flushTimer = window.setTimeout(flush, 2000);
  };
  const consume = (action: string, callback: () => void) => {
    try { callback(); } catch (error) {
      record("consumer-error", { action, message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined });
    }
  };
  const source = createGepDataSource((kind, data) => record(kind, data));
  consume("initial-state", () => source.game(false));
  const summary = (reason: string) => {
    for (const name of GEP_FEATURES) {
      const state = featureState(name);
      record(`feature:${name}`, { reason, status: !active ? "no-game" : !registered ? "awaiting-registration"
        : state.lastReceivedAt || state.snapshotKeys.length ? "data-received" : "subscribed-waiting-for-data", ...state });
    }
  };
  const snapshot = (token: number, reason = "registration") => {
    if (snapshotPending) return;
    snapshotPending = true;
    record("snapshot-request", { reason });
    api.getInfo(result => { if (!stopped && active && token === generation) {
      snapshotPending = false;
      record("snapshot", { reason, result });
      const info = result.res;
      if (result.success && info && typeof info === "object") {
        for (const name of GEP_FEATURES) {
          const state = featureState(name);
          const value = (info as Record<string, unknown>)[name];
          state.snapshotKeys = value && typeof value === "object" ? Object.keys(value) : [];
          state.lastSnapshotAt = new Date().toISOString();
          if (value !== undefined && !state.lastReceivedAt) state.latest = value;
        }
        if (reason === "registration") consume("snapshot", () => source.info(info));
      }
      summary(reason);
    } });
  };
  const register = (token: number, attempt = 1) => {
    if (stopped || !active || token !== generation) return;
    record("register-request", { attempt, features: GEP_FEATURES });
    api.setRequiredFeatures([...GEP_FEATURES], result => {
      if (stopped || !active || token !== generation) return;
      record("registration", result);
      registered = result.success;
      consume("registration", () => source.registration(result.success));
      summary("registration-result");
      if (result.success) { snapshot(token); return; }
      const reason = String((result as { reason?: string }).reason ?? result.error ?? "");
      if (attempt < 5 && !/Not in a game|not supported by any|manifest/i.test(reason)) {
        retry = window.setTimeout(() => register(token, attempt + 1), 3000);
      }
    });
  };
  const observe = (info: { isRunning?: boolean; classId?: number; processId?: number; title?: string } | null | undefined) => {
    if (stopped) return;
    const nextActive = Boolean(info?.isRunning && isTargetGame(info));
    const nextKey = nextActive ? `${info?.classId}:${info?.processId}` : "";
    if (active === nextActive && processKey === nextKey) return;
    active = nextActive; processKey = nextKey; generation++;
    registered = false; snapshotPending = false;
    for (const name of Object.keys(features)) delete features[name];
    for (const name of GEP_FEATURES) featureState(name);
    consume("game", () => source.game(active));
    window.clearTimeout(retry);
    record("game", { active, classId: info?.classId, processId: info?.processId, title: info?.title });
    summary("game-transition");
    if (active) register(generation);
  };
  const onGame = (event: overwolf.games.GameInfoUpdatedEvent) => {
    if (event.runningChanged || event.gameChanged) observe(event.gameInfo);
  };
  const onInfo = (event: overwolf.games.events.InfoUpdates2Event) => {
    record("raw:onInfoUpdates2", { active, event });
    if (!active) { record("ignored", { channel: "onInfoUpdates2", reason: "target-game-not-active" }); return; }
    const name = event.feature || "unknown";
    const state = featureState(name);
    state.infoUpdates++; state.lastReceivedAt = new Date().toISOString(); state.latest = event.info;
    record(`info:${name}`, event);
    consume("onInfoUpdates2", () => source.info(event.info));
  };
  const onEvents = (event: overwolf.games.events.NewGameEvents) => {
    record("raw:onNewEvents", { active, event });
    if (!active) { record("ignored", { channel: "onNewEvents", reason: "target-game-not-active" }); return; }
    for (const entry of event.events ?? []) {
      const name = entry.name === "location" ? "location" : `event:${entry.name}`;
      const state = featureState(name);
      state.events++; state.lastReceivedAt = new Date().toISOString(); state.latest = entry;
      record(`event:${entry.name}`, entry);
    }
    consume("onNewEvents", () => source.events(event.events));
  };
  const onError = (event: overwolf.games.events.ErrorEvent) => {
    record("raw:onError", { active, event });
    if (active) consume("onError", () => source.error());
  };
  // Attach listeners before registration so the provider's first state is captured.
  api.onInfoUpdates2.addListener(onInfo);
  api.onNewEvents.addListener(onEvents);
  api.onError.addListener(onError);
  overwolf.games.onGameInfoUpdated.addListener(onGame);
  record("monitor-started", { diagnosticVersion: 2, file, features: GEP_FEATURES,
    listeners: ["onInfoUpdates2", "onNewEvents", "onError"], snapshotIntervalMs: 10000 });
  summary("listeners-attached");
  const diagnosticTimer = window.setInterval(() => {
    if (stopped) return;
    if (active && registered && !snapshotPending) snapshot(generation, "diagnostic-poll");
    else summary(snapshotPending ? "snapshot-pending" : "heartbeat");
  }, 10000);
  overwolf.games.getRunningGameInfo(observe);
  return () => {
    active = false; generation++;
    consume("stop", () => source.game(false));
    window.clearInterval(diagnosticTimer);
    window.clearTimeout(retry); window.clearTimeout(flushTimer);
    record("monitor-stopped", {});
    flush(); stopped = true;
    api.onInfoUpdates2.removeListener(onInfo);
    api.onNewEvents.removeListener(onEvents);
    api.onError.removeListener(onError);
    overwolf.games.onGameInfoUpdated.removeListener(onGame);
  };
}
