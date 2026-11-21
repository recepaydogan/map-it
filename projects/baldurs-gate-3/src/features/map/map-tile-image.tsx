import { useState, type CSSProperties, type SyntheticEvent } from "react";

interface MapTileImageProps {
  source: string;
  style: CSSProperties;
  onFailure?: () => void;
}

const revealMapTile = (event: SyntheticEvent<HTMLImageElement>) => {
  event.currentTarget.classList.add("map-tile-image-loaded");
};

/** A failed tile leaves the preview visible, but never hides the load failure. */
const MapTileImage = ({ source, style, onFailure }: MapTileImageProps) => {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  if (failedSource === source) return null;
  return (
    <img
      src={source}
      alt=""
      draggable={false}
      className="map-tile-image absolute max-w-none select-none"
      style={style}
      onLoad={revealMapTile}
      onError={() => {
        console.error(`Map tile could not be loaded: ${source}`);
        setFailedSource(source);
        onFailure?.();
      }}
    />
  );
};

export default MapTileImage;
