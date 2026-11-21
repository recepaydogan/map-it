import { useState, type CSSProperties } from "react";

interface MapTileImageProps {
  source: string;
  style: CSSProperties;
}

/** One tile. A tile that fails to load (a hole in the pyramid) simply stays empty. */
const MapTileImage = ({ source, style }: MapTileImageProps) => {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  if (failedSource === source) return null;
  return (
    <img
      src={source}
      alt=""
      draggable={false}
      className="map-tile-image absolute max-w-none select-none"
      style={style}
      onError={() => setFailedSource(source)}
    />
  );
};

export default MapTileImage;
