import { NbtInt, NbtLong } from "deepslate/nbt";
import { readBoundedNbt } from "../terrain/read-bounded-nbt.ts";
import type { DiscoveredWorldMetadata } from "./session-types.ts";
import { listOverwolfDirectories, readOverwolfBinaryFile } from "./overwolf-file-reader.ts";

const MAX_LEVEL_DAT_BYTES = 8 * 1024 * 1024;
const MAX_USER_DIRECTORIES = 32;

const readVersion = (values: number[]): string | null => {
  if (values.length < 3 || !values.slice(0, 3).every(value => Number.isSafeInteger(value) && value >= 0)) return null;
  // Bedrock changed its public numbering from 1.21.x to 26.x while retaining
  // the package/NBT leading component. Keep both release schemes explicit.
  return values[0] === 1 && values[1]! >= 26
    ? `${values[1]}.${values[2]}`
    : `${values[0]}.${values[1]}.${values[2]}`;
};

export const readBedrockWorldMetadata = (file: Uint8Array): DiscoveredWorldMetadata => {
  if (!(file instanceof Uint8Array) || file.byteLength < 11 || file.byteLength > MAX_LEVEL_DAT_BYTES)
    throw new Error("Bedrock level.dat has an invalid size.");
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  const payloadBytes = view.getUint32(4, true);
  if (payloadBytes === 0 || payloadBytes !== file.byteLength - 8)
    throw new Error("Bedrock level.dat has an invalid header.");
  const { root } = readBoundedNbt(file.subarray(8), {
    littleEndian: true,
    stringEncoding: "utf-8",
    maxBytes: MAX_LEVEL_DAT_BYTES,
  });
  const seedTag = root.get("RandomSeed");
  const seed = seedTag instanceof NbtLong ? seedTag.toBigInt().toString()
    : seedTag instanceof NbtInt ? BigInt(seedTag.getAsNumber()).toString() : null;
  const name = root.hasString("LevelName") ? root.getString("LevelName").trim() : "";
  const version = root.hasList("lastOpenedWithVersion")
    ? readVersion(root.getList("lastOpenedWithVersion").getItems().map(item => item.getAsNumber()))
    : null;
  if (!seed || !name || name.length > 512 || !version) throw new Error("Bedrock level.dat is missing supported world metadata.");
  return { seed, name, version };
};

const safeWorldFolder = (value: unknown): string | null => typeof value === "string"
  && value.length > 0 && value.length <= 255 && value !== "." && value !== ".."
  && !/[\\/:*?"<>|]/.test(value) ? value : null;

const readFirstMetadata = async (paths: string[]): Promise<DiscoveredWorldMetadata> => {
  const failures: unknown[] = [];
  for (const path of paths) {
    try { return readBedrockWorldMetadata(await readOverwolfBinaryFile(path, MAX_LEVEL_DAT_BYTES, "Unable to read Bedrock level.dat.")); }
    catch (error) { failures.push(error); }
  }
  throw new AggregateError(failures, "Unable to read supported Bedrock world metadata from the known save roots.");
};

/** Resolves the GEP-reported Bedrock save without retaining its local path. */
export const discoverBedrockWorldMetadata = async (_gameDirectory: unknown, worldFolder: unknown): Promise<DiscoveredWorldMetadata | null> => {
  const folder = safeWorldFolder(worldFolder);
  if (!folder || typeof overwolf === "undefined") return null;
  const localAppData = overwolf.io?.paths?.localAppData;
  if (typeof localAppData !== "string" || !localAppData) return null;
  const roamingAppData = localAppData.replace(/[\\/]Local[\\/]?$/i, "\\Roaming");
  const modernUsersRoot = `${roamingAppData}\\Minecraft Bedrock\\Users`;
  const users = (await listOverwolfDirectories(modernUsersRoot))
    .filter(name => name === "Shared" || /^\d{1,32}$/.test(name))
    .slice(0, MAX_USER_DIRECTORIES);
  const worldRoots = users.map(user => `${modernUsersRoot}\\${user}\\games\\com.mojang\\minecraftWorlds\\${folder}`);
  worldRoots.push(
    `${localAppData}\\Packages\\Microsoft.MinecraftUWP_8wekyb3d8bbwe\\LocalState\\games\\com.mojang\\minecraftWorlds\\${folder}`,
    `${localAppData}\\Packages\\Microsoft.MinecraftWindowsBeta_8wekyb3d8bbwe\\LocalState\\games\\com.mojang\\minecraftWorlds\\${folder}`,
  );
  return readFirstMetadata(worldRoots.flatMap(root => [`${root}\\level.dat`, `${root}\\level.dat_old`]));
};
