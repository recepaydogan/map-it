import { contentUrl } from "../../lib/content-url";
import { useState } from "react";

const MapServicePortrait = ({ source, name }: { source?: string; name: string }) => {
  const [failed, setFailed] = useState(false);
  if (!source || failed) return null;

  return <div className="map-service-portrait" role="img" aria-label={name}>
    <img src={contentUrl(`${source.replace(/^\//, "")}`)} alt="" decoding="async"
      onError={() => setFailed(true)} className="map-native-icon" />
  </div>;
};

export default MapServicePortrait;
