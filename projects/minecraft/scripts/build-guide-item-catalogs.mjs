import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { GAME_GUIDE_BREWING, GAME_JAVA_GUIDE_RELEASES } from "../src/game-config.ts";

const repository = "misode/mcmeta";
const namespace = GAME_GUIDE_BREWING.namespace;
const containers = GAME_GUIDE_BREWING.containers;

const registry = async (revision, name) => {
  const url = `https://raw.githubusercontent.com/${repository}/${revision}/${name}/data.json`;
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`${name} registry download failed with ${response.status}.`);
  const values = await response.json();
  if (!Array.isArray(values) || !values.length || values.some(value => typeof value !== "string" || !/^[a-z0-9_./-]+$/.test(value)))
    throw new Error(`Invalid ${name} registry for ${revision}.`);
  return { url, values };
};

for (const release of GAME_JAVA_GUIDE_RELEASES) {
  const [items, potions] = await Promise.all([
    registry(release.registryRevision, "item"),
    registry(release.registryRevision, "potion"),
  ]);
  const identities = new Set(items.values.map(id => `${namespace}:${id}`));
  for (const container of containers) for (const potion of potions.values) identities.add(`${namespace}:${container}/${potion}`);
  const artifact = {
    schemaVersion: 1,
    kind: "item-catalog",
    source: { edition: "java", version: release.version, revision: release.registryRevision, url: items.url },
    items: [...identities].sort((left, right) => left.localeCompare(right, "en")),
  };
  const destination = resolve("public", "knowledge-data", "java", release.version);
  await mkdir(destination, { recursive: true });
  await writeFile(resolve(destination, "items.json"), JSON.stringify(artifact));
  console.log(`${release.version}: ${items.values.length} registry items and ${potions.values.length} potion variants verified.`);
}
