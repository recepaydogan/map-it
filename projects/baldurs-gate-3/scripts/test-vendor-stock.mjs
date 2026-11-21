import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(fs.readFileSync(
  path.join(projectRoot, "map-sources", "catalog", "treasure-tables.json"),
  "utf8",
));
let vendorCount = 0;
let resolvedVendorCount = 0;
let lannTarv;
for (const mapDirectory of fs.readdirSync(path.join(projectRoot, "public", "maps"), { withFileTypes: true })) {
  if (!mapDirectory.isDirectory()) continue;
  const contentPath = path.join(projectRoot, "public", "maps", mapDirectory.name, "content.json");
  if (!fs.existsSync(contentPath)) continue;
  const content = JSON.parse(fs.readFileSync(contentPath, "utf8"));
  const entities = Array.isArray(content.entities) ? content.entities : Object.values(content.entities ?? {});
  for (const entity of entities.filter((candidate) => candidate.vendor)) {
    vendorCount += 1;
    assert.equal(entity.kind, "vendor", `${mapDirectory.name}:${entity.id} is a vendor`);
    assert.ok(entity.vendor.tradeTables.length > 0, `${entity.title} has a trade table`);
    assert.equal(entity.vendor.tradeTables.includes("FixedString"), false, `${entity.title} omits type metadata`);
    const resolvedTables = entity.vendor.tradeTables.filter((tableId) => catalog.tables[tableId]);
    if (resolvedTables.length > 0) resolvedVendorCount += 1;
    assert.ok(Array.isArray(entity.vendor.stockCategories));
    assert.ok(Array.isArray(entity.vendor.namedStock));
    if (entity.title === "Lann Tarv") lannTarv = entity;
  }
}
assert.ok(vendorCount > 0, "at least one extracted vendor stock profile exists");
assert.ok(resolvedVendorCount > 0, "at least one vendor resolves to extracted stock contents");
assert.ok(lannTarv, "Lann Tarv is published as a vendor");
assert.deepEqual(lannTarv.vendor.stockCategories, [], "developer-facing stock categories stay private");
assert.ok(lannTarv.vendor.namedStock.includes("Halberd of Vigilance"));
assert.ok(lannTarv.vendor.namedStock.includes("Titanstring Bow"));
assert.equal(lannTarv.vendor.namedStock.some((name) => name.startsWith("Equipment Trader")), false);
console.log(`Vendor stock tests passed for ${vendorCount} traders (${resolvedVendorCount} resolved profiles).`);
