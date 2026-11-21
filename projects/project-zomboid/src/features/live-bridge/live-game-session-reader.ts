import { startLiveBridgeFileReader } from "./live-bridge-file-reader";
import {
  clearLiveGameSession,
  parseLiveGameSession,
  publishLiveGameSession,
} from "./live-game-session-store";

const BRIDGE_FILE = "PZInteractiveMap\\game-session.json";

export const startLiveGameSessionReader = () => startLiveBridgeFileReader({
  debugLabel: "PZ Game Session",
  relativePath: BRIDGE_FILE,
  // The Bridge rewrites this file once every five seconds; polling faster
  // than that only bought wasted reads.
  readIntervalMs: 5_000,
  parse: parseLiveGameSession,
  getSequence: ({ updatedAt }) => updatedAt,
  publish: publishLiveGameSession,
  clear: clearLiveGameSession,
  clearOnStart: false,
  clearOnStop: false,
});
