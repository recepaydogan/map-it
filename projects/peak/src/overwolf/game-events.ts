import { APP_CONFIG } from "../config/app-config";
import {
  resetPeakSession,
  type PeakGameMode,
  type PeakScene,
  updatePeakSession,
} from "../state/peak-session-store";

const FEATURE_RETRY_DELAY_MS = 2_000;
const MAX_FEATURE_ATTEMPTS = 8;
const FEATURE_HEALTH_INTERVAL_MS = 15 * 60_000;
const FEATURE_HEALTH_URL = "https://game-events-status.overwolf.com/26092_prod.json";
const VALID_SCENES = new Set<PeakScene>(["main_menu", "airport", "ingame"]);
const VALID_GAME_MODES = new Set<PeakGameMode>(["offline", "host"]);

export interface PeakGameEventsController {
  refresh: () => void;
  stop: () => void;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const findValue = (source: unknown, key: string): unknown => {
  if (!isRecord(source)) return undefined;
  if (key in source) return source[key];
  for (const value of Object.values(source)) {
    const found = findValue(value, key);
    if (found !== undefined) return found;
  }
  return undefined;
};

const parsePartySize = (value: unknown): number | null => {
  if (Array.isArray(value)) return value.length;
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.length : null;
  } catch {
    return null;
  }
};

const applyGameInfo = (source: unknown): void => {
  const sceneValue = findValue(source, "scene");
  const gameModeValue = findValue(source, "game_mode");
  const partyValue = findValue(source, "party_players");
  const scene = typeof sceneValue === "string" && VALID_SCENES.has(sceneValue as PeakScene)
    ? (sceneValue as PeakScene)
    : undefined;
  const gameMode =
    typeof gameModeValue === "string" && VALID_GAME_MODES.has(gameModeValue as PeakGameMode)
      ? (gameModeValue as PeakGameMode)
      : undefined;
  const partySize = parsePartySize(partyValue);

  updatePeakSession({
    ...(scene ? { scene } : {}),
    ...(gameMode ? { gameMode } : {}),
    ...(partySize !== null ? { partySize } : {}),
  });
};

const applyGameEvent = (event: overwolf.games.events.GameEvent): void => {
  const now = Date.now();
  switch (event.name) {
    case "match_start":
      updatePeakSession({
        matchActive: true,
        matchStartedAt: now,
        climbStartedAt: null,
        deaths: 0,
        teammateDeaths: 0,
        checkpoints: 0,
        lastEventAt: now,
      });
      break;
    case "match_end":
      updatePeakSession({
        matchActive: false,
        matchStartedAt: null,
        climbStartedAt: null,
        lastEventAt: now,
      });
      break;
    case "death":
      updatePeakSession((current) => ({ deaths: current.deaths + 1, lastEventAt: now }));
      break;
    case "teammate_death":
      updatePeakSession((current) => ({
        teammateDeaths: current.teammateDeaths + 1,
        lastEventAt: now,
      }));
      break;
    case "checkpoint":
      updatePeakSession((current) => ({
        checkpoints: current.checkpoints + 1,
        lastEventAt: now,
      }));
      break;
    default:
      break;
  }
};

export const startPeakGameEvents = (): PeakGameEventsController => {
  if (typeof overwolf === "undefined") {
    resetPeakSession();
    return { refresh: () => undefined, stop: () => undefined };
  }

  let stopped = false;
  let attempts = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let healthTimer: ReturnType<typeof setInterval> | null = null;

  resetPeakSession();
  updatePeakSession({ integrationStatus: "registering" });

  const getCurrentInfo = (): void => {
    if (stopped) return;
    overwolf.games.events.getInfo((result) => {
      if (!stopped && result.success) applyGameInfo(result.res);
    });
  };

  const checkFeatureHealth = async (): Promise<void> => {
    try {
      const response = await fetch(FEATURE_HEALTH_URL);
      if (!response.ok || stopped) return;
      const health = (await response.json()) as {
        state?: number;
        disabled?: boolean;
        features?: Array<{ name?: string; state?: number; published?: boolean }>;
      };
      const requiredHealth = ["game_info", "match_info"].every((requiredName) =>
        health.features?.some(
          (feature) =>
            feature.name === requiredName && feature.state === 1 && feature.published !== false,
        ),
      );
      if (health.state !== 1 || health.disabled || !requiredHealth) {
        updatePeakSession({
          integrationStatus: "degraded",
          error: "gep_feature_health_degraded",
        });
      }
    } catch {
      // Registration and runtime events remain authoritative when health lookup is unavailable.
    }
  };

  const registerFeatures = (): void => {
    if (stopped) return;
    attempts += 1;
    overwolf.games.events.setRequiredFeatures(
      [...APP_CONFIG.gameEventFeatures],
      (result) => {
        if (stopped) return;
        if (result.success) {
          const supportedFeatures = result.supportedFeatures ?? [...APP_CONFIG.gameEventFeatures];
          const requiredLiveFeatures = ["game_info", "match_info"];
          const hasAllLiveFeatures = requiredLiveFeatures.every((feature) =>
            supportedFeatures.includes(feature),
          );
          updatePeakSession({
            integrationStatus: hasAllLiveFeatures ? "ready" : "degraded",
            supportedFeatures,
            error: hasAllLiveFeatures ? null : "required_features_missing",
          });
          getCurrentInfo();
          return;
        }

        if (attempts < MAX_FEATURE_ATTEMPTS) {
          retryTimer = setTimeout(registerFeatures, FEATURE_RETRY_DELAY_MS);
          return;
        }
        updatePeakSession({
          integrationStatus: "degraded",
          error: "feature_registration_failed",
        });
      },
    );
  };

  const onInfoUpdate = (event: overwolf.games.events.InfoUpdates2Event) => {
    if (event.feature === "game_info") applyGameInfo(event.info);
    // The official PEAK schema publishes no usable location keys. The feature
    // remains requested for forward compatibility, but opaque payloads are not
    // persisted or interpreted as coordinates.
  };
  const onNewEvents = (event: overwolf.games.events.NewGameEvents) => {
    event.events.forEach(applyGameEvent);
  };
  const onError = () => {
    updatePeakSession({ integrationStatus: "degraded", error: "gep_runtime_error" });
    attempts = 0;
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = setTimeout(registerFeatures, FEATURE_RETRY_DELAY_MS);
  };

  overwolf.games.events.onInfoUpdates2.addListener(onInfoUpdate);
  overwolf.games.events.onNewEvents.addListener(onNewEvents);
  overwolf.games.events.onError.addListener(onError);
  registerFeatures();
  void checkFeatureHealth();
  healthTimer = setInterval(() => void checkFeatureHealth(), FEATURE_HEALTH_INTERVAL_MS);

  return {
    refresh: () => {
      attempts = 0;
      if (retryTimer) clearTimeout(retryTimer);
      registerFeatures();
      getCurrentInfo();
    },
    stop: () => {
      stopped = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (healthTimer) clearInterval(healthTimer);
      overwolf.games.events.onInfoUpdates2.removeListener(onInfoUpdate);
      overwolf.games.events.onNewEvents.removeListener(onNewEvents);
      overwolf.games.events.onError.removeListener(onError);
    },
  };
};
