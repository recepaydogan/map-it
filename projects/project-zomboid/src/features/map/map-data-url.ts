const LOCAL_MAP_DATA_BASE_URL = "/map-data/knox-country";

export const MAP_DATA_BASE_URL = (
  import.meta.env.VITE_MAP_DATA_BASE_URL || LOCAL_MAP_DATA_BASE_URL
).replace(/\/+$/, "");

export const getMapDataUrl = (path: string) =>
  `${MAP_DATA_BASE_URL}/${path.replace(/^\/+/, "")}`;
