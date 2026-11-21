import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const MANIFEST_PATH = path.join(ROOT, "public", "manifest.json");

const REQUIRED_META_FIELDS = [
  "name",
  "version",
  "minimum-overwolf-version",
  "author",
  "icon",
  "icon_gray",
  "launcher_icon",
  "description",
];

const VALID_PERMISSIONS = [
  "Camera",
  "Microphone",
  "Logging",
  "Extensions",
  "Streaming",
  "DesktopStreaming",
  "Profile",
  "Clipboard",
  "Hotkeys",
  "Media",
  "GameInfo",
  "GameControl",
  "FileSystem",
  "LogitechArx",
  "LogitechLed",
  "OwWebview",
  "VideoCaptureSettings",
  "Input",
  "SystemInfo",
  "Tray",
];

// The app must auto-launch and overlay on ONLY these two FromSoftware titles.
// Locked here so a stray manifest edit can never broaden it to other games.
//   Elden Ring            -> 21866
//   Elden Ring Nightreign -> 25918
const ALLOWED_GAME_IDS = {
  21866: "Elden Ring",
  25918: "Elden Ring Nightreign",
};

let errors = 0;
let warnings = 0;

function error(msg) {
  console.error(`  ERROR: ${msg}`);
  errors++;
}
function warn(msg) {
  console.warn(`  WARN:  ${msg}`);
  warnings++;
}
function ok(msg) {
  console.log(`  OK:    ${msg}`);
}

// Assert a manifest game_ids array targets EXACTLY the allow-listed games —
// no extras (which would let the app launch on other games) and none missing.
function validateGameIds(label, ids) {
  if (!Array.isArray(ids) || ids.length === 0) {
    error(`${label}: no game_ids defined`);
    return;
  }
  const allowed = Object.keys(ALLOWED_GAME_IDS).map(Number);
  const unexpected = ids.filter((id) => !allowed.includes(id));
  const missing = allowed.filter((id) => !ids.includes(id));
  for (const id of unexpected) {
    error(`${label}: unexpected game_id ${id} — app must target ONLY Elden Ring (21866) + Nightreign (25918)`);
  }
  for (const id of missing) {
    error(`${label}: missing required game_id ${id} (${ALLOWED_GAME_IDS[id]})`);
  }
  if (unexpected.length === 0 && missing.length === 0) {
    ok(`${label}: targets exactly Elden Ring (21866) + Nightreign (25918)`);
  }
}

function validate() {
  console.log("--- Overwolf Manifest Validation ---\n");

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf-8"));
    ok("manifest.json is valid JSON");
  } catch {
    error("manifest.json is not valid JSON or not found");
    return;
  }

  console.log("\n[Top-level fields]");
  if (manifest.manifest_version !== 1) {
    error(`manifest_version should be 1, got ${manifest.manifest_version}`);
  } else {
    ok("manifest_version = 1");
  }

  if (typeof manifest.type !== "string" || manifest.type.toLowerCase() !== "webapp") {
    error(`type should be "WebApp"/"webapp", got "${manifest.type}"`);
  } else {
    ok(`type = "${manifest.type}"`);
  }

  console.log("\n[Meta fields]");
  if (!manifest.meta) {
    error('Missing "meta" section');
    return;
  }
  for (const field of REQUIRED_META_FIELDS) {
    if (!manifest.meta[field]) error(`Missing meta.${field}`);
    else ok(`meta.${field} = "${manifest.meta[field]}"`);
  }
  if (manifest.meta.version && !/^\d+\.\d+\.\d+$/.test(manifest.meta.version)) {
    warn(`meta.version "${manifest.meta.version}" should be semver (e.g., "1.0.0")`);
  }

  console.log("\n[Icon files]");
  const PUBLIC = path.join(ROOT, "public");
  const DIST = path.join(ROOT, "dist");
  const iconChecks = [
    { field: "icon", maxKB: 30, desc: "Colored icon (IconMouseOver)" },
    { field: "icon_gray", maxKB: 30, desc: "Grayscale icon (IconMouseNormal)" },
    { field: "launcher_icon", maxKB: 150, desc: "Launcher icon (.ico)" },
  ];
  const sizeReport = (filePath, check, label) => {
    const kb = fs.statSync(filePath).size / 1024;
    if (kb > check.maxKB) {
      warn(`${check.desc}: ${kb.toFixed(1)} KB (> ${check.maxKB} KB) ${label}`);
    } else {
      ok(`${check.desc}: ${kb.toFixed(1)} KB (limit: ${check.maxKB} KB) ${label}`);
    }
  };
  for (const check of iconChecks) {
    const filename = manifest.meta[check.field];
    if (!filename) continue;

    // Source icon checked into public/ — size-check it (build:icons recompresses).
    const inPublic = path.join(PUBLIC, filename);
    if (fs.existsSync(inPublic)) {
      sizeReport(inPublic, check, "[public/]");
      continue;
    }

    // Not in public/. launcher_icon.ico (and the recompressed icons) are NOT
    // checked in — build:icons generates them into dist/ from public/icon.png at
    // build time. Accept the built artifact if it's there...
    const inDist = path.join(DIST, filename);
    if (fs.existsSync(inDist)) {
      sizeReport(inDist, check, "[dist/, build-generated]");
      continue;
    }

    // ...otherwise it just hasn't been built yet — fine, as long as the
    // generator's source (public/icon.png) exists so build:icons can produce it.
    if (fs.existsSync(path.join(PUBLIC, "icon.png"))) {
      ok(`${check.desc}: not checked in — build:icons generates it from public/icon.png`);
      continue;
    }

    error(`${check.desc}: "${filename}" not in public/ or dist/, and public/icon.png is missing to generate it`);
  }
  if (manifest.meta.launcher_icon && !manifest.meta.launcher_icon.endsWith(".ico")) {
    error(`launcher_icon must be a .ico file, got "${manifest.meta.launcher_icon}"`);
  }

  console.log("\n[Permissions]");
  if (!manifest.permissions || !Array.isArray(manifest.permissions)) {
    warn("No permissions defined");
  } else {
    for (const perm of manifest.permissions) {
      if (VALID_PERMISSIONS.includes(perm)) ok(`Permission: ${perm}`);
      else warn(`Unknown permission: "${perm}" - verify this is valid`);
    }
  }

  console.log("\n[Windows]");
  if (!manifest.data?.windows) {
    error("No windows defined in data.windows");
  } else {
    const windows = manifest.data.windows;
    if (!manifest.data.start_window) error("Missing data.start_window");
    else if (!windows[manifest.data.start_window]) error(`start_window "${manifest.data.start_window}" not found in windows`);
    else ok(`start_window = "${manifest.data.start_window}"`);

    for (const [name, win] of Object.entries(windows)) {
      if (!win.file) error(`Window "${name}": missing "file" property`);
      else ok(`Window "${name}": file = "${win.file}"`);
    }

    // The public website owns index.html. Native windows must remain isolated on
    // app.html so a landing-page change can never boot inside Overwolf.
    for (const name of ["main", "companion", "overlay", "overlay_map"]) {
      if (windows[name]?.file !== "app.html") {
        error(`Window "${name}" must use the isolated app.html entry`);
      }
    }
    if (!fs.existsSync(path.join(ROOT, "app.html"))) {
      error("app.html is missing from the project root");
    } else {
      ok("All visible Overwolf windows are isolated from the website entry");
    }
  }

  console.log("\n[Launch events]");
  const launchEvents = manifest.data?.launch_events ?? manifest.launch_events;
  if (!launchEvents || launchEvents.length === 0) {
    warn("No launch_events defined - app will not auto-start");
  } else {
    for (const evt of launchEvents) {
      ok(`Launch event: ${evt.event}${evt.start_minimized ? " (minimized)" : ""}`);
      if (evt.event === "GameLaunch") {
        validateGameIds("launch_events GameLaunch game_ids", evt.event_data?.game_ids);
      }
    }
  }

  console.log("\n[Game targeting]");
  const gameTargeting = manifest.data?.game_targeting ?? manifest.game_targeting;
  if (!gameTargeting) {
    error("No game_targeting defined — app would be available for ALL games");
  } else {
    if (gameTargeting.type !== "dedicated") {
      error(`game_targeting.type should be "dedicated", got "${gameTargeting.type}"`);
    } else {
      ok(`Targeting type: ${gameTargeting.type}`);
    }
    validateGameIds("game_targeting.game_ids", gameTargeting.game_ids);
  }

  console.log("\n[Game events (GEP)]");
  const gameEvents = manifest.data?.game_events ?? manifest.game_events;
  if (!gameEvents) {
    warn("No game_events defined — real-time GEP events won't be delivered");
  } else if (!Array.isArray(gameEvents)) {
    error("game_events must be an array of game IDs");
  } else {
    const allowed = Object.keys(ALLOWED_GAME_IDS).map(Number);
    const unexpected = gameEvents.filter((id) => !allowed.includes(id));
    for (const id of unexpected) {
      error(`game_events: unexpected game_id ${id} — only Elden Ring titles may be listed`);
    }
    if (unexpected.length === 0) {
      ok(`game_events: ${gameEvents.map((id) => ALLOWED_GAME_IDS[id] ?? id).join(", ")}`);
    }
  }

  console.log("\n[Hotkeys]");
  if (!manifest.data?.hotkeys || Object.keys(manifest.data.hotkeys).length === 0) {
    warn("No hotkeys defined - Overwolf recommends at least a toggle hotkey");
  } else {
    for (const [name, hk] of Object.entries(manifest.data.hotkeys)) {
      ok(`Hotkey "${name}": ${hk.title} (${hk.default})`);
    }
  }

  console.log("\n--- Summary ---");
  console.log(`Errors:   ${errors}`);
  console.log(`Warnings: ${warnings}`);

  if (errors > 0) {
    console.log("\nFix all errors before submitting to Overwolf.");
    process.exit(1);
  } else if (warnings > 0) {
    console.log("\nNo blocking errors. Review warnings before submission.");
  } else {
    console.log("\nManifest looks good for submission!");
  }
}

validate();
