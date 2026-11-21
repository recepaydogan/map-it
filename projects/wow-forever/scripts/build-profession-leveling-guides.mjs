import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const source = JSON.parse(fs.readFileSync(path.join(root, "data/site-research/foreverdb-profession-routes.json"), "utf8"));
const catalog = JSON.parse(fs.readFileSync(path.join(root, "public/data/professions/catalog.json"), "utf8"));
const output = path.join(root, "public/data/professions/leveling.json");

const guides = Object.fromEntries(Object.entries(source.guides).map(([id, route]) => {
  const profession = catalog.professions.find((entry) => entry.id === id);
  if (!profession) throw new Error(`${id}: missing Forever profession catalog`);
  const details = JSON.parse(fs.readFileSync(path.join(root, `public/data/professions/details/${id}.json`), "utf8"));
  if (!route.sourceUrl.startsWith("https://foreverdb.net/profession/") || !route.sourceBuild) {
    throw new Error(`${id}: invalid ForeverDB provenance`);
  }
  if (route.steps[0]?.from !== 1 || route.steps.at(-1)?.to !== 300) {
    throw new Error(`${id}: incomplete ForeverDB route`);
  }
  for (const [index, step] of route.steps.entries()) {
    if (index && route.steps[index - 1].to !== step.from) {
      throw new Error(`${id}: gap or overlap at ${step.from}`);
    }
    if (!Number.isInteger(step.crafts) || step.crafts < 1) {
      throw new Error(`${id}: invalid craft count for ${step.recipeName}`);
    }
    const recipes = profession.recipes.filter((recipe) => recipe.name === step.recipeName);
    if (recipes.length !== 1) throw new Error(`${id}: ${step.recipeName} is not a unique Forever recipe`);
    const clientRecipes = details.recipes.filter((recipe) => recipe.n === step.recipeName);
    if (clientRecipes.length !== 1 || !Number.isInteger(clientRecipes[0].req) || clientRecipes[0].req > step.from) {
      throw new Error(`${id}: ${step.recipeName} starts before its client requirement`);
    }
  }
  for (const step of route.hordeDifferences ?? []) {
    if (!Number.isInteger(step.crafts) || step.crafts < 1 || step.from < 1 || step.to > 300 || step.from >= step.to) {
      throw new Error(`${id}: invalid Horde exception`);
    }
    if (!profession.recipes.some((recipe) => recipe.name === step.recipeName)) {
      throw new Error(`${id}: Horde recipe ${step.recipeName} is absent from the Forever catalog`);
    }
    const clientRecipes = details.recipes.filter((recipe) => recipe.n === step.recipeName);
    if (clientRecipes.length !== 1 || !Number.isInteger(clientRecipes[0].req) || clientRecipes[0].req > step.from) {
      throw new Error(`${id}: Horde recipe ${step.recipeName} starts before its client requirement`);
    }
  }
  return [id, {
    kind: "crafting",
    sourceUrl: route.sourceUrl,
    sourceBuild: route.sourceBuild,
    routeFaction: route.routeFaction,
    maxSkill: 300,
    betaCap: 225,
    steps: route.steps.map((step) => ({ ...step, approximate: true })),
    hordeDifferences: (route.hordeDifferences ?? []).map((step) => ({ ...step, approximate: true })),
  }];
}));

const payload = { version: 4, guides };
const serialized = `${JSON.stringify(payload, null, 2)}\n`;
if (process.argv.includes("--check")) {
  if (!fs.existsSync(output) || fs.readFileSync(output, "utf8") !== serialized) {
    throw new Error("Profession leveling data is stale; rebuild it with this script");
  }
} else {
  fs.writeFileSync(output, serialized);
}
for (const [id, guide] of Object.entries(guides)) console.log(`${id}: ${guide.steps.length} ForeverDB steps`);
