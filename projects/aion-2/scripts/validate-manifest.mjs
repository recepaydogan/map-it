// Run with: node --experimental-strip-types scripts/validate-manifest.mjs [path]
// Checks the Overwolf manifest against the schema AND against src/game-config.ts,
// so a branch that changed one and forgot the other fails before it ships.
import fs from "node:fs";
import path from "node:path";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import sharp from "sharp";
import { GAME_CONFIG } from "../src/game-config.ts";

const root = path.resolve(import.meta.dirname, "..");
const manifestPath = process.argv[2]
  ? path.resolve(root, process.argv[2])
  : path.join(root, "public", "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const schema = JSON.parse(
  fs.readFileSync(path.join(root, "schema", "overwolf-manifest-schema.json"), "utf8"),
);
const requiredWindows = ["background", "main", "in_game", "overlay_map"];
const errors = [];
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validateSchema = ajv.compile(schema);

if (!validateSchema(manifest)) {
  for (const issue of validateSchema.errors ?? []) {
    errors.push(`Schema ${issue.instancePath || "/"}: ${issue.message ?? "invalid"}`);
  }
}

const sameIds = (left, right) =>
  left.length === right.length && [...left].sort().every((id, index) => id === [...right].sort()[index]);
const targeted = manifest.data?.game_targeting?.game_ids ?? [];
const launched = manifest.data?.launch_events?.[0]?.event_data?.game_ids ?? [];

if (manifest.meta?.name !== GAME_CONFIG.appName) {
  errors.push(`meta.name is "${manifest.meta?.name}" but GAME_CONFIG.appName is "${GAME_CONFIG.appName}".`);
}
if (!sameIds(targeted, GAME_CONFIG.gameClassIds)) {
  errors.push(`game_targeting.game_ids ${JSON.stringify(targeted)} must equal GAME_CONFIG.gameClassIds ${JSON.stringify(GAME_CONFIG.gameClassIds)}.`);
}
const launchClassIds = [...GAME_CONFIG.gameClassIds, ...(GAME_CONFIG.launcherClassIds ?? [])];
if (!sameIds(launched, launchClassIds)) {
  errors.push(`launch_events game_ids ${JSON.stringify(launched)} must equal game and launcher class ids ${JSON.stringify(launchClassIds)}.`);
}
if (manifest.data?.url_protocol?.scheme !== GAME_CONFIG.protocolScheme) {
  errors.push(`url_protocol.scheme is "${manifest.data?.url_protocol?.scheme}" but GAME_CONFIG.protocolScheme is "${GAME_CONFIG.protocolScheme}".`);
}
for (const windowName of requiredWindows) {
  if (!manifest.data?.windows?.[windowName]) errors.push(`Missing window: ${windowName}`);
}
if (!manifest.data?.windows?.overlay_map?.in_game_only || !manifest.data?.windows?.overlay_map?.resizable) {
  errors.push("Minimap must be an in-game, resizable window.");
}
for (const hotkey of ["toggle_desktop_app", "toggle_app", "toggle_overlay"]) {
  if (!manifest.data?.hotkeys?.[hotkey]) errors.push(`Missing hotkey: ${hotkey}`);
}

// JSON schema validates paths, not image dimensions. Inspect the actual files
// beside this manifest, including the exact release output before packaging.
for (const field of ["icon", "icon_gray", "window_icon", "splash_image"]) {
  const relativePath = manifest.meta?.[field];
  if (typeof relativePath !== "string") continue;
  const iconPath = path.resolve(path.dirname(manifestPath), relativePath);
  try {
    const metadata = await sharp(iconPath).metadata();
    if (metadata.format !== "png" || metadata.width !== 256 || metadata.height !== 256) {
      errors.push(`meta.${field}: ${relativePath} must be a 256x256 PNG; got ${metadata.width}x${metadata.height} ${metadata.format}.`);
    }
    if (["icon", "icon_gray"].includes(field) && fs.statSync(iconPath).size > 30 * 1024) {
      errors.push(`meta.${field}: ${relativePath} exceeds the 30 KB limit.`);
    }
  } catch (error) {
    errors.push(`meta.${field}: could not inspect ${relativePath}: ${error.message}`);
  }
}

if (errors.length > 0) {
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}

console.log(`Manifest is schema-valid, targets ${GAME_CONFIG.gameName} (${GAME_CONFIG.gameClassIds.join(", ")}), launches for ${launchClassIds.join(", ")} and declares every required window and hotkey.`);
