import type { WorldMapPlayer } from "./world-map-player";

/** The active session owns both position and the last valid facing. */
export const useCurrentMapPlayer = (player: WorldMapPlayer | null) => player;
