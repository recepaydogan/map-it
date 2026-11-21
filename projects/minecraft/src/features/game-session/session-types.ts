/** Canonical world-space coordinates; the renderer chooses its own projection. */
export interface SessionPosition {
  x: number;
  y: number;
  z: number;
  receivedAt: number;
  sequence: number;
}

export interface SessionIdentity {
  worldName: string | null;
  server: string | null;
  realmId: string | null;
  realmName: string | null;
}

export interface DiscoveredWorldMetadata {
  seed: string;
  name?: string;
  version?: string;
}

export type SessionIssue = "provider-error" | "invalid-data" | "missing-features";
export type SessionStatus = "disconnected" | "registering" | "waiting" | "live" | "stale" | "error";

export interface GameSession {
  schemaVersion: 1;
  id: string;
  gameClassId: number;
  edition: string;
  connected: boolean;
  registered: boolean;
  inWorld: boolean;
  generation: number;
  sequence: number;
  identity: SessionIdentity;
  gameVersion: string | null;
  /** Read locally from level.dat when the provider does not expose the seed. */
  worldSeed: string | null;
  /** Device-local save-root fingerprint; raw filesystem paths never cross windows. */
  localWorldId?: string | null;
  /** Human-readable save name; provider world ids may be opaque folder identities. */
  worldDisplayName: string | null;
  playerName: string | null;
  dimension: string | null;
  biome: string | null;
  yaw: number | null;
  /** Missing in older stored snapshots; unknown age must not become a fresh facing arrow. */
  facingReceivedAt?: number | null;
  pitch: number | null;
  position: SessionPosition | null;
  /** Some providers replay a cached startup sample; false until coordinates change. */
  positionReady?: boolean;
  issue: SessionIssue | null;
  sceneKey: string | null;
}

export interface TelemetryRules {
  positionWarmupEditions?: readonly string[];
  coordinateLimit: number;
  dimensions: Record<string, string>;
  facingAxes: Record<string, { yaw: "x" | "y"; pitch: "x" | "y" }>;
}

export const emptySessionIdentity = (): SessionIdentity => ({
  worldName: null, server: null, realmId: null, realmName: null,
});

export const createGameSession = (id: string, gameClassId: number, edition: string): GameSession => ({
  schemaVersion: 1, id, gameClassId, edition, connected: true, registered: false,
  inWorld: false, generation: 0, sequence: 0, identity: emptySessionIdentity(),
  gameVersion: null, worldSeed: null, worldDisplayName: null, playerName: null, dimension: null, biome: null,
  yaw: null, facingReceivedAt: null, pitch: null, position: null, issue: null, sceneKey: null,
});

export const getSessionStatus = (session: GameSession | null, now: number, staleAfterMs: number): SessionStatus => {
  if (!session?.connected) return "disconnected";
  if (session.issue) return "error";
  if (!session.registered) return "registering";
  if (!session.inWorld || !session.position || !session.dimension || session.positionReady === false) return "waiting";
  const age = now - session.position.receivedAt;
  return !Number.isFinite(age) || age < 0 || age > staleAfterMs ? "stale" : "live";
};
