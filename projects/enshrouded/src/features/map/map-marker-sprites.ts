import type { getPointAppearance } from "./map-config";

export type MarkerAppearance = ReturnType<typeof getPointAppearance>;
export interface MarkerSpriteDefinition {
  key: string;
  templateKey: string;
  appearance: MarkerAppearance;
}

export const MARKER_SPRITE_SIZE = 36;
const SPRITE_OVERSAMPLE = 3;

export const getMarkerTemplateKey = (appearance: MarkerAppearance) =>
  `${appearance.markerClass}:${appearance.itemArt}:${appearance.icon.displayName}`;

export const getMarkerSpriteKey = (appearance: MarkerAppearance) =>
  `${getMarkerTemplateKey(appearance)}:${appearance.nativeIconPath ?? ""}`;

/** Each unique appearance is rasterized above its display size so larger map
 * markers retain the source image detail instead of upscaling a 36px sprite.
 * Templates supply the existing CSS colors and Lucide SVGs; no second palette
 * or icon registry needs to be maintained for the canvas renderer. */
export const createMarkerSprites = (
  templates: HTMLElement,
  definitions: MarkerSpriteDefinition[],
  pixelRatio: number,
  onChange: () => void,
) => {
  const sprites = new Map<string, HTMLCanvasElement>();
  const images = new Map<string, Promise<HTMLImageElement | null>>();
  let disposed = false;
  const loadImage = (source: string) => {
    const cached = images.get(source);
    if (cached) return cached;
    const image = new Image();
    const remote = /^https?:\/\//.test(source);
    if (remote) image.crossOrigin = "anonymous";
    // Keep canvas requests separate from earlier non-CORS <img> cache entries.
    const requestSource = remote
      ? `${source}${source.includes("?") ? "&" : "?"}marker-sprite=1`
      : source;
    const request = new Promise<HTMLImageElement | null>((resolve) => {
      image.onload = () => resolve(image);
      image.onerror = () => {
        console.warn("Map marker image could not be loaded; using its fallback icon.", source);
        resolve(null);
      };
      image.src = requestSource;
    });
    images.set(source, request);
    return request;
  };

  const styles = new Map<string, { fallback: string; imageScale: number }>();
  for (const element of templates.querySelectorAll<HTMLElement>("[data-marker-template]")) {
    const style = getComputedStyle(element);
    const svg = element.querySelector("svg")!.cloneNode(true) as SVGElement;
    svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    svg.setAttribute("color", style.color);
    const imageStyle = getComputedStyle(element.querySelector("img")!);
    styles.set(element.dataset.markerTemplate!, {
      fallback: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`,
      imageScale: imageStyle.transform === "none" ? 1 : new DOMMatrixReadOnly(imageStyle.transform).a,
    });
  }

  for (const definition of definitions) {
    const style = styles.get(definition.templateKey)!;
    const transport = definition.appearance.markerClass.split(" ").includes("map-marker-transport");
    const questArtwork = definition.appearance.markerClass.split(" ").includes("map-marker-quest");
    const repeatableQuest = definition.appearance.markerClass.split(" ").includes("map-marker-repeatable-quest");
    const lore = definition.appearance.markerClass.split(" ").includes("map-marker-lore");
    const compactArtwork = definition.appearance.markerClass.split(" ").some((name) =>
      name === "map-marker-mapgenie" || name === "map-service-art" || name === "map-place-art");
    const canvas = document.createElement("canvas");
    const rasterScale = pixelRatio * SPRITE_OVERSAMPLE;
    canvas.width = canvas.height = Math.ceil(MARKER_SPRITE_SIZE * rasterScale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not create a marker sprite canvas.");
    context.scale(rasterScale, rasterScale);
    sprites.set(definition.key, canvas);
    const native = definition.appearance.nativeIconPath;
    void loadImage(native ?? style.fallback).then(async (loaded) => {
      const image = loaded ?? (native ? await loadImage(style.fallback) : null);
      if (disposed || !image) return;
      const size = (questArtwork ? 36 : definition.appearance.itemArt ? 22 : 18)
        * (native && loaded ? style.imageScale : 1);
      const scale = size / Math.max(image.naturalWidth, image.naturalHeight);
      const width = image.naturalWidth * scale;
      const height = image.naturalHeight * scale;
      if (native && loaded && style.imageScale > 1 && !compactArtwork) {
        // Match the DOM marker's circular image clip without clipping its label.
        context.save();
        context.beginPath();
        context.arc(MARKER_SPRITE_SIZE / 2, MARKER_SPRITE_SIZE / 2, size * 0.45, 0, Math.PI * 2);
        context.clip();
      }
      context.filter = "brightness(1.16) saturate(1.08)";
      context.drawImage(image, (MARKER_SPRITE_SIZE - width) / 2,
        (MARKER_SPRITE_SIZE - height) / 2 - (transport ? 2 : 0), width, height);
      context.filter = "none";
      if (lore) {
        context.globalCompositeOperation = "source-in";
        context.fillStyle = "#b88ae7";
        context.fillRect(0, 0, MARKER_SPRITE_SIZE, MARKER_SPRITE_SIZE);
        context.globalCompositeOperation = "destination-over";
        context.fillStyle = "#fff";
        context.fillRect((MARKER_SPRITE_SIZE - width) / 2 + width * 0.45,
          (MARKER_SPRITE_SIZE - height) / 2 + height * 0.275,
          width * 0.175, height * 0.4);
        context.globalCompositeOperation = "source-over";
      }
      if (native && loaded && style.imageScale > 1 && !compactArtwork) context.restore();
      if (repeatableQuest) {
        context.globalCompositeOperation = "source-in";
        context.fillStyle = "#df443f";
        context.fillRect(0, 0, MARKER_SPRITE_SIZE, MARKER_SPRITE_SIZE);
        context.globalCompositeOperation = "source-over";
      }
      onChange();
    });
  }
  return { sprites, dispose: () => { disposed = true; } };
};
