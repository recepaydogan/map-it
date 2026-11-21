export interface MarkerAlphaMask {
  width: number;
  height: number;
  alpha: Uint8Array;
}

const HIT_ALPHA = 32;
const ART_MASK_SIZE = 64;

export const markerAlphaAt = (mask: MarkerAlphaMask, x: number, y: number) => {
  const column = Math.floor(x);
  const row = Math.floor(y);
  return column >= 0 && row >= 0 && column < mask.width && row < mask.height
    && mask.alpha[row * mask.width + column]! >= HIT_ALPHA;
};

export const readMarkerAlpha = (canvas: HTMLCanvasElement): MarkerAlphaMask => {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Could not read the map marker silhouette.");
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const alpha = new Uint8Array(canvas.width * canvas.height);
  for (let i = 0; i < alpha.length; i += 1) alpha[i] = pixels[i * 4 + 3]!;
  return { width: canvas.width, height: canvas.height, alpha };
};

/** An SVG path can receive pointer events only on the visible image pixels. */
export const markerAlphaPath = (mask: MarkerAlphaMask) => {
  const rows: string[] = [];
  for (let y = 0; y < mask.height; y += 1) {
    for (let x = 0; x < mask.width;) {
      if (!markerAlphaAt(mask, x, y)) { x += 1; continue; }
      const start = x;
      while (x < mask.width && markerAlphaAt(mask, x, y)) x += 1;
      rows.push(`M${start} ${y}h${x - start}v1h${start - x}z`);
    }
  }
  return rows.join("");
};

const artPaths = new Map<string, Promise<string>>();
export const loadMarkerArtPath = (source: string) => {
  let request = artPaths.get(source);
  if (request) return request;
  request = new Promise<string>((resolve, reject) => {
    const image = new Image();
    const remote = /^https?:\/\//.test(source);
    if (remote) image.crossOrigin = "anonymous";
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = ART_MASK_SIZE;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("Could not rasterize the map marker silhouette.");
        const scale = ART_MASK_SIZE / Math.max(image.naturalWidth, image.naturalHeight);
        const width = image.naturalWidth * scale;
        const height = image.naturalHeight * scale;
        context.drawImage(image, (ART_MASK_SIZE - width) / 2, (ART_MASK_SIZE - height) / 2, width, height);
        resolve(markerAlphaPath(readMarkerAlpha(canvas)));
      } catch (error) { reject(error); }
    };
    image.onerror = () => reject(new Error(`Could not load map marker silhouette: ${source}`));
    if (remote) {
      const url = new URL(source);
      url.searchParams.set("canvas-cors", "1");
      image.src = url.href;
    } else image.src = source;
  }).catch((error: unknown) => { artPaths.delete(source); throw error; });
  artPaths.set(source, request);
  return request;
};
