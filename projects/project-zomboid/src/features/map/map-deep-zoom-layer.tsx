import { LoaderCircle } from "lucide-react";
import type { MapIsometricManifest } from "./map-isometric-types";
import type { MapView } from "./types";
import { useDeepZoomViewer } from "./use-deep-zoom-viewer";

interface MapDeepZoomLayerProps {
  source: MapIsometricManifest;
  overlays?: MapIsometricManifest[];
  loadingLabel: string;
  floor: number;
  view: MapView;
  width: number;
  height: number;
  onSourceError?: () => void;
}

const MapDeepZoomLayer = ({
  source,
  overlays = [],
  loadingLabel,
  floor,
  view,
  width,
  height,
  onSourceError,
}: MapDeepZoomLayerProps) => {
  const { elementRef, status } = useDeepZoomViewer({
    source,
    overlays,
    floor,
    view,
    width,
    height,
    onSourceError,
  });
  return (
    <>
      <div
        ref={elementRef}
        className="map-deep-zoom-layer"
        data-deep-zoom-status={status}
        aria-hidden="true"
      />
      {status === "loading" && (
        <div
          className="pointer-events-none absolute inset-0 z-20 grid place-items-center bg-black/20"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-white/10 bg-surface/95 px-3 py-2 text-xs font-semibold text-white shadow-lg backdrop-blur-md">
            <LoaderCircle size={15} className="animate-spin text-accent" aria-hidden="true" />
            <span>{loadingLabel}</span>
          </div>
        </div>
      )}
    </>
  );
};

export default MapDeepZoomLayer;
