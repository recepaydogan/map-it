/** Data-only offloading. Executable modules and native tracking stay local. */
export const DATA_EXTENSIONS = new Set([".json", ".png", ".webp", ".jpg", ".jpeg", ".svg", ".bin", ".gz", ".nbt", ".txt"]);
export const PROFILE_ORIGINS = {
  "baldurs-gate-3": "https://bg3.ingredientassets.com",
  "project-zomboid": "https://pz.ingredientassets.com",
};
// Standalone ROB RUN ships local data. Reuse the content bucket already
// serving Map It's Project Zomboid and Valheim releases.
export const PUBLISH_PROFILES = { "rob-run": "project-zomboid" };

export function classifyContent(app, relative) {
  const base = relative.split("/").at(-1);
  if (app === "minecraft" && ["poi-artwork", "knowledge-data", "seed-discoveries", "guide-artwork", "guide-entities", "guide-structures", "guide-structure-markers"].includes(relative.split("/")[0])) return "remote";
  if (app === "baldurs-gate-3" && (relative.startsWith("data/") || relative.startsWith("items/") || (relative.startsWith("maps/") && !relative.endsWith("/metadata.json")))) return "remote";
  if (app === "elden-ring") {
    if ((relative.startsWith("maps/") || relative.startsWith("data/") || relative.startsWith("poi-icons/")) && relative !== "maps/er-regions.png") return "remote";
    if (relative.startsWith("icons/") && !relative.startsWith("icons/_fallback/")) return "remote";
  }
  if (app === "valheim") {
    if (relative === "icon-source.png") return "omit-build-input";
    if (relative.startsWith("game-data/location-details/") || relative.startsWith("game-data/character-portraits/")) return "remote";
    if (relative === "game-data/localization.json") return "split-valheim-locale";
  }
  if (app === "wow-forever" && relative.startsWith("maps/")) return "remote";
  if (app === "wow-forever" && relative.startsWith("data/")) {
    // Full development builds include large search/spell indexes and map
    // tiles that solo release packaging already offloads. Keep only small
    // bootstrap catalogs here; an index filename alone is not a size policy.
    if (["data/reference/index.json", "data/guides/index.json"].includes(relative) || base === "live-position-projection.json") return "keep";
    if (!/(?:^|[-_/])en(?:US|GB)?(?:[./_-]|$)/.test(relative)) return "remote";
  }
  if (app === "project-zomboid") {
    if (relative === "map-data/knox-country/metadata.json"
        || /^map-data\/knox-country\/(?:locales|icons|navigation\/regions)\//.test(relative)) return "remote";
    if (/native-position\/.*\.(?:lib|pdb|h|hpp)$/.test(relative)) return "omit-build-input";
  }
  if (app === "rob-run" && (/^maps\/[^/]+\/tiles\//.test(relative) || relative.startsWith("data/rob-run/icons/"))) return "remote";
  return "keep";
}
