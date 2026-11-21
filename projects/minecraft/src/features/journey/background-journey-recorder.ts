import { GAME_JOURNEY, GAME_OBSERVED_PORTAL_APPEARANCE, GAME_PORTAL_PROJECTIONS,
  GAME_TELEMETRY, WORLD_LIBRARY_CONFIG } from "../../game-config.ts";
import { createRuntimeId } from "../../lib/runtime-id.ts";
import type { GameSession, SessionPosition } from "../game-session/session-types.ts";
import { createWorldRepository, type WorldRepository } from "../worlds/world-repository.ts";
import { resolveBoundSession } from "../worlds/world-session-binding.ts";
import { worldSessionKey } from "../worlds/world-map-player.ts";
import { captureJourneySample, finalizeJourney, interruptJourney, type JourneyData } from "./journey-state.ts";
import { createJourneyStorage, getBrowserJourneyStorage, JOURNEY_CAPTURE_RULES } from "./journey-storage.ts";
import { isDeathSceneKey } from "../worlds/world-death-pin.ts";
import { mergeObservedPortals, observedJourneyPortals, type ObservedJourneyPortal } from "./journey-observed-portals.ts";
import { anchorJourneyCrossing, correctedJourneyRoute } from "./journey-route-cleanup.ts";

type JourneyStorage = ReturnType<typeof createJourneyStorage>;

export const createBackgroundJourneyRecorder = ({ repository, storage, now = Date.now,
  newId = createRuntimeId, intervalMs = GAME_JOURNEY.sampleIntervalMs }: {
  repository: Pick<WorldRepository, "snapshot"> & Partial<Pick<WorldRepository, "updateBoundPersonal">>;
  storage: JourneyStorage; now?: () => number;
  newId?: () => string; intervalMs?: number;
}) => {
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 100 || intervalMs > 60_000)
    throw new Error("Invalid journey recorder interval");
  let latest: GameSession | null = null, currentWorldId: string | null = null, disposed = false;
  const queued: { session: GameSession; forceSample: boolean;
    portalSource?: { dimension: string; position: SessionPosition } }[] = [];
  let recentPositions: { dimension: string; position: SessionPosition }[] = [];
  let pendingCrossing: { from: string; to: string;
    candidates: { dimension: string; position: SessionPosition }[] } | null = null;
  let finishPending = false, processing = false;
  const idleWaiters = new Set<() => void>();
  const persist = (data: JourneyData, next: JourneyData) => {
    if (next !== data) storage.writeData(next);
  };
  const finalizeWorld = (worldId: string, at: number) => {
    const read = storage.read(worldId);
    if (read.error) throw new Error("Journey state could not be read");
    persist(read.data, finalizeJourney(read.data, at));
  };
  const process = async (session: GameSession, forceSample: boolean,
    portalSource?: { dimension: string; position: SessionPosition }) => {
    const at = now(), library = await repository.snapshot(), binding = library.binding;
    const world = binding ? library.worlds.find(item => item.id === binding.worldId) ?? null : null;
    if (currentWorldId && currentWorldId !== world?.id) finalizeWorld(currentWorldId, at);
    currentWorldId = world?.id ?? null;
    if (!world || !binding) return;
    const read = storage.read(world.id);
    if (read.error) throw new Error("Journey state could not be read");
    let data = read.data;
    if (!read.preferences.enabled) {
      persist(data, finalizeJourney(data, at)); return;
    }
    if (isDeathSceneKey(session.sceneKey)) {
      persist(data, finalizeJourney(data, at, "death", GAME_JOURNEY.maxJourneys));
      return;
    }
    const bound = resolveBoundSession(world, session, binding, at, GAME_TELEMETRY.staleAfterMs);
    if (bound.status === "live" && bound.session.position && bound.session.dimension) {
      const point = bound.session.position;
      let next = captureJourneySample(data, read.preferences, { worldId: world.id, sessionKey: worldSessionKey(binding),
        dimension: bound.session.dimension, x: point.x, y: point.y, z: point.z, at: point.receivedAt,
        ...(bound.session.biome ? { biome: bound.session.biome } : {}), ...(forceSample ? { force: true } : {}) },
      JOURNEY_CAPTURE_RULES, newId);
      if (next.active && next.active.segments.length > (data.active?.segments.length ?? 0)) {
        const anchored = portalSource ? anchorJourneyCrossing(next.active, portalSource.dimension,
          bound.session.dimension, { x: portalSource.position.x, y: portalSource.position.y,
            z: portalSource.position.z, at: portalSource.position.receivedAt },
          { x: point.x, y: point.y, z: point.z, at: point.receivedAt }) : next.active;
        const corrected = correctedJourneyRoute(anchored, GAME_OBSERVED_PORTAL_APPEARANCE.maxTransitionGapMs);
        if (corrected !== next.active) next = { ...next, active: corrected };
      }
      persist(data, next);
      if (repository.updateBoundPersonal) {
        const rules = GAME_PORTAL_PROJECTIONS.filter(rule => rule.edition === world.edition
          && rule.versions.some(version => version === world.generation.version));
        const projection = portalSource && rules.find(rule => rule.sourceDimension === portalSource.dimension
          && rule.targetDimension === bound.session.dimension);
        const gap = portalSource ? point.receivedAt - portalSource.position.receivedAt : 0;
        let incoming: ObservedJourneyPortal[] = [];
        if (portalSource && projection && gap > 0 && gap <= GAME_OBSERVED_PORTAL_APPEARANCE.maxTransitionGapMs) {
          incoming = [{ id: `observed-portal-${createRuntimeId()}`, transition: { index: 0,
            from: { dimension: portalSource.dimension, point: { x: portalSource.position.x, y: portalSource.position.y,
              z: portalSource.position.z, at: portalSource.position.receivedAt } },
            to: { dimension: bound.session.dimension, point: { x: point.x, y: point.y, z: point.z, at: point.receivedAt } },
          } }];
        } else if (world.personal.portals === undefined) {
          incoming = observedJourneyPortals([...(next.active ? [next.active] : []), ...next.journeys], rules,
            GAME_OBSERVED_PORTAL_APPEARANCE.maxTransitionGapMs,
            GAME_OBSERVED_PORTAL_APPEARANCE.maxTargetOffset, GAME_OBSERVED_PORTAL_APPEARANCE.mergeDistance);
        }
        if (incoming.length) await repository.updateBoundPersonal(binding, personal => ({ ...personal,
          portals: mergeObservedPortals(personal.portals ?? [], incoming,
            GAME_OBSERVED_PORTAL_APPEARANCE.mergeDistance, personal.removedPortals ?? []),
        }));
      }
      return;
    }
    const sameSession = binding.sessionId === session.id && binding.sessionGeneration === session.generation;
    data = interruptJourney(data, at, !session.connected || !session.inWorld || !sameSession);
    persist(read.data, data);
  };
  const finishBound = async () => {
    const library = await repository.snapshot();
    const worldId = currentWorldId ?? library.binding?.worldId ?? null;
    if (worldId) finalizeWorld(worldId, now());
    currentWorldId = null;
  };
  const drain = async () => {
    if (processing || disposed) return;
    processing = true;
    try {
      while ((queued.length || finishPending) && !disposed) {
        if (queued.length) {
          const next = queued.shift()!;
          await process(next.session, next.forceSample, next.portalSource);
        } else {
          finishPending = false;
          await finishBound();
        }
      }
    } catch (error) {
      console.error("[Journey] Unable to capture the latest player route", error);
    } finally {
      processing = false;
      if ((queued.length || finishPending) && !disposed) void drain();
      else { for (const resolve of idleWaiters) resolve(); idleWaiters.clear(); }
    }
  };
  const enqueue = (session: GameSession, forceSample = false,
    portalSource?: { dimension: string; position: SessionPosition }) => {
    if (disposed) return;
    const copy = structuredClone(session), previous = queued.at(-1);
    if (previous && !previous.portalSource && !portalSource
      && previous.session.id === copy.id && previous.session.generation === copy.generation
      && previous.session.dimension === copy.dimension && previous.session.inWorld === copy.inWorld
      && previous.session.connected === copy.connected && previous.session.sceneKey === copy.sceneKey) {
      previous.session = copy;
      previous.forceSample ||= forceSample;
    } else {
      if (previous?.session.dimension && copy.dimension && previous.session.dimension !== copy.dimension
        && previous.session.id === copy.id && previous.session.generation === copy.generation)
        previous.forceSample = true;
      queued.push({ session: copy, forceSample, ...(portalSource ? { portalSource } : {}) });
    }
    void drain();
  };
  const timer = setInterval(() => { if (latest) enqueue(latest); }, intervalMs);
  return {
    observe(session: GameSession) {
      const previous = latest;
      latest = structuredClone(session);
      const sameRun = previous?.id === latest.id && previous?.generation === latest.generation;
      if (!sameRun) { recentPositions = []; pendingCrossing = null; }
      if (sameRun && previous?.dimension && latest.dimension && previous.dimension !== latest.dimension) {
        if (previous.position) enqueue(previous, true);
        pendingCrossing = { from: previous.dimension, to: latest.dimension,
          candidates: recentPositions.filter(item => item.dimension === previous.dimension) };
        recentPositions = [];
      }
      let source: { dimension: string; position: SessionPosition } | undefined;
      if (pendingCrossing && latest.dimension === pendingCrossing.to && latest.position) {
        const target = latest.position;
        const candidates = pendingCrossing.candidates.filter(candidate =>
          target.receivedAt - candidate.position.receivedAt <= GAME_OBSERVED_PORTAL_APPEARANCE.maxTransitionGapMs);
        const last = candidates.at(-1);
        const prior = last && [...candidates].reverse().find(candidate => candidate.position.receivedAt < last.position.receivedAt
          && Math.hypot(candidate.position.x - last.position.x, candidate.position.y - last.position.y,
            candidate.position.z - last.position.z) > 8);
        const leakedDestination = last && target.receivedAt - last.position.receivedAt <= 5_000
          && Math.hypot(last.position.x - target.x, last.position.y - target.y, last.position.z - target.z) <= 4;
        source = leakedDestination ? prior : last;
        pendingCrossing = null;
      }
      enqueue(latest, false, source);
      if (latest.dimension && latest.position && (!recentPositions.length
        || recentPositions.at(-1)!.position.sequence !== latest.position.sequence)) {
        recentPositions.push({ dimension: latest.dimension, position: latest.position });
        recentPositions = recentPositions.slice(-12);
      }
    },
    finish() { if (!disposed) { finishPending = true; void drain(); } },
    idle() { return !queued.length && !finishPending && !processing ? Promise.resolve() : new Promise<void>(resolve => idleWaiters.add(resolve)); },
    dispose() { disposed = true; clearInterval(timer); for (const resolve of idleWaiters) resolve(); idleWaiters.clear(); },
  };
};

export const startBackgroundJourneyRecorder = () => {
  const repository = createWorldRepository({ name: WORLD_LIBRARY_CONFIG.databaseName, factory: indexedDB });
  const recorder = createBackgroundJourneyRecorder({ repository, storage: getBrowserJourneyStorage() });
  return { observe: recorder.observe, finish: recorder.finish,
    idle: recorder.idle, dispose: () => { recorder.dispose(); repository.close(); } };
};
