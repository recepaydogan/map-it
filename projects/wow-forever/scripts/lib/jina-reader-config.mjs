/** Optional Reader API authentication; keep unauthenticated batches resumable. */
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";

const root = fileURLToPath(new URL("../../", import.meta.url));
const env = loadEnv("production", root, "");
const configuredKey = (process.env.JINA_API_KEY || env.JINA_API_KEY || "").trim();
if (/[\r\n]/.test(configuredKey)) throw new Error("Invalid JINA_API_KEY");
const anonymous = /^(?:1|true)$/i.test((process.env.JINA_READER_ANONYMOUS ||
  env.JINA_READER_ANONYMOUS || "").trim());
const key = anonymous ? "" : configuredKey;

export const jinaReaderHeaders = {
  "X-Return-Format": "markdown",
  ...(key ? { Authorization: `Bearer ${key}` } : {}),
};
export const jinaReaderPaceMs = key ? 125 : 3_300;
export const jinaReaderConcurrency = key ? 6 : Infinity;
