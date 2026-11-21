import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { zipSync, strToU8 } from "fflate";
import { prepareCommunityMapPackage } from "../src/features/map/community-map-archive.ts";

const manifest = JSON.parse(readFileSync(new URL("../schema/community-map-package.example.json", import.meta.url), "utf8"));
manifest.map.detailLevels = [0];
manifest.map.tilePattern = "tiles/{level}/tile{x}x{y}.png";
manifest.map.coordinateOffset = { x: 250, y: -100 };
const locations = JSON.parse(readFileSync(new URL("../schema/community-map-locations.example.json", import.meta.url), "utf8"));
const onePixelPng = Uint8Array.from(Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
));

const archive = zipSync({
  "manifest.json": strToU8(JSON.stringify(manifest)),
  "data/locations.json": strToU8(JSON.stringify(locations)),
  "tiles/0/tile0x0.png": onePixelPng,
});
const prepared = prepareCommunityMapPackage(archive.buffer);

assert.equal(prepared.record.key, "example-self-authored-map@1.0.0");
assert.equal(prepared.record.assetCount, 1);
assert.equal(prepared.record.metadata.bounds.minX, 1250);
assert.equal(prepared.record.metadata.bounds.minY, 900);
assert.equal(prepared.record.metadata.locations[0].x, 1760);
assert.equal(prepared.record.metadata.locations[0].y, 1390);
assert.equal(prepared.record.metadata.tileSource.kind, "community");

const unsafeArchive = zipSync({
  "../manifest.json": strToU8(JSON.stringify(manifest)),
  "../data/locations.json": strToU8(JSON.stringify(locations)),
  "../tiles/0/tile0x0.png": onePixelPng,
});
assert.throws(() => prepareCommunityMapPackage(unsafeArchive.buffer), /path traversal|Unsafe archive path/);

const executableArchive = zipSync({
  "manifest.json": strToU8(JSON.stringify(manifest)),
  "data/locations.json": strToU8(JSON.stringify(locations)),
  "tiles/0/tile0x0.png": onePixelPng,
  "payload.js": strToU8("alert(1)"),
});
assert.throws(() => prepareCommunityMapPackage(executableArchive.buffer), /Unsupported file type/);

const missingPermission = structuredClone(manifest);
missingPermission.rights.permissionStatus = "explicit";
delete missingPermission.rights.permissionEvidenceUrl;
const permissionArchive = zipSync({
  "manifest.json": strToU8(JSON.stringify(missingPermission)),
  "data/locations.json": strToU8(JSON.stringify(locations)),
  "tiles/0/tile0x0.png": onePixelPng,
});
assert.throws(() => prepareCommunityMapPackage(permissionArchive.buffer), /evidence URL/);

console.log("Community map runtime validation and archive safety tests passed.");
