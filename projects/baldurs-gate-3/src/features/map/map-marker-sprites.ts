import type { getPointAppearance } from "./map-config";
import type { MapItemSprite } from "./use-map-item-visuals";

type MarkerAppearance = ReturnType<typeof getPointAppearance>;
export interface MarkerSpriteDefinition {
  key: string;
  templateKey: string;
  appearance: MarkerAppearance;
  sprite?: MapItemSprite;
  strokeWidth: number;
}

/** Includes room for the marker's outline and shadow. */
export const MARKER_SPRITE_SIZE = 48;
const iconIds = new WeakMap<MarkerAppearance["icon"], number>();
let nextIconId = 0;

export const getMarkerTemplateKey = (appearance: MarkerAppearance, strokeWidth: number) => {
  let iconId = iconIds.get(appearance.icon);
  if (iconId === undefined) { iconId = nextIconId++; iconIds.set(appearance.icon, iconId); }
  return `${appearance.markerClass}:${iconId}:${strokeWidth}`;
};

export const getMarkerSpriteKey = (templateKey: string, source?: string, sprite?: MapItemSprite) =>
  `${templateKey}:${sprite ? JSON.stringify(sprite) : source ?? ""}`;

/** Rasterize each appearance once using the existing CSS, SVG and item atlas.
 * Image requests and completed sprites survive camera movement and filtering. */
export const createMarkerSprites = (
  templates: HTMLElement,
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
    if (/^https?:\/\//.test(source)) image.crossOrigin = "anonymous";
    const request = new Promise<HTMLImageElement | null>((resolve) => {
      image.onload = () => resolve(image);
      image.onerror = () => {
        console.warn("Map marker image could not be loaded; using its fallback icon.", source);
        resolve(null);
      };
      image.src = source;
    });
    images.set(source, request);
    return request;
  };

  const update = (definitions: MarkerSpriteDefinition[]) => {
    if (disposed) return;
    const missing = definitions.filter(({ key }) => !sprites.has(key));
    if (!missing.length) return;
    const styles = new Map<string, { background: string; border: string; borderWidth: number;
      size: number; radius: number; fallback: string }>();
    for (const element of templates.querySelectorAll<HTMLElement>("[data-marker-template]")) {
      const style = getComputedStyle(element);
      const svg = element.querySelector("svg")!.cloneNode(true) as SVGElement;
      svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      svg.setAttribute("color", style.color);
      styles.set(element.dataset.markerTemplate!, {
        background: style.backgroundColor, border: style.borderTopColor,
        borderWidth: parseFloat(style.borderTopWidth) || 0,
        size: parseFloat(style.width) || 32, radius: parseFloat(style.borderTopLeftRadius) || 0,
        fallback: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`,
      });
    }
    for (const definition of missing) {
      const style = styles.get(definition.templateKey);
      if (!style) throw new Error(`Missing map marker template: ${definition.templateKey}`);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = Math.ceil(MARKER_SPRITE_SIZE * pixelRatio);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Could not create a marker sprite canvas.");
      context.scale(pixelRatio, pixelRatio);
      const inset = (MARKER_SPRITE_SIZE - style.size) / 2;
      const shape = (offset: number, fill: string) => {
        const edge = inset + offset;
        const size = style.size - offset * 2;
        context.fillStyle = fill;
        context.beginPath();
        context.roundRect(edge, edge, size, size, Math.min(size / 2, Math.max(0, style.radius - offset)));
        context.fill();
      };
      context.save();
      context.shadowColor = "rgba(0, 0, 0, 0.58)";
      context.shadowBlur = 8;
      context.shadowOffsetY = 3;
      shape(-2, "rgba(12, 14, 12, 0.72)");
      context.restore();
      shape(0, style.border);
      shape(style.borderWidth, style.background);
      sprites.set(definition.key, canvas);
      const sprite = definition.sprite;
      const source = sprite ? `/items/icon-atlases/${sprite.atlas}.webp` : definition.appearance.nativeIconPath;
      void loadImage(source ?? style.fallback).then(async (loaded) => {
        const artwork = loaded ?? (source ? await loadImage(style.fallback) : null);
        if (disposed || !artwork) return;
        const size = 18;
        const offset = (MARKER_SPRITE_SIZE - size) / 2;
        if (sprite && loaded) {
          context.drawImage(artwork, sprite.u1 * artwork.naturalWidth, sprite.v1 * artwork.naturalHeight,
            (sprite.u2 - sprite.u1) * artwork.naturalWidth, (sprite.v2 - sprite.v1) * artwork.naturalHeight,
            offset, offset, size, size);
        } else {
          const scale = size / Math.max(artwork.naturalWidth, artwork.naturalHeight);
          const width = artwork.naturalWidth * scale;
          const height = artwork.naturalHeight * scale;
          context.drawImage(artwork, (MARKER_SPRITE_SIZE - width) / 2,
            (MARKER_SPRITE_SIZE - height) / 2, width, height);
        }
        onChange();
      }).catch((error: unknown) => console.error("Map marker sprite could not be drawn.", error));
    }
  };
  return { sprites, update, dispose: () => { disposed = true; } };
};
