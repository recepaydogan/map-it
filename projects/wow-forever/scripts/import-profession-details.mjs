import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve("public/data/professions/details");
const catalog = JSON.parse(await readFile("public/data/professions/catalog.json", "utf8"));
const slugs = { firstaid: "first-aid" };
const review = {};
await mkdir(root, { recursive: true });

for (const profession of catalog.professions) {
  if (profession.id === "camping") continue;
  const slug = slugs[profession.id] ?? profession.id;
  const response = await fetch(`https://foreverdb.net/data/professions/${slug}.json`);
  if (!response.ok) throw new Error(`${slug}: HTTP ${response.status}`);
  const details = await response.json();
  if (!Array.isArray(details.recipes) || !Array.isArray(details.trainers)) throw new Error(`${slug}: incomplete profession details`);
  const localByItem = new Map(profession.recipes.filter((recipe) => recipe.itemId).map((recipe) => [recipe.itemId, recipe]));
  const localByName = new Map(profession.recipes.map((recipe) => [recipe.name.toLocaleLowerCase("en"), recipe]));
  const absent = [];
  const skillDifferences = [];
  const reagentDifferences = [];
  let matched = 0;
  for (const recipe of details.recipes) {
    const local = localByItem.get(String(recipe.make?.[0])) ?? localByName.get(recipe.n.toLocaleLowerCase("en"));
    if (!local) { absent.push({ spellId: recipe.s, name: recipe.n, itemId: recipe.make?.[0] }); continue; }
    matched++;
    if (recipe.req !== undefined && recipe.req !== local.skill) skillDifferences.push({ name: recipe.n, source: recipe.req, local: local.skill });
    if (Array.isArray(recipe.r) && JSON.stringify(recipe.r) !== JSON.stringify(local.reagents.map((reagent) => [Number(reagent.id), reagent.quantity]))) {
      reagentDifferences.push({ name: recipe.n, source: recipe.r, local: local.reagents.map((reagent) => [Number(reagent.id), reagent.quantity]) });
    }
  }
  review[profession.id] = { sourceRecipes: details.recipes.length, localRecipes: profession.recipes.length, matched, absent, skillDifferences, reagentDifferences, trainers: details.trainers.length, betaSeenTrainers: details.trainers.filter((trainer) => trainer.fv).length };
  await writeFile(path.join(root, `${profession.id}.json`), JSON.stringify({ version: 1, recipes: details.recipes, trainers: details.trainers, items: details.items ?? {} }));
  console.log(`${profession.id}: ${matched}/${details.recipes.length} recipes matched; ${details.trainers.length} trainers`);
}
await writeFile("docs/foreverdb-profession-review.json", `${JSON.stringify({ version: 1, review }, null, 2)}\n`);
