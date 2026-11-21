// Run with: node --experimental-strip-types scripts/validate-manifest.mjs [path]
// Checks the Overwolf manifest against the schema AND against src/game-config.ts,
// so a branch that changed one and forgot the other fails before it ships.
import fs from "node:fs";
import path from "node:path";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { GAME_CONFIG } from "../src/game-config.ts";
import { UPDATES_VERSION } from "../src/features/updates/updates-release.ts";

const root = path.resolve(import.meta.dirname, "..");
const manifestPath = process.argv[2]
  ? path.resolve(root, process.argv[2])
  : path.join(root, "public", "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const packageMetadata = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const english = JSON.parse(fs.readFileSync(path.join(root, "src", "i18n", "locales", "en.json"), "utf8"));
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
if (manifest.meta?.author !== packageMetadata.author) {
  errors.push(`meta.author is "${manifest.meta?.author}" but package.json author is "${packageMetadata.author}".`);
}
if (manifest.meta?.version !== packageMetadata.version) {
  errors.push(`meta.version is "${manifest.meta?.version}" but package.json version is "${packageMetadata.version}".`);
}
const releaseKey = `v${UPDATES_VERSION.replaceAll(".", "")}`;
const currentNotes = english.updates?.releases?.[releaseKey]?.items;
const validReleaseNote = (note) => {
  if (typeof note === "string") return Boolean(note.trim());
  if (!note || typeof note !== "object" || typeof note.before !== "string") return false;
  if (note.target === "map-filters") return Array.isArray(note.links) && note.links.length > 0
    && note.links.every((link) => typeof link?.categoryId === "string" && Boolean(link.categoryId)
      && typeof link.link === "string" && Boolean(link.link.trim())
      && typeof link.after === "string");
  return note.target === "appearance"
    && ["link", "after"].every((part) => typeof note[part] === "string" && note[part].trim());
};
if (!Array.isArray(currentNotes) || currentNotes.length === 0 ||
    currentNotes.some((note) => !validReleaseNote(note))) {
  errors.push(`Missing English What's new notes for displayed version ${UPDATES_VERSION} (updates.releases.${releaseKey}.items).`);
}
if (!sameIds(targeted, GAME_CONFIG.gameClassIds)) {
  errors.push(`game_targeting.game_ids ${JSON.stringify(targeted)} must equal GAME_CONFIG.gameClassIds ${JSON.stringify(GAME_CONFIG.gameClassIds)}.`);
}
const expectedLaunchIds = [
  ...GAME_CONFIG.gameClassIds,
  ...GAME_CONFIG.launcherClassIds,
  ...GAME_CONFIG.diagnosticGameClassIds,
];
if (!sameIds(launched, expectedLaunchIds)) {
  errors.push(`launch_events game_ids ${JSON.stringify(launched)} must equal game, launcher and diagnostic ids ${JSON.stringify(expectedLaunchIds)}.`);
}
if (manifest.data?.url_protocol?.scheme !== GAME_CONFIG.protocolScheme) {
  errors.push(`url_protocol.scheme is "${manifest.data?.url_protocol?.scheme}" but GAME_CONFIG.protocolScheme is "${GAME_CONFIG.protocolScheme}".`);
}
for (const windowName of requiredWindows) {
  if (!manifest.data?.windows?.[windowName]) errors.push(`Missing window: ${windowName}`);
}
for (const hotkey of ["toggle_desktop_app", "toggle_app", "toggle_overlay"]) {
  if (!manifest.data?.hotkeys?.[hotkey]) errors.push(`Missing hotkey: ${hotkey}`);
}
if (manifest.data?.windows?.overlay_map?.size?.width !== 360
  || manifest.data?.windows?.overlay_map?.size?.height !== 360) {
  errors.push("The minimap must open at 360×360 before the user's resize is restored.");
}

if (errors.length > 0) {
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}

console.log(`Manifest is schema-valid, targets game ids ${GAME_CONFIG.gameClassIds.join(", ")}, launches for ids ${expectedLaunchIds.join(", ")} and declares every required window and hotkey.`);
