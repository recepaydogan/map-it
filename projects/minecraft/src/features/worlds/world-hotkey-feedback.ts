export const WORLD_HOTKEY_FEEDBACK_MESSAGE_ID = "world-hotkey-feedback";

export type WorldHotkeyFeedback =
  | Readonly<{ type: "pin"; status: "saved"; x: number; y: number; z: number }>
  | Readonly<{ type: "pin"; status: "unavailable" | "limit" | "failed" }>
  | Readonly<{ type: "minimap"; status: "unavailable" }>;

const coordinate = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 30_000_000;

export const parseWorldHotkeyFeedback = (value: unknown): WorldHotkeyFeedback | null => {
  if (!value || typeof value !== "object") return null;
  const candidate = value as { type?: unknown; status?: unknown; x?: unknown; y?: unknown; z?: unknown };
  if (candidate.type === "pin" && candidate.status === "saved" && coordinate(candidate.x) && coordinate(candidate.y) && coordinate(candidate.z))
    return Object.freeze({ type: "pin", status: "saved", x: candidate.x, y: candidate.y, z: candidate.z });
  if (candidate.type === "pin" && ["unavailable", "limit", "failed"].includes(String(candidate.status)))
    return Object.freeze({ type: "pin", status: candidate.status as "unavailable" | "limit" | "failed" });
  if (candidate.type === "minimap" && candidate.status === "unavailable")
    return Object.freeze({ type: "minimap", status: "unavailable" });
  return null;
};
