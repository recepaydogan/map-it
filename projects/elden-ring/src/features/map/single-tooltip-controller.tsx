import { useEffect } from "react";
import type * as L from "leaflet";
import { useMap } from "react-leaflet";

/**
 * Enforces one hover label per map. Leaflet owns tooltips per layer, so densely
 * overlapping markers can otherwise leave several labels open as the pointer moves
 * between different marker panes or an icon is replaced while hovered.
 */
const SingleTooltipController = () => {
  const map = useMap();

  useEffect(() => {
    let active: L.Tooltip | null = null;

    const onOpen = (event: L.TooltipEvent) => {
      const next = event.tooltip;
      if (active && active !== next) active.close();
      active = next;
    };
    const onClose = (event: L.TooltipEvent) => {
      if (active === event.tooltip) active = null;
    };

    map.on("tooltipopen", onOpen);
    map.on("tooltipclose", onClose);
    return () => {
      map.off("tooltipopen", onOpen);
      map.off("tooltipclose", onClose);
      active?.close();
    };
  }, [map]);

  return null;
};

export default SingleTooltipController;
