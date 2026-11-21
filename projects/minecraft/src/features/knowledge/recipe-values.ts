import type { IngredientChoice, RecipeIngredient, RecipeOutput } from "./recipe-types.ts";

export const recipeRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected a recipe record");
  return value as Record<string, unknown>;
};
export const recipeCount = (value: unknown, fallback = 1): number => {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > 65536) throw new Error("Invalid recipe quantity");
  return value;
};
export const recipeId = (value: unknown, namespace: string): string => {
  if (typeof value !== "string" || !value || value.length > 256) throw new Error("Missing recipe resource identity");
  const id = value.includes(":") ? value : `${namespace}:${value}`;
  if (!/^[a-z0-9_.-]+:[A-Za-z0-9_./-]+$/.test(id)) throw new Error("Invalid recipe resource identity");
  return id;
};
const itemChoice = (raw: unknown, namespace: string, legacy: boolean, data?: unknown): IngredientChoice => {
  if (typeof raw !== "string") throw new Error("Invalid ingredient identity");
  let id = raw;
  const suffix = legacy ? /^(.*):(-?\d+)$/.exec(raw) : null;
  if (suffix) {
    if (data !== undefined && data !== Number(suffix[2])) throw new Error("Conflicting item data values");
    id = suffix[1]; data = Number(suffix[2]);
  }
  if (data !== undefined && (typeof data !== "number" || !Number.isSafeInteger(data))) throw new Error("Invalid item data selector");
  return { kind: "item", id: recipeId(id, namespace), ...(data === undefined ? {} : { data: data as number }) };
};

/** Tags remain explicit alternatives until the versioned tag resolver verifies their membership. */
export const readRecipeIngredient = (value: unknown, namespace: string, legacy: boolean): RecipeIngredient => {
  if (Array.isArray(value)) {
    if (!value.length || value.length > 256) throw new Error("Invalid ingredient alternatives");
    const alternatives = value.map(item => readRecipeIngredient(item, namespace, legacy));
    if (alternatives.some(item => item.count !== alternatives[0].count)) throw new Error("Ingredient alternatives have conflicting quantities");
    return { count: alternatives[0].count, choices: alternatives.flatMap(item => item.choices) };
  }
  if (typeof value === "string") return { count: 1, choices: [value.startsWith("#")
    ? { kind: "tag", id: recipeId(value.slice(1), namespace) } : itemChoice(value, namespace, legacy)] };
  const record = recipeRecord(value);
  if (Object.keys(record).some(key => !["item", "tag", "data", "count"].includes(key))) throw new Error("Unsupported ingredient condition");
  if ((record.item === undefined) === (record.tag === undefined)) throw new Error("Ingredient must name exactly one item or tag");
  if (record.tag !== undefined && record.data !== undefined) throw new Error("Tag data constraints are unsupported");
  return { count: recipeCount(record.count), choices: [record.tag !== undefined
    ? { kind: "tag", id: recipeId(record.tag, namespace) } : itemChoice(record.item, namespace, legacy, record.data)] };
};

export const readRecipeOutputs = (value: unknown, namespace: string, legacy: boolean): RecipeOutput[] => {
  const entries = Array.isArray(value) ? value : [value];
  if (!entries.length || entries.length > 16) throw new Error("Invalid recipe outputs");
  return entries.map(entry => {
    const record = typeof entry === "string" ? { item: entry } : recipeRecord(entry);
    if (Object.keys(record).some(key => !["item", "id", "count", "data", "components"].includes(key))) throw new Error("Unsupported recipe output field");
    if (record.item !== undefined && record.id !== undefined) throw new Error("Conflicting output identities");
    const item = itemChoice(record.id ?? record.item, namespace, legacy, record.data);
    return { id: item.id, count: recipeCount(record.count), ...(item.data === undefined ? {} : { data: item.data }),
      ...(record.components === undefined ? {} : { components: structuredClone(recipeRecord(record.components)) }) };
  });
};
