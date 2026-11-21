import { useEffect, useState, type CSSProperties, type SyntheticEvent } from "react";
import { acquireCommunityMapTile, releaseCommunityMapTile } from "./community-map-tile-cache";
import type { MapTileSource } from "./types";

interface MapTileImageProps {
  tileSource: MapTileSource;
  path: string;
  style: CSSProperties;
}

const revealMapTile = (event: SyntheticEvent<HTMLImageElement>) => {
  event.currentTarget.classList.add("map-tile-image-loaded");
};

const MapTileImage = ({ tileSource, path, style }: MapTileImageProps) => {
  const [failedSource, setFailedSource] = useState<string | null>(null);

  if (tileSource.kind === "static") {
    const source = `${tileSource.basePath}/${path}`;
    if (failedSource === source) return null;
    return (
      <img
        src={source}
        alt=""
        draggable={false}
        className="map-tile-image absolute max-w-none select-none"
        style={style}
        onLoad={revealMapTile}
        onError={() => setFailedSource(source)}
      />
    );
  }
  return <CommunityMapTileImage packageKey={tileSource.packageKey} path={path} style={style} />;
};

interface CommunityMapTileImageProps {
  packageKey: string;
  path: string;
  style: CSSProperties;
}

const CommunityMapTileImage = ({ packageKey, path, style }: CommunityMapTileImageProps) => {
  const [source, setSource] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void acquireCommunityMapTile(packageKey, path).then((url) => {
      if (active) setSource(url);
    });
    return () => {
      active = false;
      releaseCommunityMapTile(packageKey, path);
    };
  }, [packageKey, path]);

  if (!source) return null;
  return (
    <img
      src={source}
      alt=""
      draggable={false}
      className="map-tile-image absolute max-w-none select-none"
      style={style}
      onLoad={revealMapTile}
    />
  );
};

export default MapTileImage;
