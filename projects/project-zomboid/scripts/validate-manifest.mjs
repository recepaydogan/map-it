import fs from "node:fs";
import path from "node:path";
import Ajv from "ajv";
import addFormats from "ajv-formats";

const root = path.resolve(import.meta.dirname, "..");
const manifestPath = process.argv[2]
  ? path.resolve(root, process.argv[2])
  : path.join(root, "public", "manifest.json");
const manifest = JSON.parse(
  fs.readFileSync(manifestPath, "utf8"),
);
const schema = JSON.parse(
  fs.readFileSync(path.join(root, "schema", "overwolf-manifest-schema.json"), "utf8"),
);
const expectedGameId = 10598;
const targeted = manifest.data?.game_targeting?.game_ids ?? [];
const launched = manifest.data?.launch_events?.[0]?.event_data?.game_ids ?? [];
const requiredWindows = ["background", "main", "overlay_map"];
const requiredExternalMapOrigin = "https://tiles.projectzomboidmap.com";
const errors = [];
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validateSchema = ajv.compile(schema);

if (!validateSchema(manifest)) {
  for (const issue of validateSchema.errors ?? []) {
    errors.push(`Schema ${issue.instancePath || "/"}: ${issue.message ?? "invalid"}`);
  }
}

if (manifest.meta?.name !== "Project Zomboid Map") {
  errors.push("Unexpected application name.");
}
if (targeted.length !== 1 || targeted[0] !== expectedGameId) {
  errors.push(`game_targeting must contain only Project Zomboid (${expectedGameId}).`);
}
if (launched.length !== 1 || launched[0] !== expectedGameId) {
  errors.push(`GameLaunch must contain only Project Zomboid (${expectedGameId}).`);
}
for (const windowName of requiredWindows) {
  if (!manifest.data?.windows?.[windowName]) errors.push(`Missing window: ${windowName}`);
}
if (!manifest.data?.externally_connectable?.matches?.includes(requiredExternalMapOrigin)) {
  errors.push(`Missing external map origin: ${requiredExternalMapOrigin}`);
}

if (errors.length > 0) {
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}

console.log("Manifest is schema-valid, targets Project Zomboid and contains all required windows.");
