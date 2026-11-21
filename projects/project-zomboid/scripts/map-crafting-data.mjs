import { qualifyItemId } from "./map-item-catalog.mjs";

const findMatchingBrace = (source, openingIndex) => {
  let depth = 0;
  let quote;
  let escaped = false;
  let lineComment = false;
  for (let index = openingIndex; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (character === "\n") lineComment = false;
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = undefined;
      continue;
    }
    if (character === "-" && next === "-") {
      lineComment = true;
      index += 1;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === "{") depth += 1;
    if (character === "}") depth -= 1;
    if (depth === 0) return index;
  }
  return -1;
};

const extractNamedBlock = (source, name) => {
  const match = new RegExp(`\\b${name}\\s*\\{`, "g").exec(source);
  if (!match) return "";
  const openingIndex = match.index + match[0].lastIndexOf("{");
  const closingIndex = findMatchingBrace(source, openingIndex);
  return closingIndex > openingIndex ? source.slice(openingIndex + 1, closingIndex) : "";
};

const parseAmount = (line) => {
  const variable = line.match(/\bvariable\[(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)\]/);
  if (variable) return { amount: Number(variable[1]), amountMax: Number(variable[2]) };
  const fixed = line.match(/^\s*(?:item|fluid)\s+(\d+(?:\.\d+)?)/);
  return { amount: fixed ? Number(fixed[1]) : 1 };
};

const getConcreteOptions = (line) => {
  const bracketed = line.match(
    /^\s*item\s+(?:variable\[[^\]]+\]|\d+(?:\.\d+)?)\s+\[([^\]]+)\]/,
  );
  if (bracketed) return bracketed[1].split(";").map((itemId) => qualifyItemId(itemId.trim()));
  const direct = line.match(
    /^\s*item\s+(?:variable\[[^\]]+\]|\d+(?:\.\d+)?)\s+([A-Za-z_][A-Za-z0-9_.-]*)/,
  );
  return direct && !["tags", "flags", "mapper", "mappers"].includes(direct[1])
    ? [qualifyItemId(direct[1])]
    : [];
};

const parseInputs = (source) => extractNamedBlock(source, "inputs")
  .split(/\r?\n/)
  .flatMap((line) => {
    if (/^\s*item\s+/.test(line)) {
      const options = getConcreteOptions(line);
      const tags = line.match(/\btags\[([^\]]+)\]/)?.[1]
        .split(";")
        .map((tag) => tag.trim())
        .filter(Boolean) ?? [];
      if (options.length === 0 && tags.length === 0) return [];
      return [{
        kind: options.length > 0 ? "item" : "tag",
        options: options.length > 0 ? options : tags,
        ...parseAmount(line),
        consumed: !/\bmode:keep\b/.test(line),
      }];
    }
    const fluid = line.match(/^\s*fluid\s+(\d+(?:\.\d+)?)\s+\[?([A-Za-z_][A-Za-z0-9_.-]*)\]?/);
    return fluid ? [{
      kind: "fluid",
      options: [fluid[2]],
      amount: Number(fluid[1]),
      consumed: true,
    }] : [];
  });

const parseOutputs = (source) => extractNamedBlock(source, "outputs")
  .split(/\r?\n/)
  .flatMap((line) => {
    if (!/^\s*item\s+/.test(line)) return [];
    return getConcreteOptions(line).map((itemId) => ({
      itemId,
      ...parseAmount(line),
    }));
  });

const parseSkills = (source) => {
  const value = source.match(/^\s*SkillRequired\s*=\s*([^,\r\n]+)/m)?.[1];
  if (!value) return [];
  return value.split(";").flatMap((entry) => {
    const [id, level] = entry.split(":");
    return id?.trim() ? [{ id: id.trim(), level: Number(level) || 0 }] : [];
  });
};

const humanizeRecipeId = (recipeId) => recipeId
  .replace(/([a-z])([A-Z])/g, "$1 $2")
  .replace(/_/g, " ")
  .trim();

export const buildMapCraftingData = (scriptSources, recipeNames) => {
  const recipes = [];
  for (const source of scriptSources) {
    const moduleMatches = [...source.matchAll(/^\s*module\s+([A-Za-z_][A-Za-z0-9_.]*)\s*$/gm)];
    for (const match of source.matchAll(/^\s*craftRecipe\s+([^\r\n{]+)\s*\{/gm)) {
      const openingIndex = match.index + match[0].lastIndexOf("{");
      const closingIndex = findMatchingBrace(source, openingIndex);
      if (closingIndex <= openingIndex) continue;
      const block = source.slice(openingIndex + 1, closingIndex);
      const recipeId = match[1].trim();
      const moduleName = [...moduleMatches]
        .reverse()
        .find((candidate) => candidate.index < match.index)?.[1] ?? "Base";
      recipes.push({
        id: `${moduleName}:${recipeId}`,
        kind: "craft",
        recipeId,
        name: recipeNames[recipeId] ?? humanizeRecipeId(recipeId),
        category: block.match(/^\s*category\s*=\s*([^,\r\n]+)/mi)?.[1].trim() ?? "General",
        inputs: parseInputs(block),
        outputs: parseOutputs(block),
        skills: parseSkills(block),
        requiresLearning: /^\s*NeedToBeLearn\s*=\s*true\s*,?/mi.test(block),
        dynamicIngredients: false,
      });
    }
    for (const match of source.matchAll(/^\s*evolvedrecipe\s+([^\r\n{]+)\s*\{/gm)) {
      const openingIndex = match.index + match[0].lastIndexOf("{");
      const closingIndex = findMatchingBrace(source, openingIndex);
      if (closingIndex <= openingIndex) continue;
      const block = source.slice(openingIndex + 1, closingIndex);
      const recipeId = match[1].trim();
      const moduleName = [...moduleMatches]
        .reverse()
        .find((candidate) => candidate.index < match.index)?.[1] ?? "Base";
      const baseItem = block.match(/^\s*BaseItem\s*=\s*([^,\r\n]+)/mi)?.[1].trim();
      const resultItem = block.match(/^\s*ResultItem\s*=\s*([^,\r\n]+)/mi)?.[1].trim();
      const displayName = block.match(/^\s*Name\s*=\s*([^,\r\n]+)/mi)?.[1].trim();
      recipes.push({
        id: `${moduleName}:evolved:${recipeId}`,
        kind: "evolved",
        recipeId,
        name: displayName || recipeNames[recipeId] || humanizeRecipeId(recipeId),
        category: "Cooking",
        inputs: baseItem ? [{
          kind: "item",
          options: [qualifyItemId(baseItem, moduleName)],
          amount: 1,
          consumed: true,
        }] : [],
        outputs: resultItem ? [{ itemId: qualifyItemId(resultItem, moduleName), amount: 1 }] : [],
        skills: [],
        requiresLearning: false,
        dynamicIngredients: true,
      });
    }
  }

  const outputItemIds = new Set(recipes.flatMap(({ outputs }) => outputs.map(({ itemId }) => itemId)));
  return {
    recipes: recipes.sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id)),
    totalRecipes: recipes.length,
    craftRecipes: recipes.filter(({ kind }) => kind === "craft").length,
    evolvedRecipes: recipes.filter(({ kind }) => kind === "evolved").length,
    recipesWithConcreteOutputs: recipes.filter(({ outputs }) => outputs.length > 0).length,
    outputItems: outputItemIds.size,
  };
};
