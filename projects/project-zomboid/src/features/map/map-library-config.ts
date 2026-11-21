import type { MapLibraryEntry } from "./community-map-types";

export const BUILTIN_MAP_ID = "builtin:knox-country";

export const BUILTIN_MAP_ENTRY: MapLibraryEntry = {
  key: BUILTIN_MAP_ID,
  displayName: "Knox Country",
  description: "Official Project Zomboid world map imported from the local game installation.",
  creator: "The Indie Stone",
  gameBuild: "42",
  kind: "builtin",
  license: "All rights reserved",
  sourceUrl: "https://projectzomboid.com/blog/",
  attribution: "Project Zomboid and Knox Country are created by The Indie Stone.",
};
