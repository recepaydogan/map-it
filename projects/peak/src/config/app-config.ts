export const APP_CONFIG = {
  name: "Peak Map",
  mainWindowName: "main",
  overlayWindowName: "overlay",
  backgroundWindowName: "background",
  supportedGameId: 26092 as number | null,
  gameEventFeatures: ["gep_internal", "game_info", "match_info", "location"],
  adContainers: {
    top: "peak_400x60_main",
    large: "peak_400x600_main",
  },
} as const;
