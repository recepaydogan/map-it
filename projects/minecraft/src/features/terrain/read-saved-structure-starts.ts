import { NbtCompound, NbtInt, NbtIntArray, NbtString } from "deepslate/nbt";

export interface SavedStructureTagSchema {
  root: string;
  starts: string;
  id: string;
  chunkX: string;
  chunkZ: string;
  boundingBox: string;
  invalidIds: readonly string[];
}

export interface SavedStructureStart {
  /** Raw compound key retained for exact source evidence and later game-specific mapping. */
  key: string;
  /** Raw namespaced start identifier; this generic reader never maps it to an app POI type. */
  id: string;
  chunkX: number;
  chunkZ: number;
  boundingBox: readonly [number, number, number, number, number, number];
}

export interface SavedStructureStarts {
  /** Unavailable means the column did not expose this optional metadata; it never means no structures. */
  coverage: "available" | "unavailable";
  starts: readonly Readonly<SavedStructureStart>[];
}

const unavailable = Object.freeze({ coverage: "unavailable" as const, starts: Object.freeze([]) });

/** Read bounded, source-backed structure occurrence metadata without assigning app-specific identities. */
export const readSavedStructureStarts = (
  root: NbtCompound,
  schema: SavedStructureTagSchema | undefined,
  context: Readonly<{ chunkX: number; chunkZ: number }>,
): SavedStructureStarts => {
  if (schema === undefined) return unavailable;
  if (!(root instanceof NbtCompound) || !Number.isSafeInteger(context.chunkX) || !Number.isSafeInteger(context.chunkZ))
    throw new Error("Invalid saved structure read context");
  const structures = root.get(schema.root);
  if (structures === undefined) return unavailable;
  if (!(structures instanceof NbtCompound)) throw new Error("Invalid saved structure root");
  const startsTag = structures.get(schema.starts);
  if (!(startsTag instanceof NbtCompound)) throw new Error("Missing or invalid saved structure starts");
  const invalidIds = new Set(schema.invalidIds.map(value => value.trim().toLowerCase()));
  const starts: Readonly<SavedStructureStart>[] = [];
  let entryCount = 0;
  startsTag.forEach((key, value) => {
    if (++entryCount > 256) throw new Error("Saved structure start limit exceeded");
    if (!key || key.length > 256) throw new Error("Missing or invalid saved structure key");
    if (!(value instanceof NbtCompound)) throw new Error("Invalid saved structure start");
    const idTag = value.get(schema.id);
    if (!(idTag instanceof NbtString)) throw new Error("Missing or invalid saved structure identifier");
    const id = idTag.getAsString().trim();
    if (!id || id.length > 256) throw new Error("Missing or invalid saved structure identifier");
    if (invalidIds.has(id.toLowerCase())) return;
    const chunkXTag = value.get(schema.chunkX), chunkZTag = value.get(schema.chunkZ);
    if (!(chunkXTag instanceof NbtInt) || !(chunkZTag instanceof NbtInt))
      throw new Error("Missing or invalid saved structure coordinates");
    const chunkX = chunkXTag.getAsNumber(), chunkZ = chunkZTag.getAsNumber();
    if (chunkX !== context.chunkX || chunkZ !== context.chunkZ)
      throw new Error("Saved structure coordinates do not match the containing column");
    const boxTag = value.get(schema.boundingBox);
    if (!(boxTag instanceof NbtIntArray) || boxTag.length !== 6)
      throw new Error("Missing or invalid saved structure bounding box");
    const values = boxTag.getItems().map(item => item.getAsNumber());
    if (values[0]! > values[3]! || values[1]! > values[4]! || values[2]! > values[5]!)
      throw new Error("Saved structure bounding box is inverted");
    const boundingBox = Object.freeze(values) as unknown as SavedStructureStart["boundingBox"];
    starts.push(Object.freeze({ key, id, chunkX, chunkZ, boundingBox }));
  });
  return Object.freeze({ coverage: "available", starts: Object.freeze(starts) });
};
