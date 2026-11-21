export type InfoFields = Record<string, unknown>;

export const asRecord = (value: unknown): InfoFields | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as InfoFields : null;

export const decodeRecord = (value: unknown): InfoFields | null => {
  if (typeof value !== "string") return asRecord(value);
  try { return asRecord(JSON.parse(value)); } catch { return null; }
};

/** Normalize both documented info snapshots and flat feature/category updates. */
export const getGepFields = (packet: unknown): { game: InfoFields; match: InfoFields } | null => {
  const root = asRecord(packet);
  if (!root) return null;
  if (typeof root.key === "string") {
    const category = root.category ?? root.feature;
    const fields = { [root.key]: root.value !== undefined ? root.value : root.data };
    if (category === "game_info") return { game: fields, match: {} };
    if (category === "match_info") return { game: {}, match: fields };
    return null;
  }
  const info = asRecord(root.info) ?? root;
  const game = asRecord(info.game_info);
  const match = asRecord(info.match_info);
  if (!game && !match) return null;
  return { game: game ?? {}, match: match ?? {} };
};

/** Never persist unrelated provider fields (chat, statistics, or local paths). */
export const readShortString = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 && value.length <= 512 ? value : null;
