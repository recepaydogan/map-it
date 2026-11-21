import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { screenPointStyle } from "./map-projection";
import MapPointMarker from "./map-point-marker";
import { getMapPointMarkerScale, useMarkerSizes } from "./marker-size-settings";
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
  selectedId: string | null;
  completedPointIds: Set<string>;
  onSelect: (point: MapPoint) => void;
  onClose: () => void;
}

const FOOT_SEPARATION = 44;
const MIN_LEG_LENGTH = 48;
const SCRIM_MARGIN = 28;

const radiusOf = (ring: number, separation: number) => Math.max(MIN_LEG_LENGTH, separation)
  + (ring - 1) * separation;
const capacityOf = (ring: number, separation: number) =>
  Math.floor((2 * Math.PI * radiusOf(ring, separation)) / separation);

const layoutFan = (count: number, markerDiameter: number) => {
  const separation = Math.max(FOOT_SEPARATION, markerDiameter + 12);
  let rings = 1;
  let capacity = capacityOf(rings, separation);
  while (capacity < count) capacity += capacityOf(++rings, separation);

  const weights = Array.from({ length: rings }, (_, index) => capacityOf(index + 1, separation));
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  const perRing = weights.map((weight) => Math.floor((count * weight) / weightSum));
  let placed = perRing.reduce((sum, amount) => sum + amount, 0);
  for (let index = 0; placed < count; index = (index + 1) % rings, placed += 1) {
    perRing[index]! += 1;
  }

  const offsets: { left: number; top: number }[] = [];
  perRing.forEach((amount, index) => {
    if (!amount) return;
    const ring = index + 1;
    const radius = radiusOf(ring, separation);
    const step = (2 * Math.PI) / amount;
    const start = -Math.PI / 2 + (ring % 2 === 0 ? step / 2 : 0);
    for (let position = 0; position < amount; position += 1) {
      const angle = start + position * step;
      offsets.push({ left: radius * Math.cos(angle), top: radius * Math.sin(angle) });
    }
  });
  return { offsets, scrimRadius: radiusOf(rings, separation) + Math.max(SCRIM_MARGIN, markerDiameter / 2 + 12) };
};

/** Screen-space clones leave the real marker coordinates untouched. */
const MapMarkerFan = ({ left, top, members, selectedId, completedPointIds, onSelect, onClose }: MapMarkerFanProps) => {
  const { t } = useTranslation();
  const markerSizes = useMarkerSizes();
  const fanMarkerScale = (point: MapPoint) => Math.max(1.25, getMapPointMarkerScale(point, markerSizes));
  const markerDiameter = Math.max(36, ...members.map(({ point }) => 36 * fanMarkerScale(point)));
  const { offsets, scrimRadius } = useMemo(() => layoutFan(members.length, markerDiameter), [markerDiameter, members.length]);
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
            markerScale={fanMarkerScale(point)}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
};

export default MapMarkerFan;
