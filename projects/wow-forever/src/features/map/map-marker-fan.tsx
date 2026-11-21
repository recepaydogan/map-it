import { useTranslation } from "react-i18next";
import type { layoutMarkerFan } from "./map-marker-overlap";
import { screenPointStyle } from "./map-projection";
import MapPointMarker from "./map-point-marker";
import type { MapPoint } from "./types";

interface FanMember {
  point: MapPoint;
  label: string;
  tooltipLabel: string;
}

interface MapMarkerFanProps {
  left: number;
  top: number;
  members: FanMember[];
  layout: ReturnType<typeof layoutMarkerFan>;
  selectedId: string | null;
  completedPointIds: Set<string>;
  onSelect: (point: MapPoint) => void;
  onClose: () => void;
}

/** Screen-space clones leave the real marker coordinates untouched. */
const MapMarkerFan = ({ left, top, members, layout, selectedId, completedPointIds, onSelect, onClose }: MapMarkerFanProps) => {
  const { t } = useTranslation();
  const { offsets, scrimRadius } = layout;
  const diameter = scrimRadius * 2;

  return (
    <div className="map-marker-fan-layer pointer-events-none absolute inset-0">
      <div className="pointer-events-none absolute" style={screenPointStyle(left, top, { centered: false })}>
        <button
          type="button"
          className="map-marker-fan-scrim pointer-events-auto absolute cursor-pointer"
          style={{ left: -scrimRadius, top: -scrimRadius, width: diameter, height: diameter }}
          data-map-marker-control
          aria-label={t("chrome.close")}
          onClick={(event) => { event.stopPropagation(); onClose(); }}
        />
        <svg
          className="pointer-events-none absolute"
          style={{ left: -scrimRadius, top: -scrimRadius }}
          width={diameter}
          height={diameter}
          aria-hidden="true"
        >
          {offsets.map((offset, index) => (
            <line key={members[index]!.point.id}
              x1={scrimRadius} y1={scrimRadius}
              x2={scrimRadius + offset.left} y2={scrimRadius + offset.top}
              stroke="#c7ad67" strokeWidth="2" opacity="0.9" />
          ))}
        </svg>
        {members.map(({ point, label, tooltipLabel }, index) => (
          <MapPointMarker
            key={point.id}
            point={point}
            label={label}
            tooltipLabel={tooltipLabel}
            left={offsets[index]!.left}
            top={offsets[index]!.top}
            selected={point.id === selectedId}
            completed={completedPointIds.has(point.id)}
            markerScale={1}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
};

export default MapMarkerFan;
