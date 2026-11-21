export const MAP_WINDOW_COMMAND_MESSAGE_ID = "map-window-command";

export interface MapZoomCommand {
  readonly type: "zoom";
  readonly direction: "in" | "out";
  readonly revision: number;
}

export interface MapCenterCommand {
  readonly type: "center";
  readonly x: number;
  readonly z: number;
  readonly revision: number;
}

export type MapWindowCommand = MapZoomCommand | MapCenterCommand;
export type MapWindowCommandPayload = Omit<MapZoomCommand, "revision"> | Omit<MapCenterCommand, "revision">;

export const parseMapWindowCommand = (value: unknown): MapWindowCommandPayload | null => {
  if (!value || typeof value !== "object") return null;
  const candidate = value as { type?: unknown; direction?: unknown; x?: unknown; z?: unknown };
  if (candidate.type === "zoom" && (candidate.direction === "in" || candidate.direction === "out"))
    return Object.freeze({ type: "zoom", direction: candidate.direction });
  return candidate.type === "center" && Number.isFinite(candidate.x) && Number.isFinite(candidate.z)
    ? Object.freeze({ type: "center", x: Number(candidate.x), z: Number(candidate.z) }) : null;
};
