interface MapMarkerTooltipProps {
  label: string;
  left: number;
  top: number;
  markerSize: number;
  offsetY?: number;
  selected?: boolean;
}

const MapMarkerTooltip = ({ label, left, top, markerSize, offsetY = 0, selected = false }: MapMarkerTooltipProps) => (
  <span className="map-marker-floating-tooltip" aria-hidden="true" data-map-selected-tooltip={selected || undefined}
    style={{ left, top: top - markerSize / 2 - 7 + offsetY }}>
    {label}
  </span>
);

export default MapMarkerTooltip;
