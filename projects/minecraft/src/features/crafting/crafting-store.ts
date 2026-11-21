import { useSyncExternalStore } from "react";
import { GAME_CONFIG } from "../../game-config";
import type { CraftingPlanState, CraftingPlanTarget, CraftingStockSnapshot } from "./crafting-types";

const STORAGE_KEY = `${GAME_CONFIG.storageNamespace}:crafting-helper:v1`;
const EVENT = `${GAME_CONFIG.storageNamespace}:crafting-helper-change`;
const EMPTY: CraftingPlanState = Object.freeze({ schemaVersion: 2, targetId: null, targets: [], stock: null });
let cachedRaw: string | null | undefined;
let cached: CraftingPlanState = EMPTY;

const sanitizeQuantity = (quantity: unknown) => Number.isSafeInteger(quantity)
  ? Math.min(9999, Math.max(1, Number(quantity))) : 1;

const sanitize = (value: unknown): CraftingPlanState => {
  if (!value || typeof value !== "object") return EMPTY;
  const input = value as Partial<CraftingPlanState> & { quantity?: number };
  const targetId = typeof input.targetId === "string" && input.targetId.length <= 256 ? input.targetId : null;
  const legacyQuantity = sanitizeQuantity(input.quantity);
  const candidates = Array.isArray(input.targets) ? input.targets : targetId ? [{ id: targetId, quantity: legacyQuantity }] : [];
  const seen = new Set<string>();
  const targets = candidates.flatMap((candidate): CraftingPlanTarget[] => {
    if (!candidate || typeof candidate !== "object") return [];
    const id = (candidate as Partial<CraftingPlanTarget>).id;
    if (typeof id !== "string" || !id || id.length > 256 || seen.has(id)) return [];
    seen.add(id);
    return [{ id, quantity: sanitizeQuantity((candidate as Partial<CraftingPlanTarget>).quantity) }];
  });
  return { schemaVersion: 2, targetId: targetId && seen.has(targetId) ? targetId : targets[0]?.id ?? null,
    targets, stock: input.stock?.schemaVersion === 1 ? input.stock : null };
};

const read = () => {
  if (typeof window === "undefined") return EMPTY;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === cachedRaw) return cached;
  cachedRaw = raw;
  try { cached = raw ? sanitize(JSON.parse(raw)) : EMPTY; }
  catch { cached = EMPTY; }
  return cached;
};

const write = (next: CraftingPlanState) => {
  const raw = JSON.stringify(next);
  window.localStorage.setItem(STORAGE_KEY, raw);
  cachedRaw = raw; cached = next;
  window.dispatchEvent(new Event(EVENT));
};

const subscribe = (listener: () => void) => {
  const local = () => listener();
  const storage = (event: StorageEvent) => { if (event.key === STORAGE_KEY) { cachedRaw = undefined; listener(); } };
  window.addEventListener(EVENT, local); window.addEventListener("storage", storage);
  return () => { window.removeEventListener(EVENT, local); window.removeEventListener("storage", storage); };
};

export const useCraftingPlan = () => useSyncExternalStore(subscribe, read, () => EMPTY);
export const setCraftingTarget = (targetId: string | null) => {
  const current = read();
  write({ ...current, targetId: targetId && current.targets.some(target => target.id === targetId) ? targetId : null });
};
export const addCraftingTarget = (targetId: string) => {
  const current = read();
  const targets = current.targets.some(target => target.id === targetId)
    ? current.targets : [...current.targets, { id: targetId, quantity: 1 }];
  write({ ...current, targetId, targets });
};
export const removeCraftingTarget = (targetId: string) => {
  const current = read();
  const removedIndex = current.targets.findIndex(target => target.id === targetId);
  const targets = current.targets.filter(target => target.id !== targetId);
  const nextIndex = Math.min(Math.max(removedIndex, 0), targets.length - 1);
  write({ ...current, targets, targetId: current.targetId === targetId ? targets[nextIndex]?.id ?? null : current.targetId });
};
export const setCraftingQuantity = (quantity: number) => {
  const current = read();
  if (!current.targetId) return;
  const nextQuantity = sanitizeQuantity(Math.floor(quantity || 1));
  write({ ...current, targets: current.targets.map(target => target.id === current.targetId
    ? { ...target, quantity: nextQuantity } : target) });
};
export const setCraftingStock = (stock: CraftingStockSnapshot | null) => write({ ...read(), stock });
