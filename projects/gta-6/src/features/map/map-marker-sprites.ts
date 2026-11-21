import type { getPointAppearance } from "./map-config";
import { MAP_ARTWORK_ICON_SIZE } from "./map-marker-zoom.ts";

export type MarkerAppearance = ReturnType<typeof getPointAppearance>;
export interface MarkerSpriteDefinition {
  key: string;
  templateKey: string;
  appearance: MarkerAppearance;
}

export const MARKER_SPRITE_SIZE = 36;

export const getMarkerTemplateKey = (appearance: MarkerAppearance) =>
  `${appearance.markerClass}:${appearance.itemArt}:${appearance.icon.displayName}`;

export const getMarkerSpriteKey = (appearance: MarkerAppearance) =>
  `${getMarkerTemplateKey(appearance)}:${appearance.nativeIconPath ?? ""}`;

/** Each unique appearance is rasterized once at the current device scale.
 * Templates supply the existing CSS colors and Lucide SVGs; no second palette
 * or icon registry needs to be maintained for the canvas renderer. */
export const createMarkerSprites = (
  templates: HTMLElement,
  definitions: MarkerSpriteDefinition[],
  pixelRatio: number,
  onChange: () => void,
) => {
  // Retain enough source pixels for the marker-size control's 200% setting.
  // These tiny textures are shared by every point with the same artwork.
  const rasterScale = Math.max(4, pixelRatio * 2);
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

  const update = (definitions: MarkerSpriteDefinition[]) => {
    // Keep both loaded artwork and in-flight image requests across point-list
    // refreshes. Replacing these canvases briefly draws empty pins on every sync.
    const missing = definitions.filter(({ key }) => !sprites.has(key));
    if (disposed || !missing.length) return;
    const styles = new Map<string, {
      background: string; border: string; radius: number; fallback: string; imageScale: number; imageFilter: string;
      badgeBackground: string; badgeSize: number; badgeRadius: number;
    }>();
    for (const element of templates.querySelectorAll<HTMLElement>("[data-marker-template]")) {
      const style = getComputedStyle(element);
      const svg = element.querySelector("svg")!.cloneNode(true) as SVGElement;
      svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      svg.setAttribute("color", style.color);
      const imageStyle = getComputedStyle(element.querySelector("img")!);
      const badgeStyle = getComputedStyle(element, "::before");
      styles.set(element.dataset.markerTemplate!, {
        background: style.backgroundColor,
        border: style.borderTopColor,
        radius: Math.min(16, parseFloat(style.borderTopLeftRadius) || 0),
        fallback: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`,
        imageScale: imageStyle.transform === "none" ? 1 : new DOMMatrixReadOnly(imageStyle.transform).a,
        imageFilter: imageStyle.filter || "none",
        badgeBackground: badgeStyle.backgroundColor,
        badgeSize: parseFloat(badgeStyle.width) || 26,
        badgeRadius: parseFloat(badgeStyle.borderTopLeftRadius) || 7,
      });
    }

    for (const definition of missing) {
      const style = styles.get(definition.templateKey)!;
      const transport = definition.appearance.markerClass.split(" ").includes("map-marker-transport");
      const questArtwork = definition.appearance.markerClass.split(" ").includes("map-marker-quest");
      const gatherableNode = definition.appearance.markerClass.split(" ").some((name) =>
        name === "map-marker-gather-herbs" || name === "map-marker-gather-metal-ore");
      const questGiver = definition.appearance.markerClass.split(" ").includes("map-marker-quest-giver");
      const placeArtwork = definition.appearance.markerClass.split(" ").includes("map-place-art");
      const iconOnly = definition.appearance.markerClass.split(" ").includes("map-marker-icon-only");
      const repeatableQuest = definition.appearance.markerClass.split(" ").includes("map-marker-repeatable-quest");
      const compactArtwork = definition.appearance.markerClass.split(" ").some((name) =>
        name === "map-marker-mapgenie" || name === "map-service-art" || name === "map-place-art");
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = Math.ceil(MARKER_SPRITE_SIZE * rasterScale);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Could not create a marker sprite canvas.");
      context.scale(rasterScale, rasterScale);
      context.imageSmoothingQuality = "high";
      const roundedFill = (inset: number, radius: number, fill: string) => {
        context.fillStyle = fill;
        context.beginPath();
        const end = MARKER_SPRITE_SIZE - inset;
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
      if (transport) {
        context.fillStyle = style.background;
        context.beginPath();
        context.moveTo(18, 35);
        context.bezierCurveTo(14, 30, 3, 25, 3, 17);
        context.arc(18, 17, 15, Math.PI, 0);
        context.bezierCurveTo(33, 25, 22, 30, 18, 35);
        context.closePath();
        context.fill();
      } else if (compactArtwork && !questArtwork && !placeArtwork) {
        context.save();
        context.shadowColor = "rgba(0, 0, 0, 0.45)";
        context.shadowBlur = 5;
        context.shadowOffsetY = 2;
        roundedFill((MARKER_SPRITE_SIZE - style.badgeSize) / 2,
          style.badgeRadius, style.badgeBackground);
        context.restore();
      } else if (!questArtwork && !gatherableNode && !questGiver && !placeArtwork && !iconOnly) {
        roundedFill(1, style.radius + 1, "rgba(12, 14, 12, 0.72)");
        roundedFill(2, style.radius, style.border);
        roundedFill(4, Math.max(0, style.radius - 2), style.background);
      }
      sprites.set(definition.key, canvas);
      const native = definition.appearance.nativeIconPath;
      void loadImage(native ?? style.fallback).then(async (loaded) => {
        const image = loaded ?? (native ? await loadImage(style.fallback) : null);
        if (disposed || !image) return;
        const size = (questArtwork ? 36 : definition.appearance.itemArt ? MAP_ARTWORK_ICON_SIZE : 18)
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
        context.save();
        // Canvas filter lengths use backing pixels, unlike the scaled geometry.
        context.filter = native && loaded
          ? style.imageFilter.replace(/(-?[\d.]+)px/g, (_, value: string) => `${Number(value) * rasterScale}px`)
          : "none";
        context.drawImage(image, (MARKER_SPRITE_SIZE - width) / 2,
          (MARKER_SPRITE_SIZE - height) / 2 - (transport ? 2 : 0), width, height);
        context.restore();
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
  };
  update(definitions);
  return { sprites, update, dispose: () => { disposed = true; } };
};
