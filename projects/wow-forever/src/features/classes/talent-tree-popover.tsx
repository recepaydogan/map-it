import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { getPortalRoot } from "../../lib/portal";

const TalentTreePopover = ({ anchor, id, label, onDismiss, children, onPointerEnter, onPointerLeave }: {
  anchor: HTMLElement;
  id: string;
  label: string;
  onDismiss: () => void;
  children: ReactNode;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
}) => {
  const root = getPortalRoot();
  const popupRef = useRef<HTMLDivElement>(null);
  const dismissRef = useRef(onDismiss);
  const [position, setPosition] = useState({ left: 8, top: 8 });

  useEffect(() => { dismissRef.current = onDismiss; }, [onDismiss]);

  useLayoutEffect(() => {
    const popup = popupRef.current;
    if (!popup) return;
    const place = () => {
      if (!anchor.isConnected) { dismissRef.current(); return; }
      const bounds = root.getBoundingClientRect();
      const trigger = anchor.getBoundingClientRect();
      const width = popup.offsetWidth;
      const height = popup.offsetHeight;
      const gap = 10;
      const margin = 8;
      const right = trigger.right - bounds.left + gap;
      const left = trigger.left - bounds.left - width - gap;
      const x = right + width + margin <= bounds.width ? right
        : left >= margin ? left
        : Math.max(margin, Math.min(right, bounds.width - width - margin));
      const y = Math.max(margin, Math.min(trigger.top - bounds.top - 6, bounds.height - height - margin));
      setPosition({ left: x, top: y });
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(popup);
    observer.observe(root);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchor, root]);

  useEffect(() => {
    const dismissOutside = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && !anchor.contains(target) && !popupRef.current?.contains(target)) dismissRef.current();
    };
    const dismissEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { dismissRef.current(); anchor.focus(); }
    };
    document.addEventListener("pointerdown", dismissOutside, true);
    document.addEventListener("keydown", dismissEscape, true);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside, true);
      document.removeEventListener("keydown", dismissEscape, true);
    };
  }, [anchor]);

  return createPortal(<div ref={popupRef} id={id} role="tooltip" aria-label={label}
    onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave}
    className={`absolute z-[3000] w-[min(340px,calc(100%-16px))] max-h-[calc(100%-16px)] overflow-y-auto ${onPointerEnter ? "pointer-events-auto" : "pointer-events-none"}`}
    style={position}>{children}</div>, root);
};

export default TalentTreePopover;
