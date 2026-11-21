import { buildRecipeIndex, type RecipeIndex, type ResolvedRecipeTag } from "./recipe-index.ts";
import type { RecipeInspectorCatalog } from "./recipe-inspector-content.tsx";
import type { CatalogRecipe, IngredientChoice, RecipeIngredient, RecipeOutput, RecipeProvenance } from "./recipe-types.ts";

export const RECIPE_CATALOG_FILE_LIMIT = 16 * 1024 * 1024;
const RESOURCE_ID = /^[a-z0-9_.-]+:[A-Za-z0-9_./-]+$/;

export interface RecipeCatalogIdentity { edition: string; version: string; revision: string }
export interface ValidatedRecipeCatalog extends RecipeInspectorCatalog { source: Readonly<RecipeCatalogIdentity> }

const record = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Invalid ${label}.`);
  return value as Record<string, unknown>;
};
const text = (value: unknown, label: string, max = 2048) => {
  if (typeof value !== "string" || !value || value.length > max) throw new Error(`Invalid ${label}.`);
  return value;
};
const id = (value: unknown, label: string) => {
  const result = text(value, label, 256);
  if (!RESOURCE_ID.test(result)) throw new Error(`Invalid ${label}.`);
  return result;
};
const integer = (value: unknown, label: string, min: number, max: number) => {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) throw new Error(`Invalid ${label}.`);
  return value as number;
};
const optionalInteger = (value: unknown, label: string) => value === undefined ? undefined : integer(value, label, -2147483648, 2147483647);
const stringList = (value: unknown, label: string, limit: number, resources = true): string[] => {
  if (!Array.isArray(value) || value.length > limit) throw new Error(`Invalid ${label}.`);
  const result = value.map((entry, index) => resources ? id(entry, `${label} identity ${index}`) : text(entry, `${label} value ${index}`, 256));
  if (new Set(result).size !== result.length) throw new Error(`Duplicate ${label}.`);
  return result;
};

const provenance = (value: unknown, expected: RecipeCatalogIdentity): RecipeProvenance => {
  const source = record(value, "recipe provenance");
  const edition = text(source.edition, "recipe edition", 64), version = text(source.version, "recipe version", 64);
  const revision = text(source.revision, "recipe revision", 128);
  if (edition !== expected.edition || version !== expected.version || revision !== expected.revision)
    throw new Error("Recipe provenance does not match the selected catalog.");
  const sha256 = text(source.sha256, "recipe hash", 64);
  if (!/^[a-f0-9]{64}$/i.test(sha256)) throw new Error("Invalid recipe hash.");
  const sourceUrl = text(source.url, "recipe source URL", 4096);
  if (!/^https:\/\/[^\s]+$/i.test(sourceUrl) || !sourceUrl.includes(revision))
    throw new Error("Recipe source URL does not identify its HTTPS revision.");
  return { edition, version, revision, path: text(source.path, "recipe path"), sha256, url: sourceUrl };
};

const choice = (value: unknown): IngredientChoice => {
  const input = record(value, "ingredient choice");
  if (input.kind !== "item" && input.kind !== "tag") throw new Error("Invalid ingredient choice kind.");
  if (input.kind === "tag" && input.data !== undefined) throw new Error("Ingredient tags cannot contain data selectors.");
  return { kind: input.kind, id: id(input.id, "ingredient identity"), ...(input.data === undefined ? {} :
    { data: optionalInteger(input.data, "ingredient data") }) };
};

const ingredient = (value: unknown): RecipeIngredient => {
  const input = record(value, "recipe ingredient");
  if (!Array.isArray(input.choices) || !input.choices.length || input.choices.length > 256) throw new Error("Invalid ingredient choices.");
  return { choices: input.choices.map(choice), count: integer(input.count, "ingredient quantity", 1, 65536) };
};

const output = (value: unknown): RecipeOutput => {
  const result = record(value, "recipe output");
  return { id: id(result.id, "output identity"), count: integer(result.count, "output quantity", 1, 65536),
    ...(result.data === undefined ? {} : { data: optionalInteger(result.data, "output data") }),
    ...(result.components === undefined ? {} : { components: {} }) };
};

const recipe = (value: unknown, expected: RecipeCatalogIdentity): CatalogRecipe => {
  const input = record(value, "catalog recipe");
  if (!(["shaped", "shapeless", "cooking", "cutting", "brewing", "smithing"] as const).includes(input.method as never)) throw new Error("Invalid recipe method.");
  const trim = input.smithingTrim === undefined ? undefined : record(input.smithingTrim, "smithing trim metadata");
  const trimPattern = trim?.pattern === undefined ? undefined : id(trim.pattern, "smithing trim pattern");
  const legacySmithing = input.legacySmithing === true;
  if (input.legacySmithing !== undefined && !legacySmithing) throw new Error("Invalid legacy smithing metadata.");
  if (!Array.isArray(input.ingredients) || !input.ingredients.length || input.ingredients.length > 256 ||
    !Array.isArray(input.outputs) || (!input.outputs.length && !(input.method === "smithing" && trim))
    || input.outputs.length > 16 || (trim && input.outputs.length)) throw new Error("Invalid recipe inputs or outputs.");
  const ingredients = input.ingredients.map(ingredient), outputs = input.outputs.map(output);
  if (legacySmithing && (input.method !== "smithing" || ingredients.length !== 2 || !outputs.length) ||
    trim && (input.method !== "smithing" || ingredients.length !== 3)) throw new Error("Invalid smithing recipe slots.");
  let grid: CatalogRecipe["grid"];
  if (input.grid !== undefined) {
    const rawGrid = record(input.grid, "recipe grid"), width = integer(rawGrid.width, "recipe grid width", 1, 16);
    const height = integer(rawGrid.height, "recipe grid height", 1, 16);
    if (!Array.isArray(rawGrid.slots) || rawGrid.slots.length !== width * height) throw new Error("Invalid recipe grid slots.");
    grid = { width, height, slots: rawGrid.slots.map(slot => slot === null ? null : integer(slot, "recipe grid slot", 0, ingredients.length - 1)) };
  }
  let cooking: CatalogRecipe["cooking"];
  if (input.cooking !== undefined) {
    const rawCooking = record(input.cooking, "cooking metadata");
    const ticks = rawCooking.ticks === null ? null : integer(rawCooking.ticks, "cooking ticks", 0, 1000000);
    const experience = rawCooking.experience;
    if (experience !== null && (typeof experience !== "number" || !Number.isFinite(experience) || experience < 0 || experience > 1000000))
      throw new Error("Invalid cooking experience.");
    cooking = { ticks, experience: experience as number | null };
  }
  const metadata = record(input.sourceMetadata ?? {}, "recipe source metadata");
  if (metadata.formatVersion !== undefined && (typeof metadata.formatVersion !== "string" || metadata.formatVersion.length > 128) ||
    metadata.priority !== undefined && !Number.isSafeInteger(metadata.priority) ||
    metadata.assumeSymmetry !== undefined && typeof metadata.assumeSymmetry !== "boolean") throw new Error("Invalid recipe source metadata.");
  return { id: id(input.id, "recipe identity"), method: input.method as CatalogRecipe["method"],
    sourceType: text(input.sourceType, "recipe source type", 256), source: provenance(input.source, expected),
    stations: stringList(input.stations, "recipe stations", 32), stationTags: stringList(input.stationTags, "recipe station tags", 32, false),
    ingredients, outputs, ...(grid ? { grid } : {}), ...(cooking ? { cooking } : {}),
    ...(trim ? { smithingTrim: trimPattern ? { pattern: trimPattern } : {} } : {}),
    ...(legacySmithing ? { legacySmithing: true } : {}),
    sourceMetadata: { ...(metadata.formatVersion === undefined ? {} : { formatVersion: metadata.formatVersion as string }),
      ...(metadata.priority === undefined ? {} : { priority: metadata.priority as number }),
      ...(metadata.assumeSymmetry === undefined ? {} : { assumeSymmetry: metadata.assumeSymmetry as boolean }) } };
};

const tagMembership = (value: unknown): Record<string, string[]> => {
  const entries = Object.entries(record(value, "catalog tag membership"));
  if (entries.length > 32768) throw new Error("Catalog contains too many ingredient groups.");
  return Object.fromEntries(entries.map(([key, members]) => [id(key, "ingredient group identity"),
    stringList(members, "ingredient group members", 65536)]));
};

export const parseRecipeCatalogArtifact = (value: unknown, expected: RecipeCatalogIdentity): ValidatedRecipeCatalog => {
  const root = record(value, "recipe catalog");
  if (root.schemaVersion !== 2) throw new Error("Unsupported recipe catalog schema.");
  const source = record(root.source, "recipe catalog source");
  const identity = { edition: text(source.edition, "catalog edition", 64), version: text(source.version, "catalog version", 64),
    revision: text(source.revision, "catalog revision", 128) };
  if (identity.edition !== expected.edition || identity.version !== expected.version || identity.revision !== expected.revision)
    throw new Error("Recipe catalog does not match the selected world's exact edition, version and source revision.");
  if (!Array.isArray(root.recipes) || !root.recipes.length || root.recipes.length > 10000) throw new Error("Invalid recipe catalog records.");
  const recipes = root.recipes.map(entry => recipe(entry, identity));
  const rawIndex = record(root.index, "recipe catalog index");
  const members = tagMembership(rawIndex.tagMembers);
  const unresolved = record(rawIndex.unresolvedTags, "unresolved ingredient groups");
  const resolver = (tag: string): ResolvedRecipeTag => ({ items: [...(members[tag] ?? [])], missing: [], cycles: [],
    complete: !Object.prototype.hasOwnProperty.call(unresolved, tag) });
  const index: RecipeIndex = buildRecipeIndex(recipes, resolver);
  return Object.freeze({ source: Object.freeze(identity), recipes: Object.freeze(recipes), index });
};

export const loadRecipeCatalogFile = async (file: File, expected: RecipeCatalogIdentity): Promise<ValidatedRecipeCatalog> => {
  if (!(file instanceof File) || !file.name.toLocaleLowerCase("en-US").endsWith(".json") || file.size < 2 || file.size > RECIPE_CATALOG_FILE_LIMIT)
    throw new Error("Invalid recipe catalog file.");
  return parseRecipeCatalogArtifact(JSON.parse(await file.text()), expected);
};
