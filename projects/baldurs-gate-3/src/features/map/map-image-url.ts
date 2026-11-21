import { MAP_DATA_BASE_URL } from "./map-data-url";

const imageBaseUrl = (import.meta.env.VITE_MAP_IMAGE_BASE_URL || "").replace(/\/+$/, "");

/** Keep metadata and marker data bundled while serving versioned imagery from a CDN. */
export const getMapImageUrl = (mapDataUrl: string, imagePath: string): string => {
  const base = mapDataUrl.replace(/\/+$/, "");
  if (imageBaseUrl && base.startsWith(`${MAP_DATA_BASE_URL}/`)) {
    return `${imageBaseUrl}/${base.slice(MAP_DATA_BASE_URL.length + 1)}/${imagePath}`;
  }
  return `${base}/${imagePath}`;
};
