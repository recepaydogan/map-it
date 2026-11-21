import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "../lib/cn";
import Tooltip from "./tooltip";

type Side = "top" | "bottom" | "left" | "right";
type Align = "center" | "start" | "end";

interface TruncatedTextProps {
  text: string;
  /** Classes for the clipped line itself. */
  className?: string;
  /** Classes for the tooltip trigger wrapper (flex sizing lives here). */
  wrapperClassName?: string;
  side?: Side;
  align?: Align;
}

/**
 * Single-line label that clips with an ellipsis and only reveals the shared
 * tooltip when the text is actually cut off, so full names stay reachable in
 * narrow dropdowns without adding noise to labels that already fit.
 */
export const TruncatedText = ({
  text,
  className,
  wrapperClassName,
  side = "top",
  align = "center",
}: TruncatedTextProps) => {
  const lineRef = useRef<HTMLSpanElement | null>(null);
  const [truncated, setTruncated] = useState(false);

  const measure = useCallback(() => {
    const node = lineRef.current;
    if (!node) return;
    setTruncated(node.scrollWidth > node.clientWidth + 1);
  }, []);

  useEffect(() => {
    measure();
    const node = lineRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [measure, text]);

  return (
    <Tooltip
      label={text}
      side={side}
      align={align}
      disabled={!truncated}
      className={cn("min-w-0", wrapperClassName)}
    >
      <span ref={lineRef} className={cn("block w-full truncate", className)}>
        {text}
      </span>
    </Tooltip>
  );
};

export default TruncatedText;
