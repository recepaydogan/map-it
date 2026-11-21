import { GAME_EDITIONS, GAME_TELEMETRY } from "../../game-config";
import { createRuntimeId } from "../../lib/runtime-id";
import { discoverBedrockWorldMetadata } from "./bedrock-world-metadata";
import { connectGep } from "./gep-connection";
import { discoverJavaWorldMetadata } from "./java-world-seed";
import { publishGameSession } from "./session-storage";
import type { GameSession } from "./session-types";

const logGepDebug = (message: string, detail?: unknown) => {
  let suffix = "";
  if (detail !== undefined) {
    try { suffix = ` ${JSON.stringify(detail)}`; }
    catch { suffix = " [unserializable detail]"; }
  }
  console.info(`[GEP Debug] ${message}${suffix}`);
};

/** The runtime boundary; pure provider/reducer modules remain independently testable. */
export const startGameSession = (gameClassId: number, observe?: (session: GameSession) => void): (() => void) => {
  const edition = GAME_EDITIONS.find(entry => entry.gameClassId === gameClassId);
  if (!edition || typeof overwolf === "undefined" || !overwolf.games?.events) {
    logGepDebug("Session could not start", {
      gameClassId,
      knownEdition: Boolean(edition),
      overwolfAvailable: typeof overwolf !== "undefined",
      eventsApiAvailable: typeof overwolf !== "undefined" && Boolean(overwolf.games?.events),
    });
    return () => {};
  }
  logGepDebug("Starting Java/Bedrock session", { gameClassId, edition: edition.id });
  return connectGep({
    api: overwolf.games.events,
    id: createRuntimeId(),
    gameClassId,
    edition: edition.id,
    features: GAME_TELEMETRY.features,
    requiredFeatures: GAME_TELEMETRY.requiredFeatures,
    rules: GAME_TELEMETRY,
    debug: logGepDebug,
    discoverWorldMetadata: edition.id === "java" ? discoverJavaWorldMetadata : discoverBedrockWorldMetadata,
    publish: session => { publishGameSession(session); observe?.(session); },
  });
};
