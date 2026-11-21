import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createHash } from "node:crypto";
import ts from "typescript";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

assert.equal(process.argv.length, 4, "Usage: audit-map-atlas-labels.mjs <pre-edit-snapshot> <fresh-report>");
const root = path.resolve(import.meta.dirname, "..");
const [snapshotPath, output] = process.argv.slice(2).map((file) => path.resolve(root, file));
assert(!fs.existsSync(output));
const relative = (file) => path.relative(root, file).replaceAll("\\", "/");
const hash = (data) => createHash("sha256").update(data).digest("hex");
const hashes = {};
const read = (file) => {
  const bytes = fs.readFileSync(path.resolve(root, file)); hashes[relative(path.resolve(root, file))] = hash(bytes); return bytes;
};
const json = (file) => JSON.parse(read(file));
const source = (file) => read(file).toString("utf8").replaceAll("\r\n", "\n");
const snapshot = json(snapshotPath), prior = json(snapshot.proofPath);
assert.equal(hash(read(snapshot.proofPath)), snapshot.proofHash);
assert.deepEqual(prior.errors, []);
for (const [file, expected] of Object.entries(prior.hashes)) {
  const capture = snapshot.snapshots[file];
  if (capture) assert.equal(capture.hash, expected);
  assert.equal(hash(read(capture?.path ?? file)), expected, `Stale input: ${file}`);
}
const candidate = json(prior.candidate);
const registrySource = source(candidate.registryPath);
assert.equal(hash(read(candidate.registryPath)), candidate.registryHash);
const decodeRegistry = (text) => {
  const registryContext = { exports: {}, require: (name) => {
    assert.equal(name, "./map-data-url"); return { MAP_DATA_BASE_URL: "/maps" };
  } };
  vm.runInNewContext(ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, registryContext);
  return JSON.parse(JSON.stringify(registryContext.exports));
};
const registries = [
  { id: "published", ...decodeRegistry(source("src/features/map/map-registry.ts")) },
  { id: "candidate", ...decodeRegistry(registrySource) },
];
const before = source(snapshot.snapshots["src/features/map/map-atlas-overview.tsx"].path);
const after = source("src/features/map/map-atlas-overview.tsx");
const oldBlockStart = before.indexOf('      <div className="map-atlas-label-layer"');
const oldBlockEnd = before.indexOf("      <MapMarkerLayer", oldBlockStart);
assert(oldBlockStart > 0 && oldBlockEnd > oldBlockStart);
const expectedMount = `      <MapAtlasLabelLayer\n        atlas={atlas}\n        maps={maps}\n        selectedMapId={selectedMapId}\n        viewport={size}\n        offsetX={offsetX}\n        offsetY={offsetY}\n        zoom={view.zoom}\n      />\n`;
const expectedOverview = (before.slice(0, oldBlockStart) + expectedMount + before.slice(oldBlockEnd))
  .replace('import { getMapPointInstanceId } from "./map-atlas-projection";', 'import { getMapPointInstanceId } from "./map-atlas-projection";\nimport MapAtlasLabelLayer from "./map-atlas-label-layer";')
  .replace("const DETAIL_LABEL_ZOOM = 0.28;\n", "");
assert.equal(after, expectedOverview, "Unrelated camera/marker/image/connection handling changed");
const oldCss = source(snapshot.snapshots["src/index.css"].path), css = source("src/index.css");
const expectedCss = oldCss
  .replace("  transform: translate(-50%, calc(-100% - 10px));\n", "")
  .replace("  transition: opacity 120ms ease, visibility 120ms ease;", "  transition: none;")
  .replace('.map-atlas-map-label-anchor[data-label-visible="true"] .map-atlas-map-label {\n  opacity: 1;\n  visibility: visible;', '.map-atlas-map-label-anchor[data-label-visible="true"] .map-atlas-map-label {\n  opacity: 1;\n  visibility: visible;\n  transition: opacity 120ms ease;');
assert.equal(css, expectedCss, "Unrelated typography/colours/ad-rail styles changed");
const layer = source("src/features/map/map-atlas-label-layer.tsx");
for (const expected of ["new ResizeObserver", "target.getBoundingClientRect()", "Math.ceil(rectangle.width)", "Math.ceil(rectangle.height)",
  'observer.observe(element, { box: "border-box" })', "observer.disconnect()", "measured.name !== label.name", "measured.featured !== label.featured"]) assert(layer.includes(expected));
assert(!layer.includes("MapMarkerLayer") && !layer.includes("onSelectPoint") && !layer.includes("scale("));
const helper = source("src/features/map/map-atlas-label-layout.ts");
const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(helper, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
const layout = context.exports.layoutAtlasLabels;
const namedConstant = (text, name) => {
  const match = text.match(new RegExp(`const ${name} = ([0-9.]+);`)); assert(match); return Number(match[1]);
};
const zooms = [...new Set([namedConstant(after, "MINIMUM_ZOOM"), namedConstant(layer, "DETAIL_LABEL_ZOOM"),
  namedConstant(after, "SELECTION_ZOOM_FLOOR"), namedConstant(after, "MAXIMUM_ZOOM")])];
const rule = (selector) => {
  const start = css.indexOf(`${selector} {`); assert(start >= 0); return css.slice(start, css.indexOf("}", start) + 1);
};
const normal = rule(".map-atlas-map-label"), featured = rule('.map-atlas-map-label-anchor[data-label-priority="featured"] .map-atlas-map-label');
const number = (text, property) => { const match = text.match(new RegExp(`${property}: ([0-9.]+)`)); assert(match); return Number(match[1]); };
const maxWidth = number(normal, "max-width"), lineHeight = number(normal, "line-height");
assert.equal(maxWidth, 180);
assert(normal.includes("padding: 5px 9px") && normal.includes("border: 1px"));
assert(rule(".map-atlas-label-layer").includes("overflow: hidden") && rule(".map-atlas-label-layer").includes("pointer-events: none"));

// These are conservative source envelopes, not observed browser dimensions:
// use the real names, CSS maximum width and one word per line. They exercise
// the actual atlas geometry at source-defined zoom boundaries. The runtime
// uses ResizeObserver measurements, not these audit-only envelopes.
const cases = [];
let checkedLabels = 0, selectedNamesReachable = 0;
for (const registry of registries) {
 const widths = new Map(registry.MAP_DEFINITIONS.map((definition) => [definition.id, definition.name]));
 for (const atlas of registry.MAP_ATLASES) {
  const viewport = { width: atlas.width, height: atlas.height };
  const views = [
    ...zooms.map((zoom) => ({ zoom, selected: atlas.featuredMapIds[0], x: atlas.width / 2, y: atlas.height / 2 })),
    ...atlas.placements.map((p) => ({ zoom: Math.max(...zooms), selected: p.mapId, x: p.x + p.width / 2, y: p.y + p.height / 2, reveal: true })),
  ];
  for (const view of views) {
    const candidates = atlas.placements.filter((p) => view.zoom >= namedConstant(layer, "DETAIL_LABEL_ZOOM")
      || p.mapId === view.selected || atlas.featuredMapIds.includes(p.mapId)).map((p) => {
      const isFeatured = atlas.featuredMapIds.includes(p.mapId);
      const fontSize = number(isFeatured ? featured : normal, "font-size");
      return { mapId: p.mapId, width: maxWidth, height: Math.ceil(widths.get(p.mapId).split(/\s+/).length * fontSize * lineHeight + 12),
        selected: p.mapId === view.selected, featured: isFeatured,
        rectangle: { left: viewport.width / 2 + (p.x - view.x) * view.zoom, top: viewport.height / 2 + (p.y - view.y) * view.zoom,
          width: p.width * view.zoom, height: p.height * view.zoom } };
    });
    const preserved = JSON.stringify(candidates), result = layout(candidates, viewport);
    assert.equal(JSON.stringify(candidates), preserved, "Label inputs mutated");
    assert.equal(JSON.stringify(layout([...candidates].reverse(), viewport)), JSON.stringify(result), "Input ordering changed label priority");
    assert.equal(new Set(result.map((r) => r.mapId)).size, result.length);
    for (const [position, label] of result.entries()) {
      const original = candidates.find((c) => c.mapId === label.mapId); assert(original);
      assert.equal(label.width, original.width); assert.equal(label.height, original.height);
      assert(Number.isInteger(label.left) && Number.isInteger(label.top));
      assert(label.left >= 0 && label.top >= 0 && label.left + label.width <= viewport.width && label.top + label.height <= viewport.height);
      const r = original.rectangle;
      assert(r.left < viewport.width && r.top < viewport.height && r.left + r.width > 0 && r.top + r.height > 0, "Off-screen map took label space");
      for (const other of result.slice(position + 1)) {
        // Independent disjoint-interval proof, not the selector's intersection formula.
        assert(label.left + label.width + 6 <= other.left || other.left + other.width + 6 <= label.left
          || label.top + label.height + 6 <= other.top || other.top + other.height + 6 <= label.top, "Overlapping labels");
      }
      checkedLabels++;
    }
    if (view.reveal) { assert.equal(result[0]?.mapId, view.selected, "Selected map name cannot be revealed"); selectedNamesReachable++; }
    cases.push({ registry: registry.id, atlasId: atlas.id, zoom: view.zoom, selected: view.selected, focused: Boolean(view.reveal), visibleLabels: result.length });
  }
 }
}
const index = json(candidate.indexPath), stage = json(`${candidate.mapStage}/stage-manifest.json`);
assert.equal(selectedNamesReachable, registries.reduce((total, registry) => total + registry.MAP_DEFINITIONS.length, 0));
assert.deepEqual(registries[1].MAP_DEFINITIONS.map(({ id }) => id).sort(), [...stage.maps].sort());
read(import.meta.filename); read("scripts/lib/write-generated-file.mjs");
for (const [file, expected] of Object.entries(hashes)) assert.equal(hash(fs.readFileSync(path.join(root, file))), expected, `Input changed during audit: ${file}`);
const report = { kind: "independent-measured-atlas-label-source-audit", baselineSnapshot: relative(snapshotPath),
  stage: candidate.mapStage, itemsPath: candidate.itemsPath, indexPath: candidate.indexPath, registryCandidate: prior.candidate,
  stats: { preservedPriorHashes: Object.keys(prior.hashes).length, maps: stage.maps.length, publishedRegistryMaps: registries[0].MAP_DEFINITIONS.length, unchangedPinAppearances: index.locations.length,
    nativeConnections: index.connections.length, sourceEnvelopeViews: cases.length, checkedLabels, selectedNamesReachable,
    overlaps: 0, mutatedInputs: 0 }, cases, errors: [], hashes,
  limitations: ["No browser/app test or measured DOM sample was run. Source envelopes are not observed text sizes.",
    "Runtime font/ResizeObserver timing and final visual appearance remain for the user's manual check.",
    "Map/scene availability, native coverage, original composite fidelity, migration and coordinated data publication remain open."] };
writeGeneratedFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ...report.stats, hashes: Object.keys(hashes).length, output: relative(output) }));
