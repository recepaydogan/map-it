import { NbtByte, NbtCompound, NbtInt, NbtList, NbtShort, NbtString } from "deepslate/nbt";
import { GAME_REGION_COMPRESSION } from "../../game-config.ts";
import { decompressBounded } from "../terrain/decompress-bounded.ts";
import { readBoundedNbt } from "../terrain/read-bounded-nbt.ts";
import { parseRegionSnapshotName, REGION_SNAPSHOT_BYTE_LIMIT } from "../terrain/region-snapshot-plan.ts";
import { readSectorRegion } from "../terrain/read-sector-region.ts";
import type { CraftingStockSnapshot } from "./crafting-types.ts";

const MAX_REGION_FILES = 8;
const MAX_CHUNKS = 256;
const MAX_LEVEL_BYTES = 8 * 1024 * 1024;

const add = (stock: Record<string, number>, id: string, count: number) => {
  if (!/^[a-z0-9_.-]+:[A-Za-z0-9_./-]+$/.test(id) || !Number.isSafeInteger(count) || count < 1 || count > 65536) return;
  stock[id] = Math.min(Number.MAX_SAFE_INTEGER, (stock[id] ?? 0) + count);
};

const numberTag = (compound: NbtCompound, ...keys: string[]) => {
  for (const key of keys) {
    const value = compound.get(key);
    if (value instanceof NbtByte || value instanceof NbtShort || value instanceof NbtInt) return value.getAsNumber();
  }
  return 0;
};

const readItems = (owner: NbtCompound, stock: Record<string, number>) => {
  const tag = owner.get("Items") ?? owner.get("items") ?? owner.get("Inventory") ?? owner.get("inventory");
  if (!(tag instanceof NbtList) || tag.getType() !== 10 || tag.length > 4096) return;
  for (const entry of tag.getItems()) {
    if (!(entry instanceof NbtCompound)) continue;
    const id = entry.get("id");
    if (id instanceof NbtString) add(stock, id.getAsString(), numberTag(entry, "count", "Count"));
  }
};

const parseDocument = (bytes: Uint8Array) => readBoundedNbt(bytes, {
  littleEndian: false, stringEncoding: "modified-utf-8", maxBytes: 16 * 1024 * 1024,
  maxElements: 524288, maxStringBytes: 2 * 1024 * 1024,
}).root;

const readCompressedNbt = async (file: File) => {
  if (file.size < 2 || file.size > MAX_LEVEL_BYTES) throw new Error("Player data file is outside the supported size limit.");
  return parseDocument(await decompressBounded(new Uint8Array(await file.arrayBuffer()), "gzip", {
    maxInputBytes: MAX_LEVEL_BYTES, maxOutputBytes: 16 * 1024 * 1024,
  }));
};

const relative = (file: File) => (file.webkitRelativePath || file.name).replaceAll("\\", "/").split("/").filter(Boolean);
const exactRootFile = (file: File, name: string) => {
  const parts = relative(file);
  return parts.length === 2 && parts[1].toLocaleLowerCase("en-US") === name;
};

export const readJavaWorldStock = async (files: FileList | readonly File[], worldId: string): Promise<CraftingStockSnapshot> => {
  const inventory = Array.from(files);
  if (!inventory.length || inventory.length > 65_536) throw new Error("Choose one bounded Java world folder.");
  const level = inventory.find(file => exactRootFile(file, "level.dat"));
  if (!level) throw new Error("The selected folder has no root level.dat file.");
  const levelRoot = await readCompressedNbt(level);
  const data = levelRoot.hasCompound("Data") ? levelRoot.getCompound("Data") : levelRoot;
  const player: Record<string, number> = {}, enderChest: Record<string, number> = {}, containers: Record<string, number> = {};
  let playerRoot = data.hasCompound("Player") ? data.getCompound("Player") : null;
  if (!playerRoot) {
    const candidates = inventory.filter(file => {
      const path = relative(file).map(part => part.toLocaleLowerCase("en-US"));
      return path.length === 3 && path[1] === "playerdata" && path[2].endsWith(".dat");
    }).sort((left, right) => right.lastModified - left.lastModified);
    if (candidates[0]) playerRoot = await readCompressedNbt(candidates[0]);
  }
  if (playerRoot) {
    readItems(playerRoot, player);
    const ender = playerRoot.get("EnderItems") ?? playerRoot.get("ender_items");
    if (ender instanceof NbtList && ender.getType() === 10) {
      const wrapper = new NbtCompound(new Map([["Items", ender]]));
      readItems(wrapper, enderChest);
    }
  }

  const regionFiles = inventory.filter(file => {
    const path = relative(file);
    return path.length === 3 && path[1].toLocaleLowerCase("en-US") === "region" && parseRegionSnapshotName(file.name)
      && file.size >= 8192 && file.size <= REGION_SNAPSHOT_BYTE_LIMIT;
  }).sort((left, right) => right.lastModified - left.lastModified);
  let chunks = 0, scannedContainers = 0;
  for (const file of regionFiles.slice(0, MAX_REGION_FILES)) {
    const coordinates = parseRegionSnapshotName(file.name)!;
    const payloads = readSectorRegion(new Uint8Array(await file.arrayBuffer()), coordinates.regionX, coordinates.regionZ);
    for (const payload of payloads) {
      if (!payload || payload.external || chunks++ >= MAX_CHUNKS) continue;
      const compression = GAME_REGION_COMPRESSION[payload.compressionId as keyof typeof GAME_REGION_COMPRESSION];
      if (!compression) continue;
      const root = parseDocument(await decompressBounded(payload.data, compression, {
        maxInputBytes: 8 * 1024 * 1024, maxOutputBytes: 16 * 1024 * 1024,
      }));
      const chunk = root.hasCompound("Level") ? root.getCompound("Level") : root;
      const entities = chunk.get("block_entities") ?? chunk.get("TileEntities");
      if (!(entities instanceof NbtList) || entities.getType() !== 10 || entities.length > 8192) continue;
      for (const entity of entities.getItems()) if (entity instanceof NbtCompound) {
        const before = Object.values(containers).reduce((sum, count) => sum + count, 0);
        readItems(entity, containers);
        const after = Object.values(containers).reduce((sum, count) => sum + count, 0);
        if (after > before) scannedContainers++;
      }
    }
    if (chunks >= MAX_CHUNKS) break;
  }
  return { schemaVersion: 1, worldId, updatedAt: Date.now(), player, enderChest, containers,
    scannedRegionFiles: Math.min(MAX_REGION_FILES, regionFiles.length), availableRegionFiles: regionFiles.length, scannedContainers };
};
