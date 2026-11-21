import { Pane, Polyline } from "react-leaflet";
import type { ErMapLayerDefinition } from "./types";

const ErMapGrid = ({ layer }: { layer: ErMapLayerDefinition }) => {
  const columns = layer.tileMaxX - layer.tileMinX + 1;
  const rows = layer.tileMaxZ - layer.tileMinZ + 1;
  const cellWidth = layer.imageWidth / columns;
  const cellHeight = layer.imageHeight / rows;
  const minLatitude = layer.imageHeight - layer.contentBounds.bottom;
  const maxLatitude = layer.imageHeight - layer.contentBounds.top;

  return (
    <Pane name="er-map-grid" className="z-[350]">
      {Array.from({ length: columns + 1 }, (_, index) => {
        const x = index * cellWidth;
        if (x < layer.contentBounds.left || x > layer.contentBounds.right) return null;
        const major = index % 5 === 0;
        return (
          <Polyline
            key={`x:${index}`}
            positions={[[minLatitude, x], [maxLatitude, x]]}
            pathOptions={{
              color: major ? "#f1c75b" : "#ffffff",
              opacity: major ? 0.42 : 0.13,
              weight: major ? 1.2 : 0.7,
            }}
          />
        );
      })}
      {Array.from({ length: rows + 1 }, (_, index) => {
        const imageY = index * cellHeight;
        if (imageY < layer.contentBounds.top || imageY > layer.contentBounds.bottom) return null;
        const latitude = layer.imageHeight - imageY;
        const major = index % 5 === 0;
        return (
          <Polyline
            key={`z:${index}`}
            positions={[
              [latitude, layer.contentBounds.left],
              [latitude, layer.contentBounds.right],
            ]}
            pathOptions={{
              color: major ? "#f1c75b" : "#ffffff",
              opacity: major ? 0.42 : 0.13,
              weight: major ? 1.2 : 0.7,
            }}
          />
        );
      })}
    </Pane>
  );
};

export default ErMapGrid;
