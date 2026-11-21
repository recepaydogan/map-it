import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve("bridge-mod", "ProjectZomboidInteractiveMap");
const modInfo = await readFile(resolve(root, "42", "mod.info"), "utf8");
const bridgeScript = await readFile(
  resolve(root, "common", "media", "lua", "client", "PZInteractiveMapBridge.lua"),
  "utf8",
);

const requiredModInfo = [
  "name=Project Zomboid Map Bridge",
  "id=ProjectZomboidInteractiveMapBridge",
];
const requiredBridgeCalls = [
  "getPlayer()",
  "getTimestampMs()",
  '\"updatedAt\":%.0f',
  "getFileWriter(POSITION_FILE, true, false)",
  "getFileWriter(LOOT_FILE, true, false)",
  "getFileWriter(GAME_SESSION_FILE, true, false)",
  "getActivatedMods()",
  "getWorld()",
  "GAME_SESSION_WRITE_INTERVAL_MS",
  "now - lastGameSessionWriteAt",
  "container:isExplored()",
  "container:getItems()",
  "LOOT_SCAN_SQUARES_PER_TICK",
  "for _ = 1, LOOT_SCAN_SQUARES_PER_TICK do",
  "Events.OnContainerUpdate.Add(requestLootRefresh)",
  "Events.OnTick.Add(updateBridge)",
];

for (const value of requiredModInfo) {
  if (!modInfo.includes(value)) throw new Error(`Bridge mod.info is missing: ${value}`);
}

for (const value of requiredBridgeCalls) {
  if (!bridgeScript.includes(value)) throw new Error(`Bridge script is missing: ${value}`);
}

console.log("Bridge mod validation passed.");
