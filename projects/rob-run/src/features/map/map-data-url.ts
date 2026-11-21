import { CONTENT_BASE_URL, contentUrl } from "../../lib/content-url";

export const MAP_DATA_BASE_URL = (
  CONTENT_BASE_URL
    ? contentUrl("maps/")
    : import.meta.env?.VITE_MAP_DATA_BASE_URL || contentUrl("maps/")
).replace(/\/+$/, "");
