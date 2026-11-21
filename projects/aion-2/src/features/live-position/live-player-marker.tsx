import { useLayoutEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { worldToScreen, type MapProjectionMode } from "../map/map-projection";
import type { MapView } from "../map/types";
import { getLivePosition, subscribeLivePosition } from "./live-position-store";

export const LivePlayerMarker = ({ mapId, view, width, height, projection, compact = false }: {
  mapId: string; view: MapView; width: number; height: number; projection: MapProjectionMode; compact?: boolean;
}) => {
  const { t } = useTranslation();
  const element = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const update = (glide: boolean) => {
      const node = element.current;
      if (!node) return;
      const value = getLivePosition();
      const visible = value.state === "tracking" && value.mapId === mapId && value.point && Date.now() - value.timestamp < 3000;
      const wasVisible = !node.hidden;
      node.hidden = !visible;
      if (visible && value.point) {
        const point = worldToScreen(value.point, view, width, height, projection);
        // Camera changes must land with the tiles before paint. Only fresh
        // player samples may glide; never animate a zoom, pan rebase or resize.
        node.style.transition = glide && wasVisible ? "" : "none";
        node.style.transform = `translate(${point.left}px, ${point.top}px)`;
      }
    };
    update(false);
    const unsubscribe = subscribeLivePosition(() => update(true));
    const expiry = window.setInterval(() => {
      if (element.current && Date.now() - getLivePosition().timestamp >= 3000) element.current.hidden = true;
    }, 1000);
    return () => { unsubscribe(); window.clearInterval(expiry); };
  }, [mapId, view, width, height, projection]);
  return <div ref={element} hidden className="live-player-marker" role="img" aria-label={t("map.livePosition.me")}>
    {/* A symmetric reticle marks position without implying an unverified heading. */}
    <span className="live-player-dot" aria-hidden="true"><span className="live-player-core" /></span>
    {!compact && <span className="live-player-label" aria-hidden="true">{t("map.livePosition.me")}</span>}
  </div>;
};
