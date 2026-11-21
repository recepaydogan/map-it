import type { TourBox } from "./use-tour-geometry";

export type TourPlacement = "bottom" | "top" | "left" | "right" | "center";

interface TourPopoverOptions {
  content: TourBox;
  target: TourBox | null;
  size: { w: number; h: number };
  placement?: TourPlacement;
  avoid?: TourBox[];
}

const MARGIN = 12;
const GAP = 14;
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));
const overlapArea = (a: TourBox, b: TourBox) =>
  Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
  * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));

/** Score the final, clamped rectangles: clamping must not hide the spotlight. */
export const placeTourPopover = ({ content, target, size, placement = "bottom", avoid = [] }: TourPopoverOptions) => {
  const maxWidth = Math.max(0, content.width - MARGIN * 2);
  const maxHeight = Math.max(0, content.height - MARGIN * 2);
  const width = Math.min(size.w, maxWidth);
  const height = Math.min(size.h, maxHeight);
  const boxAt = (left: number, top: number): TourBox => {
    const x = clamp(left, content.left + MARGIN, content.right - MARGIN - width);
    const y = clamp(top, content.top + MARGIN, content.bottom - MARGIN - height);
    return { left: x, top: y, right: x + width, bottom: y + height, width, height };
  };
  const centered = boxAt(content.left + (content.width - width) / 2, content.top + (content.height - height) / 2);
  if (!target || placement === "center") return { ...centered, maxWidth, maxHeight };

  const opposite = { bottom: "top", top: "bottom", left: "right", right: "left" } as const;
  const order = [...new Set([placement, opposite[placement], "bottom", "top", "right", "left"] as const)];
  const candidates = order.flatMap((side) => {
    // Perpendicular alignments also let the card avoid an open map sidebar.
    const horizontal = [target.left, target.right - width, target.left + (target.width - width) / 2];
    const vertical = [target.top, target.bottom - height, target.top + (target.height - height) / 2];
    if (side === "top") return horizontal.map((x) => boxAt(x, target.top - GAP - height));
    if (side === "bottom") return horizontal.map((x) => boxAt(x, target.bottom + GAP));
    if (side === "left") return vertical.map((y) => boxAt(target.left - GAP - width, y));
    return vertical.map((y) => boxAt(target.right + GAP, y));
  });
  const ranked = candidates.map((box, index) => ({
    box, index,
    targetOverlap: overlapArea(box, target),
    otherOverlap: avoid.reduce((sum, obstacle) => sum + overlapArea(box, obstacle), 0),
  })).sort((a, b) => a.targetOverlap - b.targetOverlap || a.otherOverlap - b.otherOverlap || a.index - b.index);
  return { ...ranked[0].box, maxWidth, maxHeight };
};
