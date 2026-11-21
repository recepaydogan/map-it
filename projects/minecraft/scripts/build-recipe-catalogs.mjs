import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { GAME_JAVA_GUIDE_RECIPE_SOURCES, GAME_RECIPE_SOURCES } from "../src/game-config.ts";
import { normalizeRecipe } from "../src/features/knowledge/normalize-recipe.ts";
import { buildRecipeIndex, createRecipeTagResolver } from "../src/features/knowledge/recipe-index.ts";
import { readRecipeArchive } from "./recipe-source-archive.mjs";

const output = resolve("node_modules/.cache/recipe-catalogs"); await mkdir(output, { recursive: true });
const writePackagedCatalog = async (path, contents) => {
  for (let attempt = 0; ; attempt++) {
    try { await writeFile(path, contents); return; }
    catch (error) {
      if (attempt >= 11 || !["UNKNOWN", "EBUSY", "EPERM"].includes(error.code)) throw error;
      await delay(150 * (attempt + 1));
    }
  }
};
const requestedVersion = process.argv.find(argument => argument.startsWith("--version="))?.slice("--version=".length);
const requestedEdition = process.argv.find(argument => argument.startsWith("--edition="))?.slice("--edition=".length);
const currentBedrockSource = GAME_RECIPE_SOURCES.find(source => source.edition === "bedrock");
const currentSources = GAME_RECIPE_SOURCES.filter(source => source.edition !== "bedrock"
  || requestedVersion || source === currentBedrockSource);
const configuredSources = process.argv.includes("--guide")
  ? [...GAME_JAVA_GUIDE_RECIPE_SOURCES, ...currentSources.filter(source => source.edition !== "java")]
  : currentSources;
const sources = configuredSources.filter(source => (!requestedVersion || source.version === requestedVersion)
  && (!requestedEdition || source.edition === requestedEdition));
if (!sources.length) throw new Error(`No configured recipe source for version ${requestedVersion}.`);
for (const source of sources) {
  const archive = await readRecipeArchive(source), recipes = [], issues = [], tags = [];
  let total = 0;
  for (const file of archive.files) {
    const isRecipe = file.path.startsWith(source.recipePrefix); if (isRecipe) total++;
    let data;
    try { data = JSON.parse(file.text); }
    catch (error) { issues.push({ code: "invalid", path: file.path, message: error.message }); continue; }
    if (isRecipe) {
      const normalized = normalizeRecipe({ path: file.path, data, sha256: file.sha256 }, source);
      if ("code" in normalized) issues.push(normalized); else recipes.push(normalized);
    } else if (source.tagPrefix && file.path.startsWith(source.tagPrefix)) {
      tags.push({ id: `${source.defaultNamespace}:${file.path.slice(source.tagPrefix.length, -5)}`, values: data.values, path: file.path });
    }
  }
  const identities = new Map();
  for (const recipe of recipes) { if (!identities.has(recipe.id)) identities.set(recipe.id, []); identities.get(recipe.id).push(recipe); }
  const accepted = recipes.filter(recipe => identities.get(recipe.id).length === 1);
  for (const [id, group] of identities) if (group.length > 1) for (const recipe of group)
    issues.push({ code: "ambiguous-source", path: recipe.source.path, message: `Duplicate declared recipe identity ${id}; runtime precedence is not verified` });
  const index = buildRecipeIndex(accepted, createRecipeTagResolver(tags, source.defaultNamespace));
  for (const [id, tag] of Object.entries(index.unresolvedTags)) issues.push({ code: "unresolved-tag", path: id, message: JSON.stringify(tag) });
  const report = { edition: source.edition, version: source.version, revision: source.revision, sourceRecipes: total, normalizedRecipes: accepted.length,
    invalid: issues.filter(issue => issue.code === "invalid").length, unsupported: issues.filter(issue => issue.code === "unsupported").length,
    inactive: issues.filter(issue => issue.code === "inactive").length, ambiguous: issues.filter(issue => issue.code === "ambiguous-source").length,
    unresolvedTags: Object.keys(index.unresolvedTags).length, itemRegistryVerified: source.fetchMode === "installed",
    installedLayers: archive.layers ?? [], redistributionApproved: false };
  const artifact = { schemaVersion: 2, source: { ...source, archiveSha256: archive.archiveSha256 }, report, recipes: accepted, index, issues };
  await writeFile(resolve(output, `${source.edition}-${source.version}.json`), JSON.stringify(artifact, null, 2));
  if (process.argv.includes("--package") && !report.invalid) {
    const destination = resolve(`public/knowledge-data/${source.edition}/${source.version}`);
    await mkdir(destination, { recursive: true });
    await writePackagedCatalog(resolve(destination, "recipes.json"), JSON.stringify(artifact, null, 2));
  }
  console.log(JSON.stringify(report));
  console.log(JSON.stringify(issues.slice(0, 16), null, 2));
  if (report.invalid) process.exitCode = 1;
}
