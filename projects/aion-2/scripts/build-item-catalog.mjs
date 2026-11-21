import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

const [inputPath, iconDirectory, targetDirectory = "public/data/items"] = process.argv.slice(2);
if (!inputPath || !iconDirectory) {
  console.error("Usage: node scripts/build-item-catalog.mjs <extracted-catalog.json> <extracted-icons-directory> [output-directory]");
  process.exitCode = 1;
} else {
  const requireText = (value, path) => {
    if (typeof value !== "string" || !value.trim()) throw new Error(`${path} must be a non-empty string`);
    return value.trim();
  };
  const requireNumber = (value, path, min = 0) => {
    if (!Number.isSafeInteger(value) || value < min) throw new Error(`${path} must be an integer >= ${min}`);
    return value;
  };
  const requireArray = (value, path) => {
    if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
    return value;
  };
  const requireUnique = (values, path) => {
    if (new Set(values).size !== values.length) throw new Error(`${path} contains duplicate identifiers`);
  };

  const input = JSON.parse(await readFile(resolve(inputPath), "utf8"));
  if (input.version !== 1) throw new Error("Unsupported item catalog version");
  const items = requireArray(input.items, "items");
  const recipes = requireArray(input.recipes, "recipes");
  requireUnique(items.map((item, index) => requireText(item.id, `items[${index}].id`)), "items");
  requireUnique(recipes.map((recipe, index) => requireText(recipe.id, `recipes[${index}].id`)), "recipes");
  const itemIds = new Set(items.map((item) => item.id));
  const icons = new Set();

  for (const [index, item] of items.entries()) {
    const path = `items[${index}]`;
    requireText(item.name, `${path}.name`);
    requireText(item.category, `${path}.category`);
    requireText(item.grade, `${path}.grade`);
    requireText(item.source, `${path}.source`);
    if (item.usageLevel !== undefined) requireNumber(item.usageLevel, `${path}.usageLevel`);
    if (item.icon !== undefined) {
      const icon = requireText(item.icon, `${path}.icon`);
      if (basename(icon) !== icon || !/^[a-zA-Z0-9_.-]+\.png$/i.test(icon)) throw new Error(`${path}.icon must be a PNG filename`);
      icons.add(icon);
      item.icon = `data/items/icons/${icon}`;
    }
    const levels = requireArray(item.levels, `${path}.levels`);
    requireUnique(levels.map((level, i) => requireNumber(level.level, `${path}.levels[${i}].level`)), `${path}.levels`);
    for (const [levelIndex, level] of levels.entries()) {
      const levelPath = `${path}.levels[${levelIndex}]`;
      if (level.itemLevel !== undefined) requireNumber(level.itemLevel, `${levelPath}.itemLevel`);
      requireText(level.source, `${levelPath}.source`);
      const sections = requireArray(level.sections, `${levelPath}.sections`);
      requireUnique(sections.map((section, i) => requireText(section.key, `${levelPath}.sections[${i}].key`)), `${levelPath}.sections`);
      for (const [sectionIndex, section] of sections.entries()) {
        const sectionPath = `${levelPath}.sections[${sectionIndex}]`;
        requireText(section.label, `${sectionPath}.label`);
        const stats = requireArray(section.stats, `${sectionPath}.stats`);
        requireUnique(stats.map((stat, i) => requireText(stat.key, `${sectionPath}.stats[${i}].key`)), `${sectionPath}.stats`);
        for (const [statIndex, stat] of stats.entries()) {
          requireText(stat.label, `${sectionPath}.stats[${statIndex}].label`);
          requireText(stat.value, `${sectionPath}.stats[${statIndex}].value`);
        }
      }
    }
    levels.sort((left, right) => left.level - right.level);
  }

  for (const [index, recipe] of recipes.entries()) {
    const path = `recipes[${index}]`;
    requireText(recipe.source, `${path}.source`);
    requireNumber(recipe.outputQuantity, `${path}.outputQuantity`, 1);
    if (!itemIds.has(recipe.outputItemId)) throw new Error(`${path}.outputItemId has no matching item`);
    const ingredients = requireArray(recipe.ingredients, `${path}.ingredients`);
    if (ingredients.length === 0) throw new Error(`${path}.ingredients must not be empty`);
    requireUnique(ingredients.map((ingredient, i) => requireText(ingredient.itemId, `${path}.ingredients[${i}].itemId`)), `${path}.ingredients`);
    for (const [ingredientIndex, ingredient] of ingredients.entries()) {
      if (!itemIds.has(ingredient.itemId)) throw new Error(`${path}.ingredients[${ingredientIndex}].itemId has no matching item`);
      requireNumber(ingredient.quantity, `${path}.ingredients[${ingredientIndex}].quantity`, 1);
    }
  }

  const outputDirectory = resolve(targetDirectory);
  const outputIconDirectory = join(outputDirectory, "icons");
  await mkdir(outputIconDirectory, { recursive: true });
  for (const icon of icons) await copyFile(join(resolve(iconDirectory), icon), join(outputIconDirectory, icon));
  items.sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
  await writeFile(join(outputDirectory, "catalog.json"), `${JSON.stringify({ version: 1, items, recipes }, null, 2)}\n`);
  console.log(`Validated ${items.length} items, ${recipes.length} recipes, and ${icons.size} PNG icons.`);
}
