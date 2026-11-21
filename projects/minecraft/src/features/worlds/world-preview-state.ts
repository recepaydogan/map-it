export type WorldPreviewState =
  | { mode: "linked" }
  | { mode: "detached"; worldId: string };

export const LINKED_WORLD_PREVIEW: WorldPreviewState = Object.freeze({ mode: "linked" });

const validWorldId = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 256;

export const parseWorldPreviewState = (value: unknown): WorldPreviewState => {
  if (!value || typeof value !== "object" || !("mode" in value)) return LINKED_WORLD_PREVIEW;
  if (value.mode === "linked") return LINKED_WORLD_PREVIEW;
  if (value.mode === "detached" && "worldId" in value && validWorldId(value.worldId))
    return Object.freeze({ mode: "detached", worldId: value.worldId });
  return LINKED_WORLD_PREVIEW;
};

export const readWorldPreviewState = (storage: Pick<Storage, "getItem">, key: string): WorldPreviewState => {
  if (!key) throw new Error("Invalid world-preview storage key");
  const raw = storage.getItem(key);
  if (raw === null) return LINKED_WORLD_PREVIEW;
  try { return parseWorldPreviewState(JSON.parse(raw)); }
  catch { return LINKED_WORLD_PREVIEW; }
};

export const writeWorldPreviewState = (storage: Pick<Storage, "setItem" | "removeItem">, key: string,
  state: WorldPreviewState): void => {
  if (!key) throw new Error("Invalid world-preview storage key");
  const normalized = parseWorldPreviewState(state);
  if (normalized.mode === "linked") storage.removeItem(key);
  else storage.setItem(key, JSON.stringify(normalized));
};

/** A detached selection is valid only while its exact library record still exists. */
export const resolveWorldPreview = (state: WorldPreviewState, linkedWorldId: string | null,
  availableWorldIds: readonly string[]): { state: WorldPreviewState; worldId: string | null; detached: boolean } => {
  const ids = new Set(availableWorldIds.filter(validWorldId));
  if (state.mode === "detached" && ids.has(state.worldId))
    return { state, worldId: state.worldId, detached: true };
  return { state: LINKED_WORLD_PREVIEW, worldId: linkedWorldId !== null && ids.has(linkedWorldId) ? linkedWorldId : null, detached: false };
};
