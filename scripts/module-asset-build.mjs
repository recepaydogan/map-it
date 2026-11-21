import { parse } from "acorn";

/** WoW's search worker receives its catalog through postMessage. Do not copy
 * the entire CDN inventory into this compute-only bundle. If it gains I/O or
 * imports in a future release, retain the full adapter conservatively. */
export function workerNeedsContentAdapter(relative, text) {
  // Tesseract receives fully qualified URLs for its bundled OCR resources.
  if (relative === "apps/wow-forever/assets/position-ocr/worker.min.js") return false;
  if (!/^apps\/wow-forever\/assets\/map-search-worker-[\w-]+\.js$/.test(relative)) return true;
  return /\b(?:fetch|XMLHttpRequest|importScripts|import|Worker|SharedWorker|WebSocket|eval|Function)\b|\b(?:self|globalThis|window)\s*\[/.test(text);
}

/** Restore root-path normalizers after the importer namespaces their inputs. */
export function rewriteModuleAssetPaths(relative, body) {
  if (!/^apps\/[^/]+\/.*\.js$/.test(relative)) return body;
  const text = body.toString("utf8");
  if (!/\/\^\\\/(?:maps|data|assets|game-data)\\\//.test(text)) return body;
  const app = relative.split("/")[1];
  const edits = [];
  const tree = parse(text, { ecmaVersion: "latest", sourceType: "module" });
  function visit(node) {
    if (!node || typeof node !== "object") return;
    if (node.type === "Literal" && node.regex) {
      const root = node.regex.pattern.match(/^\^\\\/(maps|data|assets|game-data)\\\/$/)?.[1];
      if (root) edits.push({ start: node.start, end: node.end, replacement: `/^\\/(?:apps\\/${app}\\/)?${root}\\//${node.regex.flags}` });
    }
    for (const [key, value] of Object.entries(node)) {
      if (["start", "end", "type", "regex"].includes(key)) continue;
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === "object") visit(value);
    }
  }
  visit(tree);
  let result = text;
  for (const edit of edits.sort((a, b) => b.start - a.start)) result = result.slice(0, edit.start) + edit.replacement + result.slice(edit.end);
  return Buffer.from(result);
}
