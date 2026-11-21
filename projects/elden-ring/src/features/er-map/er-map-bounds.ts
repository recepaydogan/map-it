import * as L from "leaflet";
import type { ErMapLayerDefinition } from "./types";

export const erMapContentBoundsFor = (layer: ErMapLayerDefinition) =>
  L.latLngBounds(
    [layer.imageHeight - layer.contentBounds.bottom, layer.contentBounds.left],
    [layer.imageHeight - layer.contentBounds.top, layer.contentBounds.right],
  );
