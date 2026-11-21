import { readRecipeIngredient, readRecipeOutputs, recipeId, recipeRecord } from "./recipe-values.ts";
import type { CatalogRecipe, RecipeFile, RecipeIssue, RecipeMethod, RecipeSourceConfig } from "./recipe-types.ts";

export const normalizeRecipe = (file: RecipeFile, config: RecipeSourceConfig): CatalogRecipe | RecipeIssue => {
  try {
    const raw = recipeRecord(file.data), wrapped = config.dialect === "wrapped";
    const keys = Object.keys(raw).filter(key => key !== "format_version");
    const sourceType = wrapped ? keys.length === 1 ? keys[0] : null : raw.type;
    if (typeof sourceType !== "string") throw new Error("Missing or ambiguous recipe type");
    const method = Object.hasOwn(config.recipeTypes, sourceType) ? config.recipeTypes[sourceType] : undefined;
    if (!method || !["shaped", "shapeless", "cooking", "cutting", "smithing", "smithing_trim", "smithing_legacy", "transmute"].includes(method))
      return { code: "unsupported", path: file.path, message: `Unsupported recipe type: ${sourceType}` };
    const body = wrapped ? recipeRecord(raw[sourceType]) : raw;
    if (!file.path.startsWith(config.recipePrefix) || !file.path.endsWith(".json")) throw new Error("Recipe path is outside its source");
    const id = recipeId(wrapped ? recipeRecord(body.description).identifier : file.path.slice(config.recipePrefix.length, -5), config.defaultNamespace);
    const stationTags = wrapped ? body.tags : [];
    if (!Array.isArray(stationTags) || stationTags.some(tag => typeof tag !== "string")) throw new Error("Invalid station tags");
    if (stationTags.some(tag => config.inactiveTags?.includes(tag))) return { code: "inactive", path: file.path, message: "Source marks this recipe inactive" };
    const stationKeys: string[] = wrapped ? stationTags : [sourceType];
    if (stationKeys.some(key => !Object.hasOwn(config.stations, key))) throw new Error("Unknown recipe station");
    const trim = method === "smithing_trim", legacySmithing = method === "smithing_legacy";
    const overrides = [...new Set(stationKeys.flatMap(key => config.stationMethodOverrides?.[key] ?? []))];
    if (overrides.length > 1) throw new Error("Conflicting station recipe methods");
    const catalogMethod = overrides[0] ?? (trim || legacySmithing ? "smithing" : method === "transmute" ? "shapeless" : method);
    if (method === "transmute" && body.result !== null && typeof body.result === "object"
      && !Array.isArray(body.result) && Object.keys(body.result).length === 0)
      return { code: "unsupported", path: file.path, message: "Dynamic transmute result is not a fixed recipe output" };
    const recipe: CatalogRecipe = { id, sourceType, method: catalogMethod as RecipeMethod, stationTags,
      stations: [...new Set(stationKeys.flatMap(key => config.stations[key]))],
      source: { edition: config.edition, version: config.version, revision: config.revision, path: file.path, sha256: file.sha256,
        url: config.sourceUrl ? `${config.sourceUrl}#${encodeURIComponent(file.path)}`
          : `https://github.com/${config.repository}/blob/${config.revision}/${file.path}` },
      ingredients: [], outputs: trim ? [] : readRecipeOutputs(body.result ?? body.output, config.defaultNamespace, wrapped),
      ...(trim ? { smithingTrim: body.pattern === undefined ? {} : { pattern: recipeId(body.pattern, config.defaultNamespace) } } : {}),
      ...(legacySmithing ? { legacySmithing: true } : {}),
      sourceMetadata: {},
      ...(body.unlock === undefined ? {} : { unlock: structuredClone(body.unlock) }) };
    if (raw.format_version !== undefined) {
      if (typeof raw.format_version !== "string") throw new Error("Invalid recipe format version");
      recipe.sourceMetadata.formatVersion = raw.format_version;
    }
    if (body.priority !== undefined) {
      if (typeof body.priority !== "number" || !Number.isSafeInteger(body.priority)) throw new Error("Invalid recipe priority");
      recipe.sourceMetadata.priority = body.priority;
    }
    if (body.assume_symmetry !== undefined) {
      if (typeof body.assume_symmetry !== "boolean") throw new Error("Invalid recipe symmetry rule");
      recipe.sourceMetadata.assumeSymmetry = body.assume_symmetry;
    }
    const ingredient = (value: unknown) => readRecipeIngredient(value, config.defaultNamespace, wrapped);
    if (method === "shaped") {
      const pattern = body.pattern, key = recipeRecord(body.key);
      if (!Array.isArray(pattern) || pattern.length < 1 || pattern.length > 3 || pattern.some(row => typeof row !== "string" || row.length < 1 || row.length > 3 || !wrapped && row.length !== pattern[0].length))
        throw new Error("Invalid crafting pattern");
      if (Object.keys(key).some(symbol => symbol.length !== 1 || symbol === " ")) throw new Error("Invalid pattern key");
      const used = new Set<string>(), slots: (number | null)[] = [];
      const width = Math.max(...pattern.map(row => row.length));
      for (const row of pattern as string[]) for (const symbol of row.padEnd(width, " ")) {
        if (symbol === " ") { slots.push(null); continue; }
        if (!Object.hasOwn(key, symbol)) throw new Error("Pattern symbol has no ingredient");
        const input = ingredient(key[symbol]);
        if (input.count !== 1) throw new Error("A shaped slot must require exactly one ingredient");
        used.add(symbol); slots.push(recipe.ingredients.length); recipe.ingredients.push(input);
      }
      if (!recipe.ingredients.length || Object.keys(key).some(symbol => !used.has(symbol))) throw new Error("Empty pattern or unused ingredient key");
      recipe.grid = { width, height: pattern.length, slots };
    } else if (legacySmithing) {
      recipe.ingredients = [body.base, body.addition].map(ingredient);
    } else if (method === "smithing" || trim) {
      recipe.ingredients = [body.template, body.base, body.addition].map(ingredient);
    } else if (method === "transmute") {
      recipe.ingredients = [body.input, body.material].map(ingredient);
    } else if (method === "shapeless") {
      if (!Array.isArray(body.ingredients) || body.ingredients.length < 1 || body.ingredients.length > 9) throw new Error("Invalid shapeless ingredients");
      recipe.ingredients = body.ingredients.map(ingredient);
      if (recipe.ingredients.reduce((sum, item) => sum + item.count, 0) > 9) throw new Error("Shapeless recipe exceeds grid capacity");
    } else {
      recipe.ingredients = [ingredient(body.ingredient ?? body.input)];
      if (method === "cooking") {
        const ticks = body.cookingtime, experience = body.experience;
        if (ticks !== undefined && (typeof ticks !== "number" || !Number.isSafeInteger(ticks) || ticks <= 0)) throw new Error("Invalid cooking duration");
        if (experience !== undefined && (typeof experience !== "number" || !Number.isFinite(experience) || experience < 0)) throw new Error("Invalid recipe experience");
        recipe.cooking = { ticks: ticks as number ?? null, experience: experience as number ?? null };
      }
    }
    if (catalogMethod === "cutting" && (recipe.ingredients.length !== 1 || recipe.ingredients[0].count !== 1))
      throw new Error("Cutting recipe requires one input item");
    return recipe;
  } catch (error) { return { code: "invalid", path: file.path, message: error instanceof Error ? error.message : "Invalid recipe" }; }
};
