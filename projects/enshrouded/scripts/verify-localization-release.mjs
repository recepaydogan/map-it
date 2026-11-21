/** Verify every delivered locale byte and its public CDN response headers. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const baseUrl = process.argv[2]?.replace(/\/+$/, "");
if (!/^https:\/\/enshrouded\.ingredientassets\.com\/releases\/[a-f0-9]{24}$/.test(baseUrl ?? "")) {
  throw new Error("Pass the immutable Enshrouded release URL to verify.");
}
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const response = await fetch(`${baseUrl}/release-manifest.json`);
assert.equal(response.status, 200);
const manifest = await response.json();
assert.equal(manifest.fingerprint, baseUrl.split("/").at(-1));
const files = manifest.files.filter(file => /^data\/enshrouded\/(?:app-locales|content-locales|locales)\//.test(file.path));
assert.equal(files.length, 49, "All native, supplemental, and app UI locale files must be published");
const verified = [];
let cursor = 0;
await Promise.all(Array.from({ length: 6 }, async () => {
  while (cursor < files.length) {
    const file = files[cursor++];
    const local = await readFile(path.join(root, "public", file.path));
    assert.equal(local.length, file.size, file.path);
    assert.equal(digest(local), file.sha256, file.path);
    const result = await fetch(`${baseUrl}/${file.path}`, { headers: { Origin: "http://localhost:5188" } });
    assert.equal(result.status, 200, file.path);
    const bytes = Buffer.from(await result.arrayBuffer());
    assert.equal(bytes.length, file.size, file.path);
    assert.equal(digest(bytes), file.sha256, file.path);
    const mime = result.headers.get("content-type");
    const cors = result.headers.get("access-control-allow-origin");
    const cache = result.headers.get("cache-control");
    assert.match(mime ?? "", /^application\/json/i, file.path);
    assert.ok(cors === "*" || cors === "http://localhost:5188", `CORS: ${file.path}`);
    assert.match(cache ?? "", /immutable/, file.path);
    assert.match(cache ?? "", /max-age=31536000/, file.path);
    JSON.parse(bytes.toString("utf8"));
    verified.push({ ...file, httpStatus: 200, mime, cors, cache });
  }
}));
verified.sort((a, b) => a.path.localeCompare(b.path));
await writeFile(path.join(root, "research/localization/cdn-release-verification.json"), JSON.stringify({
  version: 1, observedAtUtc: new Date().toISOString(), baseUrl,
  fingerprint: manifest.fingerprint, releaseFiles: manifest.files.length,
  localeFiles: verified.length, complete: true, files: verified,
}, null, 2) + "\n");
console.log(`Verified all ${verified.length} locale files: SHA-256, size, JSON, MIME, CORS, immutable cache.`);
