import { mkdir, writeFile } from "node:fs/promises";
import { GAME_SEED_TERRAIN as config } from "../src/game-config.ts";
import { readRecipeArchive } from "./recipe-source-archive.mjs";

await mkdir("public/seed-terrain", { recursive: true });
for (const source of config.sources) {
  const archive = await readRecipeArchive({ ...source, edition: config.edition, repository: config.repository,
    recipePrefix: config.prefix, tagPrefix: null });
  const registries = { noise: {}, density_function: {}, noise_settings: {} };
  for (const file of archive.files) {
    const relative = file.path.slice(config.prefix.length), slash = relative.indexOf("/");
    const registry = relative.slice(0, slash), id = `${config.namespace}:${relative.slice(slash + 1, -5)}`;
    if (Object.hasOwn(registries, registry)) registries[registry][id] = JSON.parse(file.text);
  }
  if (!Object.keys(registries.noise).length || !Object.keys(registries.density_function).length) throw new Error("Incomplete world generation data");
  await writeFile(`public/seed-terrain/${source.version}.json`, JSON.stringify({ source: { ...source, edition: config.edition,
    url: `https://github.com/${config.repository}/tree/${source.revision}/${config.prefix}`, archiveSha256: archive.archiveSha256 }, registries }));
  console.log(`Packaged density data for ${source.version}`);
}
