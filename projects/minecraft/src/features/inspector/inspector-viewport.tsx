import { useLayoutEffect, useRef, useState, type ComponentProps } from "react";
import InspectorPanels from "./inspector-panels";

/** Place inside the map's unobscured content area, never around the advertising rail. */
const InspectorViewport = (props: Omit<ComponentProps<typeof InspectorPanels>, "availableWidth">) => {
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const node = container.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return <div ref={container} className="pointer-events-none h-full min-h-0 w-full" data-inspector-viewport>
    <InspectorPanels {...props} availableWidth={width} />
  </div>;
};

export default InspectorViewport;
