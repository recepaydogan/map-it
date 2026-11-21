export interface WorldMapSnapshotDetails {
  appName: string;
  worldName: string;
  edition: string;
  version: string;
  seed: string;
  dimension: string;
  centerX: number;
  centerZ: number;
  altitude: number;
  altitudeLabel?: string;
  contextLabel?: string;
  sourceLabel: string;
}

const safeName = (value: string) => value.normalize("NFKC").trim().replace(/[^\p{L}\p{N}]+/gu, "-")
  .replace(/^-+|-+$/g, "").slice(0, 80) || "world";

export const worldMapSnapshotFilename = (details: Pick<WorldMapSnapshotDetails,
  "worldName" | "edition" | "dimension" | "centerX" | "centerZ">): string =>
  `${safeName(details.worldName)}-${safeName(details.edition)}-${safeName(details.dimension)}-x${Math.round(details.centerX)}-z${Math.round(details.centerZ)}.png`;

const snapshotBlob = (canvas: HTMLCanvasElement): Promise<Blob> => new Promise((resolve, reject) =>
  canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Snapshot encoding returned no data.")), "image/png"));

/** Compose a private, local PNG from the renderer canvas only; DOM panels and the advertising rail are excluded. */
export const createWorldMapSnapshot = async (source: HTMLCanvasElement, details: WorldMapSnapshotDetails) => {
  if (!(source instanceof HTMLCanvasElement) || source.width < 1 || source.height < 1 ||
    ![details.centerX, details.centerZ, details.altitude].every(Number.isFinite)) throw new Error("Invalid map snapshot input.");
  const cssWidth = source.getBoundingClientRect().width || source.width;
  const scale = Math.max(1, Math.min(2, source.width / Math.max(1, cssWidth)));
  const footer = Math.round(92 * scale);
  const output = document.createElement("canvas");
  output.width = source.width; output.height = source.height + footer;
  if (output.width * output.height > 40_000_000) throw new Error("Map snapshot exceeds the pixel budget.");
  const context = output.getContext("2d", { alpha: false });
  if (!context) throw new Error("Snapshot drawing is unavailable.");
  context.drawImage(source, 0, 0);
  context.fillStyle = "#1a1611"; context.fillRect(0, source.height, output.width, footer);
  const x = Math.round(18 * scale), first = source.height + Math.round(24 * scale);
  context.textBaseline = "middle";
  context.fillStyle = "#d4af37"; context.font = `600 ${Math.round(13 * scale)}px Inter, sans-serif`;
  context.fillText(`${details.appName} · ${details.sourceLabel}`, x, first, output.width - x * 2);
  context.fillStyle = "#f0ede7"; context.font = `600 ${Math.round(12 * scale)}px Inter, sans-serif`;
  context.fillText(`${details.worldName} · ${details.edition} ${details.version} · ${details.dimension}`,
    x, first + Math.round(25 * scale), output.width - x * 2);
  context.fillStyle = "#cbbfa6"; context.font = `400 ${Math.round(11 * scale)}px Inter, sans-serif`;
  context.fillText(`Seed ${details.seed} · X ${Math.round(details.centerX)} · Z ${Math.round(details.centerZ)} · ${details.altitudeLabel ?? "Y"} ${Math.round(details.altitude)}${details.contextLabel ? ` · ${details.contextLabel}` : ""}`,
    x, first + Math.round(49 * scale), output.width - x * 2);
  return { blob: await snapshotBlob(output), filename: worldMapSnapshotFilename(details), width: output.width, height: output.height };
};

export const downloadWorldMapSnapshot = async (source: HTMLCanvasElement, details: WorldMapSnapshotDetails) => {
  const snapshot = await createWorldMapSnapshot(source, details);
  const url = URL.createObjectURL(snapshot.blob);
  try {
    const link = document.createElement("a");
    link.href = url; link.download = snapshot.filename; link.rel = "noopener";
    document.body.append(link); link.click(); link.remove();
  } finally { setTimeout(() => URL.revokeObjectURL(url), 0); }
  return snapshot;
};
