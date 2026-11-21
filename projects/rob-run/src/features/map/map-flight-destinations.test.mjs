import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { build } from "esbuild";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import i18next from "i18next";

const require = createRequire(import.meta.url);
const { I18nextProvider } = require("react-i18next");

const bundle = await build({
  entryPoints: ["src/features/map/map-marker-layer.tsx"],
  bundle: true, write: false, platform: "node", format: "cjs", packages: "external",
  jsx: "automatic",
  define: { "import.meta.env": "{}" },
});
const componentModule = { exports: {} };
new Function("require", "module", "exports", bundle.outputFiles[0].text)(
  require, componentModule, componentModule.exports,
);
const MapMarkerLayer = componentModule.exports.default;
const i18n = i18next.createInstance();
await i18n.init({ lng: "en", resources: { en: { translation: {} } } });

const flightPoint = (id, x = 0) => ({
  id, name: id, category: "flight-master", subtype: "flight-master",
  label: "Flight point", region: "Azeroth", regionId: "azeroth", x, y: 0,
});
const destination = flightPoint("destination", 300);
const unrelated = flightPoint("unrelated", -300);
const start = {
  ...flightPoint("start"),
  linkedMarkersTitleKey: "map.flightPoints.connections",
  linkedMarkers: [
    { mapId: "world-atlas", markerId: destination.id, nameKey: "destination" },
    { mapId: "other-map", markerId: unrelated.id, nameKey: "unrelated" },
  ],
};
const data = { id: "world-atlas", locations: [start, destination, unrelated], regions: [] };
const render = (overrides = {}) => renderToStaticMarkup(createElement(I18nextProvider, { i18n },
  createElement(MapMarkerLayer, {
    data, points: [], poiLabelPoints: [], completedIds: [start.id, destination.id],
    selectedPoint: start, view: { centerX: 0, centerY: 0, zoom: 1 },
    width: 1000, height: 800, projection: "top", groupQuestMarkers: false,
    clusterMarkers: false, expandedClusterPointIds: [], dismissFanKey: 0, onZoomToOverlap: () => true,
    onSelect() {}, onCluster() {}, onQuestGroup() {}, ...overrides,
  })));

test("selected found flight points retain destinations when category/found filters remove pins", () => {
  const html = render();
  assert.match(html, /aria-label="start"/);
  assert.match(html, /aria-label="destination"/);
  assert.doesNotMatch(html, /aria-label="unrelated"/);
  assert.equal((html.match(/map-marker-found-badge/g) ?? []).length, 2);
});

test("connected destinations stay individual markers at clustering zoom", () => {
  assert.match(render({ clusterMarkers: true, view: { centerX: 0, centerY: 0, zoom: 0.02 } }),
    /aria-label="destination"/);
});

test("visible destinations are rendered once and disappear with the selection", () => {
  assert.equal((render({ points: [destination] }).match(/aria-label="destination"/g) ?? []).length, 1);
  assert.doesNotMatch(render({ selectedPoint: null }), /aria-label="destination"/);
});
