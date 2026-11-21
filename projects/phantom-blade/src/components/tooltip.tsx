import {
  useEffect,
  useId,
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
  className?: string;
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
  wrap?: boolean,
): CSSProperties => {
  const offsetX = boundary?.left ?? 0;
  const offsetY = boundary?.top ?? 0;
  const boundaryRight = boundary?.right ?? window.innerWidth;
  const boundaryBottom = boundary?.bottom ?? window.innerHeight;
  const vertical = side === "top"
    ? { bottom: boundaryBottom - rect.top + TOOLTIP_GAP }
    : side === "bottom"
      ? { top: rect.bottom - offsetY + TOOLTIP_GAP }
      : { top: rect.top - offsetY + rect.height / 2, transform: "translateY(-50%)" };
  const wrappedLeft = wrap && (side === "top" || side === "bottom")
    ? Math.max(8, Math.min(
      align === "end" ? rect.right - offsetX - 240 : align === "center"
        ? rect.left - offsetX + rect.width / 2 - 120 : rect.left - offsetX,
      (boundary?.width ?? window.innerWidth) - 248,
    )) : undefined;
  const horizontal = wrappedLeft !== undefined
    ? { left: wrappedLeft }
    : side === "left"
    ? { right: boundaryRight - rect.left + TOOLTIP_GAP }
    : side === "right"
      ? { left: rect.right - offsetX + TOOLTIP_GAP }
      : align === "start"
        ? { left: rect.left - offsetX }
        : align === "end"
          ? { right: boundaryRight - rect.right }
          : { left: rect.left - offsetX + rect.width / 2, transform: "translateX(-50%)" };
  return { position: boundary ? "absolute" : "fixed", ...vertical, ...horizontal };
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
  className,
  children,
}: TooltipProps) => {
  const id = useId();
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const pointerInsideRef = useRef(false);
  const focusInsideRef = useRef(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
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
      onClickCapture={() => {
        setActiveTooltip(null);
        setRect(null);
      }}
    >
      {children}
      {visible && createPortal(
        <span
          role="tooltip"
          style={{ ...tooltipPosition(rect, side, align, portalBoundary, wrap),
            ...(wrap ? { maxWidth: "min(15rem, calc(100% - 16px))" } : {}) }}
          className={cn(
            "pointer-events-none z-[3000] rounded-[var(--radius-sm)] border border-border bg-surface px-2 py-1 text-[12px] font-medium text-zinc-100 shadow-lg animate-fade-in",
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
