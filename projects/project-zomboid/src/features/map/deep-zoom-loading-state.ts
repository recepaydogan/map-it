interface DeepZoomLayerStatus {
  status: "loading" | "ready";
}

export const areWantedDeepZoomLayersReady = (
  visibleTileLoaded: boolean,
  wantedLayerKeys: ReadonlySet<string>,
  layers: ReadonlyMap<string, DeepZoomLayerStatus>,
) => visibleTileLoaded
  && wantedLayerKeys.size > 0
  && [...wantedLayerKeys].every((key) => layers.get(key)?.status === "ready");
