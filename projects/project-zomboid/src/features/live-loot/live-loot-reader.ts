import { startLiveBridgeFileReader } from "../live-bridge/live-bridge-file-reader";
import { clearLiveLoot, publishLiveLoot } from "./live-loot-store";
import type { LiveLootContainer, LiveLootItem, LiveLootSnapshot } from "./live-loot-types";

const BRIDGE_FILE = "PZInteractiveMap\\loot-snapshot.json";
/** Loot is a panel, not motion: read it at a rate that suits what it feeds. */
const READ_INTERVAL_MS = 4_000;
const MAX_CONTAINERS = 100_000;
const MAX_ITEMS_PER_CONTAINER = 10_000;

interface BridgeLootPayload {
  version?: unknown;
  sequence?: unknown;
  updatedAt?: unknown;
  containers?: unknown;
}

const finiteNumber = (value: unknown, maximum: number) =>
  typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= maximum;

const parseItem = (value: unknown): LiveLootItem | null => {
  if (!value || typeof value !== "object") return null;
  const item = value as { id?: unknown; count?: unknown };
  if (typeof item.id !== "string" || item.id.length === 0 || item.id.length > 200) return null;
  if (!Number.isInteger(item.count) || !finiteNumber(item.count, 1_000_000) || Number(item.count) < 1) return null;
  return { id: item.id, count: Number(item.count) };
};

const parseContainer = (value: unknown): LiveLootContainer | null => {
  if (!value || typeof value !== "object") return null;
  const container = value as Record<string, unknown>;
  if (typeof container.id !== "string" || container.id.length === 0 || container.id.length > 300) return null;
  if (!finiteNumber(container.x, 100_000) || !finiteNumber(container.y, 100_000)) return null;
  if (!finiteNumber(container.z, 32)) return null;
  if (typeof container.type !== "string" || container.type.length > 200) return null;
  if (typeof container.room !== "string" || container.room.length > 200) return null;
  if (!Array.isArray(container.items) || container.items.length > MAX_ITEMS_PER_CONTAINER) return null;

  const items = container.items.map(parseItem);
  if (items.some((item) => !item)) return null;
  return {
    id: container.id,
    x: Number(container.x),
    y: Number(container.y),
    z: Number(container.z),
    type: container.type,
    room: container.room,
    items: items as LiveLootItem[],
  };
};

const parseBridgePayload = (content: string): Omit<LiveLootSnapshot, "receivedAt"> | null => {
  try {
    const payload = JSON.parse(content) as BridgeLootPayload;
    if (payload.version !== 1
      || !Number.isInteger(payload.sequence)
      || !finiteNumber(payload.sequence, Number.MAX_SAFE_INTEGER)
      || !finiteNumber(payload.updatedAt, Number.MAX_SAFE_INTEGER)
      || !Array.isArray(payload.containers)
      || payload.containers.length > MAX_CONTAINERS) return null;

    const containers = payload.containers.map(parseContainer);
    if (containers.some((container) => !container)) return null;
    return {
      version: 1,
      sequence: Number(payload.sequence),
      updatedAt: Number(payload.updatedAt),
      containers: containers as LiveLootContainer[],
    };
  } catch {
    return null;
  }
};

export const startLiveLootReader = () => startLiveBridgeFileReader({
  relativePath: BRIDGE_FILE,
  readIntervalMs: READ_INTERVAL_MS,
  parse: parseBridgePayload,
  getSequence: ({ sequence }) => sequence,
  publish: (payload) => publishLiveLoot({ ...payload, receivedAt: Date.now() }),
  clear: clearLiveLoot,
});
