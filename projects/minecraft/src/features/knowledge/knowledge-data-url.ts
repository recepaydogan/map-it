/** Optional release CDN containing <edition>/<version>/{items,recipes,mechanics,brewing}.json. */
export const KNOWLEDGE_DATA_BASE_URL = (import.meta.env?.VITE_KNOWLEDGE_DATA_BASE_URL as string | undefined)?.trim().replace(/\/+$/, "") || "/knowledge-data";
