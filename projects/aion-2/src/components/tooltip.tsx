import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "../lib/cn";
import { getPortalRoot } from "../lib/portal";

type Side = "top" | "bottom" | "left" | "right";
type Align = "center" | "start" | "end";

interface TooltipProps {
  label: ReactNode;
  side?: Side;
  align?: Align;
  disabled?: boolean;
  wrap?: boolean;
  fitContent?: boolean;
  className?: string;
  tone?: "dark" | "light";
  /** Retained for existing call sites; every tooltip now uses the safe portal. */
  float?: boolean;
  children: ReactNode;
}

const TOOLTIP_GAP = 8;
let activeTooltipId: string | null = null;
const activeTooltipListeners = new Set<() => void>();

const subscribeToActiveTooltip = (listener: () => void) => {
  activeTooltipListeners.add(listener);
  return () => activeTooltipListeners.delete(listener);
};

const setActiveTooltip = (id: string | null) => {
  if (activeTooltipId === id) return;
  activeTooltipId = id;
  for (const listener of activeTooltipListeners) listener();
};

const getActiveTooltip = () => activeTooltipId;
const getServerTooltip = () => null;

const tooltipPosition = (
  rect: DOMRect,
  side: Side,
  align: Align,
  boundary?: DOMRect,
  contentHeight = 0,
  contentWidth = 0,
  fitContent = false,
): CSSProperties => {
  const offsetX = boundary?.left ?? 0;
  const offsetY = boundary?.top ?? 0;
  const boundaryLeft = boundary?.left ?? 0;
  const boundaryRight = boundary?.right ?? window.innerWidth;
  const boundaryBottom = boundary?.bottom ?? window.innerHeight;
  const boundaryTop = boundary?.top ?? 0;
  const above = rect.top - boundaryTop - TOOLTIP_GAP - 8;
  const below = boundaryBottom - rect.bottom - TOOLTIP_GAP - 8;
  const leftSpace = rect.left - boundaryLeft - TOOLTIP_GAP - 8;
  const rightSpace = boundaryRight - rect.right - TOOLTIP_GAP - 8;
  let placedSide = side;
  if (fitContent && contentHeight > 0 && contentWidth > 0) {
    if (side === "top" || side === "bottom") {
      const preferred = side === "top" ? above : below;
      const opposite = side === "top" ? below : above;
      if (contentHeight > preferred) {
        if (contentHeight <= opposite) placedSide = side === "top" ? "bottom" : "top";
        else if (contentWidth <= rightSpace) placedSide = "right";
        else if (contentWidth <= leftSpace) placedSide = "left";
        else placedSide = below >= above ? "bottom" : "top";
      }
    } else {
      const preferred = side === "left" ? leftSpace : rightSpace;
      const opposite = side === "left" ? rightSpace : leftSpace;
      if (contentWidth > preferred && contentWidth <= opposite) placedSide = side === "left" ? "right" : "left";
    }
  }
  const centeredTop = Math.max(boundaryTop + 8, Math.min(
    rect.top + rect.height / 2 - contentHeight / 2,
    boundaryBottom - contentHeight - 8,
  ));
  const vertical = placedSide === "top"
    ? { bottom: boundaryBottom - rect.top + TOOLTIP_GAP }
    : placedSide === "bottom"
      ? { top: rect.bottom - offsetY + TOOLTIP_GAP }
      : fitContent ? { top: centeredTop - offsetY }
        : { top: rect.top - offsetY + rect.height / 2, transform: "translateY(-50%)" };
  const maxWidth = Math.max(0, boundaryRight - boundaryLeft - 16);
  const desiredLeft = align === "start" ? rect.left : align === "end" ? rect.right - contentWidth
    : rect.left + rect.width / 2 - contentWidth / 2;
  const safeLeft = Math.max(boundaryLeft + 8, Math.min(desiredLeft, boundaryRight - Math.min(contentWidth, maxWidth) - 8));
  const horizontal = placedSide === "left"
    ? { right: boundaryRight - rect.left + TOOLTIP_GAP }
    : placedSide === "right"
      ? { left: rect.right - offsetX + TOOLTIP_GAP }
      : fitContent ? { left: safeLeft - offsetX }
      : align === "start"
        ? { left: rect.left - offsetX }
        : align === "end"
          ? { right: boundaryRight - rect.right }
          : { left: rect.left - offsetX + rect.width / 2, transform: "translateX(-50%)" };
  return { position: boundary ? "absolute" : "fixed", ...vertical, ...horizontal,
    ...(fitContent ? { maxWidth } : {}) };
};

/**
 * Shared tooltip surface. Every bubble portals into the app's non-ads root, so
 * overflow-hidden cards cannot clip it and the Overwolf ad rail remains clear.
 * A tiny external store guarantees that hover and keyboard focus can never leave
 * two tooltip bubbles visible at once.
 */
export const Tooltip = ({
  label,
  side = "top",
  align = "center",
  disabled,
  wrap,
  fitContent = false,
  className,
  tone = "dark",
  children,
}: TooltipProps) => {
  const id = useId();
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const bubbleRef = useRef<HTMLSpanElement | null>(null);
  const pointerInsideRef = useRef(false);
  const focusInsideRef = useRef(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [bubbleSize, setBubbleSize] = useState({ height: 0, width: 0 });
  const activeId = useSyncExternalStore(
    subscribeToActiveTooltip,
    getActiveTooltip,
    getServerTooltip,
  );
  const visible = !disabled && activeId === id && rect !== null;
  const portalRoot = visible ? getPortalRoot() : null;
  const portalBoundary = portalRoot && portalRoot !== document.body
    ? portalRoot.parentElement?.getBoundingClientRect()
    : undefined;

  const open = () => {
    if (disabled) return;
    setRect(triggerRef.current?.getBoundingClientRect() ?? null);
    setActiveTooltip(id);
  };
  const closeIfInactive = () => {
    if (pointerInsideRef.current || focusInsideRef.current) return;
    if (activeTooltipId === id) setActiveTooltip(null);
    setRect(null);
  };

  useEffect(() => {
    if (!visible) return;
    const updatePosition = () => setRect(triggerRef.current?.getBoundingClientRect() ?? null);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [visible]);

  useLayoutEffect(() => {
    if (!visible || !fitContent || !bubbleRef.current) return;
    const bubble = bubbleRef.current;
    const measure = () => {
      const height = bubble.offsetHeight;
      const width = bubble.offsetWidth;
      setBubbleSize((current) => current.height === height && current.width === width ? current : { height, width });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(bubble);
    return () => observer.disconnect();
  }, [fitContent, visible]);

  useEffect(() => () => {
    if (activeTooltipId === id) setActiveTooltip(null);
  }, [id]);

  return (
    <span
      ref={triggerRef}
      className={cn("inline-flex", className)}
      onPointerEnter={() => {
        pointerInsideRef.current = true;
        open();
      }}
      onPointerLeave={() => {
        pointerInsideRef.current = false;
        closeIfInactive();
      }}
      onFocusCapture={() => {
        focusInsideRef.current = true;
        open();
      }}
      onBlurCapture={() => {
        focusInsideRef.current = false;
        closeIfInactive();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          pointerInsideRef.current = false;
          focusInsideRef.current = false;
          setActiveTooltip(null);
          setRect(null);
        }
      }}
    >
      {children}
      {visible && createPortal(
        <span
          ref={bubbleRef}
          role="tooltip"
          style={tooltipPosition(rect, side, align, portalBoundary, bubbleSize.height, bubbleSize.width, fitContent)}
          className={cn(
            "pointer-events-none z-[3000] rounded-[var(--radius-sm)] border px-2 py-1 text-[12px] font-medium shadow-lg animate-fade-in",
            tone === "light" ? "border-zinc-200 bg-white text-black" : "border-border bg-surface text-zinc-100",
            wrap ? "block max-w-[15rem] whitespace-normal leading-snug" : "whitespace-nowrap",
          )}
        >
          {label}
        </span>,
        portalRoot ?? document.body,
      )}
    </span>
  );
};

export default Tooltip;
