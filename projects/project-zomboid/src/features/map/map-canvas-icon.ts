import { useEffect, useState } from "react";

/**
 * The in-game map symbols are white line art on transparency. Overlay pins are
 * pale, category-tinted discs, so the glyph has to be re-inked dark to read on
 * them — the same contrast the white-on-dark marker pins get, inverted.
 */
const INK = "rgba(18, 15, 10, 0.9)";

const tintCache = new Map<string, HTMLCanvasElement>();
const loaderCache = new Map<string, Promise<HTMLCanvasElement | null>>();

const tintToInk = (image: HTMLImageElement) => {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.drawImage(image, 0, 0);
  // Keeps the glyph's alpha, replaces its colour.
  context.globalCompositeOperation = "source-in";
  context.fillStyle = INK;
  context.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
};

const loadInkedIcon = (source: string) => {
  const cached = loaderCache.get(source);
  if (cached) return cached;
  const loading = new Promise<HTMLCanvasElement | null>((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.addEventListener("load", () => {
      const tinted = tintToInk(image);
      if (tinted) tintCache.set(source, tinted);
      resolve(tinted);
    });
    image.addEventListener("error", () => resolve(null));
    image.src = source;
  });
  loaderCache.set(source, loading);
  return loading;
};

/**
 * Ink-tinted, canvas-ready copy of a native map icon. Null until it has loaded,
 * so a layer draws its pins without a glyph on the first frame and repaints on
 * its own once the icon arrives.
 */
export const useCanvasIcon = (source: string) => {
  const [icon, setIcon] = useState<HTMLCanvasElement | null>(() => tintCache.get(source) ?? null);

  useEffect(() => {
    let active = true;
    // Always resolved through the loader: an already-tinted icon comes back from
    // its settled promise, so this never sets state synchronously.
    void loadInkedIcon(source).then((loaded) => {
      if (active) setIcon(loaded);
    });
    return () => { active = false; };
  }, [source]);

  return icon;
};

/** Centres the glyph inside a pin disc, sized so it never touches the ring. */
export const drawCanvasIcon = (
  context: CanvasRenderingContext2D,
  icon: HTMLCanvasElement,
  left: number,
  top: number,
  size: number,
) => {
  context.drawImage(icon, left - size / 2, top - size / 2, size, size);
};
