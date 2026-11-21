import { NbtInt, NbtLong } from "deepslate/nbt";
import { decompressBounded } from "../terrain/decompress-bounded.ts";
import { readBoundedNbt } from "../terrain/read-bounded-nbt.ts";
import type { DiscoveredWorldMetadata } from "./session-types.ts";
import { readOverwolfBinaryFile } from "./overwolf-file-reader.ts";

const MAX_LEVEL_DAT_BYTES = 8 * 1024 * 1024;

export const readJavaSeedFromLevelDat = async (compressed: Uint8Array): Promise<string> => {
  const bytes = await decompressBounded(compressed, "gzip", {
    maxInputBytes: MAX_LEVEL_DAT_BYTES,
    maxOutputBytes: 16 * 1024 * 1024,
  });
  const { root } = readBoundedNbt(bytes, {
    littleEndian: false,
    stringEncoding: "modified-utf-8",
    maxBytes: 16 * 1024 * 1024,
  });
  const data = root.getCompound("Data");
  const settings = data.hasCompound("WorldGenSettings") ? data.getCompound("WorldGenSettings") : null;
  // Modern Java releases (26.2 and later) moved generator metadata out of level.dat into
  // data/minecraft/world_gen_settings.dat under a lower-case `data` compound.
  const separatedSettings = root.hasCompound("data") ? root.getCompound("data") : null;
  const tag = settings?.get("seed") ?? separatedSettings?.get("seed") ?? data.get("RandomSeed");
  if (tag instanceof NbtLong) return tag.toBigInt().toString();
  if (tag instanceof NbtInt) return BigInt(tag.getAsNumber()).toString();
  throw new Error("Java level.dat has no supported world seed tag.");
};

const safeDirectory = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/^"|"$/g, "");
  return normalized.length > 0 && normalized.length <= 4096 ? normalized : null;
};

const safeWorldFolder = (value: unknown): string | null => typeof value === "string"
  && value.length > 0 && value.length <= 255 && value !== "." && value !== ".."
  && !/[\\/:*?"<>|]/.test(value) ? value : null;

/** Resolves the vanilla Java save named by GEP without retaining its local path. */
export const discoverJavaWorldMetadata = async (gameDirectory: unknown, worldFolder: unknown): Promise<DiscoveredWorldMetadata | null> => {
  const directory = safeDirectory(gameDirectory), folder = safeWorldFolder(worldFolder);
  if (!directory || !folder) return null;
  const separator = directory.endsWith("\\") || directory.endsWith("/") ? "" : "\\";
  const base = `${directory}${separator}saves\\${folder}`;
  const candidates = [
    `${base}\\level.dat`,
    `${base}\\data\\minecraft\\world_gen_settings.dat`,
  ];
  const failures: unknown[] = [];
  for (const path of candidates) {
    try { return { seed: await readJavaSeedFromLevelDat(await readOverwolfBinaryFile(path, MAX_LEVEL_DAT_BYTES, "Unable to read Java level.dat.")) }; }
    catch (error) { failures.push(error); }
  }
  throw new AggregateError(failures, "Unable to read a supported Java world seed file.");
};

/** Retained for callers that only need the seed parser contract. */
export const discoverJavaWorldSeed = async (gameDirectory: unknown, worldFolder: unknown): Promise<string | null> =>
  (await discoverJavaWorldMetadata(gameDirectory, worldFolder))?.seed ?? null;
