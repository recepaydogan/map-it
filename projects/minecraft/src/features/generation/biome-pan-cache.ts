import type { BiomeCamera } from "./biome-viewport.ts";

export interface PanFrame extends BiomeCamera {
  width: number; height: number; ratio: number; blockY: number;
}
export interface PanStrip { x: number; y: number; width: number; height: number }

/** Overlap by one backing pixel so fractional translations cannot leave a seam. */
export const exposedPanStrips = (width: number, height: number, x: number, y: number, ratio: number): PanStrip[] => {
  const strips: PanStrip[] = [], edge = 1 / ratio;
  if (x > 0) strips.push({ x: 0, y: 0, width: Math.min(width, x + edge), height });
  if (x < 0) strips.push({ x: Math.max(0, width + x - edge), y: 0, width: Math.min(width, -x + edge), height });
  if (y > 0) strips.push({ x: 0, y: 0, width, height: Math.min(height, y + edge) });
  if (y < 0) strips.push({ x: 0, y: Math.max(0, height + y - edge), width, height: Math.min(height, -y + edge) });
  return strips;
};

/** Reuse terrain pixels during a manual drag; rebuild from tiles at bounded intervals. */
export const createBiomePanCache = (canvas: HTMLCanvasElement) => {
  let previous: PanFrame | null = null;
  let snapshot: HTMLCanvasElement | null = null;
  const clear = () => { snapshot = null; previous = null; };
  return {
    prepare(view: PanFrame, dragging: boolean) {
      if (!dragging || !previous || view.zoom !== previous.zoom || view.blockY !== previous.blockY
        || view.width !== previous.width || view.height !== previous.height || view.ratio !== previous.ratio) {
        clear(); return null;
      }
      const x = (previous.x - view.x) * view.zoom, y = (previous.z - view.z) * view.zoom;
      // Rebase from original tiles, never repeatedly resample the shifted bitmap.
      if (Math.abs(x) > view.width / 3 || Math.abs(y) > view.height / 3) { clear(); return null; }
      if (!snapshot) {
        snapshot = document.createElement("canvas");
        snapshot.width = canvas.width; snapshot.height = canvas.height;
        const context = snapshot.getContext("2d", { alpha: false });
        if (!context) throw new Error("Pan snapshot canvas unavailable");
        context.drawImage(canvas, 0, 0);
      }
      return { canvas: snapshot, x, y, strips: exposedPanStrips(view.width, view.height, x, y, view.ratio) };
    },
    complete(view: PanFrame, reused: boolean) {
      if (!reused) { snapshot = null; previous = { ...view }; }
    },
    clear,
  };
};
