import { GAME_RECIPE_SOURCES } from "../src/game-config.ts";
import { readRecipeArchive } from "./recipe-source-archive.mjs";

for (const source of GAME_RECIPE_SOURCES) {
  const archive = await readRecipeArchive(source), counts = {}, examples = {}, failures = [];
  for (const file of archive.files.filter(file => file.path.startsWith(source.recipePrefix))) {
    try {
      const data = JSON.parse(file.text);
      const kind = source.dialect === "flat" ? data.type : Object.keys(data).find(key => key !== "format_version");
      counts[kind] = (counts[kind] ?? 0) + 1; examples[kind] ??= { path: file.path, data };
    } catch (error) { failures.push({ path: file.path, error: error.message }); }
  }
  console.log(JSON.stringify({ edition: source.edition, version: source.version, archiveSha256: archive.archiveSha256, counts, examples, failures }, null, 2));
}
