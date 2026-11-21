/** Adapt reviewed Simplified Chinese NPC names for Traditional Chinese map labels. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const english = await read("src/i18n/locales/en.json");
const simplified = await read("src/i18n/locales/zh-Hans.json");
const reviewed = await read("data/npc-name-localization/reviewed-hant-npc-fallbacks.json");
const path = join(root, "src/i18n/locales/zh-Hant.json");
const raw = await readFile(path, "utf8");
const traditional = JSON.parse(raw);
const found = new Map(Object.keys(reviewed).map((name) => [name, 0]));
let added = 0;
function apply(englishNode, simplifiedNode, traditionalNode, pathParts = []) {
  for (const [key, value] of Object.entries(englishNode)) {
    const nextPath = [...pathParts, key];
    if (typeof value === "string") {
      const record = reviewed[value];
      if (!record) continue;
      const keyPath = nextPath.join(".");
      if (!/^map\.(?:questMarkers|classTrainers|mapgenieCommunity)\./.test(keyPath) ||
        simplifiedNode?.[key] !== record["zh-Hans"] ||
        !record["zh-Hant"] || record["zh-Hant"] === value) {
        throw new Error(`${value}: Chinese NPC context changed at ${keyPath}`);
      }
      found.set(value, found.get(value) + 1);
      if (traditionalNode[key] && traditionalNode[key] !== record["zh-Hant"]) continue;
      if (!traditionalNode[key]) { traditionalNode[key] = record["zh-Hant"]; added += 1; }
    } else if (value && typeof value === "object") {
      traditionalNode[key] ??= Array.isArray(value) ? [] : {};
      apply(value, simplifiedNode?.[key], traditionalNode[key], nextPath);
    }
  }
}
apply(english, simplified, traditional);
for (const [name, count] of found) if (!count) throw new Error(`${name}: no matching NPC map field`);
const output = JSON.stringify(traditional, null, 2) + "\n";
if (process.argv.includes("--check")) {
  if (output !== raw) throw new Error("Traditional Chinese NPC fallbacks are stale");
} else if (output !== raw) await writeFile(path, output);
console.log(`${added} reviewed Traditional Chinese NPC fields added`);
