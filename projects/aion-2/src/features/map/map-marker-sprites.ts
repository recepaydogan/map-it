import type { getPointAppearance } from "./map-config";
import { getMapMarkerIconSize } from "./map-marker-icon-size";
import { readMarkerAlpha, type MarkerAlphaMask } from "./map-marker-alpha";

export type MarkerAppearance = ReturnType<typeof getPointAppearance>;
export interface MarkerSpriteDefinition {
  key: string;
  templateKey: string;
  appearance: MarkerAppearance;
  renderScale: number;
}

// Leave room for native artwork that extends beyond the 32px marker box.
export const MARKER_SPRITE_SIZE = 48;

export const getMarkerTemplateKey = (appearance: MarkerAppearance) =>
  `${appearance.markerClass}:${appearance.markerSize ?? 32}:${appearance.itemArt}:${appearance.icon.displayName}`;

export const getMarkerSpriteKey = (appearance: MarkerAppearance) =>
  `${getMarkerTemplateKey(appearance)}:${appearance.nativeIconPath ?? ""}`;

/** Each unique appearance is rasterized at its largest on-screen scale.
 * Templates supply the existing CSS colors and Lucide SVGs; no second palette
 * or icon registry needs to be maintained for the canvas renderer. */
export const createMarkerSprites = (
  templates: HTMLElement,
  definitions: MarkerSpriteDefinition[],
  pixelRatio: number,
  onChange: () => void,
) => {
  const sprites = new Map<string, HTMLCanvasElement>();
  const masks = new Map<string, MarkerAlphaMask>();
  const images = new Map<string, Promise<HTMLImageElement | null>>();
  let disposed = false;
  const loadImage = (source: string) => {
    const cached = images.get(source);
    if (cached) return cached;
    const image = new Image();
    const remote = /^https?:\/\//.test(source);
    if (remote) image.crossOrigin = "anonymous";
    const request = new Promise<HTMLImageElement | null>((resolve) => {
      image.onload = () => resolve(image);
      image.onerror = () => {
        console.warn("Map marker image could not be loaded; using its fallback icon.", source);
        resolve(null);
      };
      if (remote) {
        // Keep canvas requests separate from images cached without a CORS Origin.
        const url = new URL(source);
        url.searchParams.set("canvas-cors", "1");
        image.src = url.href;
      } else {
        image.src = source;
      }
    });
    images.set(source, request);
    return request;
  };

  const styles = new Map<string, {
    background: string; border: string; radius: number; fallback: string; fallbackScale: number; imageScale: number; markerSize: number;
  }>();
  for (const element of templates.querySelectorAll<HTMLElement>("[data-marker-template]")) {
    const style = getComputedStyle(element);
    const sourceSvg = element.querySelector("svg")!;
    const svgStyle = getComputedStyle(sourceSvg);
    const svg = sourceSvg.cloneNode(true) as SVGElement;
    svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    svg.setAttribute("color", style.color);
    const imageStyle = getComputedStyle(element.querySelector("img")!);
    styles.set(element.dataset.markerTemplate!, {
      background: style.backgroundColor,
      border: style.borderTopColor,
      radius: Math.min(16, parseFloat(style.borderTopLeftRadius) || 0),
      fallback: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`,
      fallbackScale: svgStyle.transform === "none" ? 1 : new DOMMatrixReadOnly(svgStyle.transform).a,
      imageScale: imageStyle.transform === "none" ? 1 : new DOMMatrixReadOnly(imageStyle.transform).a,
      markerSize: parseFloat(style.width),
    });
  }

  for (const definition of definitions) {
    const style = styles.get(definition.templateKey)!;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = Math.ceil(MARKER_SPRITE_SIZE * pixelRatio * definition.renderScale);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Could not create a marker sprite canvas.");
    context.scale(pixelRatio * definition.renderScale, pixelRatio * definition.renderScale);
    const roundedFill = (baseInset: number, radius: number, fill: string) => {
      const inset = baseInset + (MARKER_SPRITE_SIZE - style.markerSize) / 2;
      const end = MARKER_SPRITE_SIZE - inset;
      radius = Math.min(radius, (end - inset) / 2);
      context.fillStyle = fill;
      context.beginPath();
      context.moveTo(inset + radius, inset);
      context.lineTo(end - radius, inset);
      context.quadraticCurveTo(end, inset, end, inset + radius);
      context.lineTo(end, end - radius);
      context.quadraticCurveTo(end, end, end - radius, end);
      context.lineTo(inset + radius, end);
      context.quadraticCurveTo(inset, end, inset, end - radius);
      context.lineTo(inset, inset + radius);
      context.quadraticCurveTo(inset, inset, inset + radius, inset);
      context.closePath();
      context.fill();
    };
    const drawBadge = () => {
      roundedFill(1, style.radius + 1, "rgba(12, 14, 12, 0.72)");
      roundedFill(2, style.radius, style.border);
      roundedFill(4, Math.max(0, style.radius - 2), style.background);
    };
    const native = definition.appearance.nativeIconPath;
    if (!native) drawBadge();
    sprites.set(definition.key, canvas);
    if (!native) masks.set(definition.key, readMarkerAlpha(canvas));
    void loadImage(native ?? style.fallback).then(async (loaded) => {
      const image = loaded ?? (native ? await loadImage(style.fallback) : null);
      if (disposed || !image) return;
      context.clearRect(0, 0, MARKER_SPRITE_SIZE, MARKER_SPRITE_SIZE);
      if (!native || !loaded) drawBadge();
      const size = getMapMarkerIconSize(style.markerSize, definition.appearance.itemArt)
        * (native && loaded ? style.imageScale : style.fallbackScale);
      const scale = size / Math.max(image.naturalWidth, image.naturalHeight);
      const width = image.naturalWidth * scale;
      const height = image.naturalHeight * scale;
      if (native && loaded) {
        const hitCanvas = document.createElement("canvas");
        hitCanvas.width = hitCanvas.height = canvas.width;
        const hitContext = hitCanvas.getContext("2d", { willReadFrequently: true });
        if (!hitContext) throw new Error("Could not create a marker silhouette canvas.");
        hitContext.scale(pixelRatio * definition.renderScale, pixelRatio * definition.renderScale);
        hitContext.drawImage(image, (MARKER_SPRITE_SIZE - width) / 2, (MARKER_SPRITE_SIZE - height) / 2, width, height);
        masks.set(definition.key, readMarkerAlpha(hitCanvas));
      }
      if (native && loaded) {
        context.shadowColor = "rgba(0, 0, 0, 0.9)";
        context.shadowBlur = 3;
        context.shadowOffsetY = 1;
      }
      context.drawImage(image, (MARKER_SPRITE_SIZE - width) / 2, (MARKER_SPRITE_SIZE - height) / 2, width, height);
      context.shadowColor = "transparent";
      context.shadowBlur = 0;
      context.shadowOffsetY = 0;
      if (!native || !loaded) masks.set(definition.key, readMarkerAlpha(canvas));
      onChange();
    });
  }
  return { sprites, masks, dispose: () => { disposed = true; } };
};
