/** Bundled maps live under public/maps; a release can point this at a CDN. */
const LOCAL_MAP_DATA_BASE_URL = "/maps";

export const MAP_DATA_BASE_URL = (
  import.meta.env.VITE_MAP_DATA_BASE_URL || LOCAL_MAP_DATA_BASE_URL
).replace(/\/+$/, "");
