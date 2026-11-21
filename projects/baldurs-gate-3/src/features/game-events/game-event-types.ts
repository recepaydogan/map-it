export interface GameWorldPosition {
  x: number;
  y: number;
  z: number;
}

export type GameEventChannel = "info" | "event" | "error" | "system";

export interface RecordedGameEvent {
  id: string;
  sessionId: string;
  sequence: number;
  receivedAt: number;
  channel: GameEventChannel;
  payload: unknown;
}

export interface NormalizedGameUpdate {
  scene?: string;
  mainMap?: string;
  subMap?: string;
  camera?: GameWorldPosition;
  players?: Record<string, GameWorldPosition>;
  matchState?: "started" | "ended";
}

export type GameTrackerStatus = "disconnected" | "connecting" | "listening" | "error";

export interface GameTrackerState {
  version: 1;
  sessionId: string | null;
  status: GameTrackerStatus;
  scene: string | null;
  mainMap: string | null;
  subMap: string | null;
  camera: GameWorldPosition | null;
  players: Record<string, GameWorldPosition>;
  matchState: "started" | "ended" | null;
  supportedFeatures: string[];
  lastEventAt: number | null;
  error: string | null;
}
