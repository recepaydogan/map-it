import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const bundled = await build({
  stdin: { contents: `
    export { MAP_CATEGORIES, MAP_MARKER_PRIORITY_ORDER, getMapMarkerPriority, getMapPointPriority, isAreaPin } from "./src/features/map/map-config.ts";
    export { createMapMarkerHitIndex } from "./src/features/map/map-marker-hit-index.ts";
    export { getMapPointMarkerScale } from "./src/features/map/marker-size-settings.ts";
    export { createMapPointClusters, getClusterCategoryKey } from "./src/features/map/map-clustering.ts";
    export { getMapMarkerZoomScale, shouldClusterMapMarkers } from "./src/features/map/map-marker-zoom.ts";
  `, resolveDir: process.cwd() },
  bundle: true, platform: "node", format: "esm", write: false,
  define: { "import.meta.env": JSON.stringify({ DEV: true, BASE_URL: "/" }) },
});
const { MAP_CATEGORIES, MAP_MARKER_PRIORITY_ORDER, getMapMarkerPriority, createMapMarkerHitIndex,
  getMapPointMarkerScale, createMapPointClusters, getClusterCategoryKey, getMapPointPriority, isAreaPin,
  getMapMarkerZoomScale, shouldClusterMapMarkers } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].contents).toString("base64")}`);
const sizes = { version: 5, groups: Object.fromEntries(MAP_CATEGORIES.map(category => [category.groupId, 100])), categories: {} };
const projection = (category, left = 100, top = 100) => ({
  point: {
    id: category, name: category, category, x: left, y: top,
    iconPath: "maps/category-icons/gta6-generated/monument.png",
    ...(category === "custom" ? { subtype: "custom", regionId: "personal", icon: "pin" } : {}),
  }, left, top,
});
// The renderer paints low priorities first; canvas picking walks that order backwards.
const paintOrder = points => [...points].sort((a, b) => getMapPointPriority(a.point) - getMapPointPriority(b.point)
  || a.point.id.localeCompare(b.point.id));

test("the area pin is 20 percent smaller and behind every other icon, independent of category", () => {
  for (const category of MAP_CATEGORIES.filter(c => c.id !== 'custom')) {
    const base = projection(category.id).point;
    const area = {...base, iconPath:'maps/category-icons/gta6-generated/area.png'};
    const other = {...base, iconPath:'maps/category-icons/gta6-generated/water-tower.png'};
    assert(isAreaPin(area));assert(!isAreaPin(other));
    assert(getMapPointPriority(area)<getMapPointPriority(other));
    assert.equal(getMapPointMarkerScale(area,sizes),0.8);
    assert(getMapPointMarkerScale(other,sizes) > getMapPointMarkerScale(area,sizes));
  }
  const area = {...projection('place-landmark').point, id:'area',areaLabel:true,
    iconPath:'maps/category-icons/gta6-generated/warehouse.png'};
  assert(isAreaPin(area), 'Area-label appearance takes precedence over original artwork');
  const other = {...area,id:'tower',areaLabel:false,iconPath:'maps/category-icons/gta6-generated/water-tower.png'};
  const points=[area,other].map(point=>({point,left:100,top:100}));
  points.sort((a,b)=>getMapPointPriority(a.point)-getMapPointPriority(b.point));
  assert.equal(createMapMarkerHitIndex(points,sizes)(100,100)?.point.id,'tower');
  assert.equal(createMapMarkerHitIndex([points[0]],sizes)(115,100),null,'Smaller pin has a matching hit target');
  const clusters=createMapPointClusters(points,null,.02,point=>`${getClusterCategoryKey(point)}:${getMapPointPriority(point)}`);
  assert.equal(clusters.length,2,'Different artwork priorities do not merge into one cluster');
});

test("every configured category has one priority, below hover and selection", () => {
  const categories = MAP_MARKER_PRIORITY_ORDER.flat();
  assert.equal(categories.length, new Set(categories).size);
  assert.deepEqual([...categories].sort(), MAP_CATEGORIES.map(category => category.id).sort());
  assert(getMapMarkerPriority("custom") < 40);
  assert.equal(getMapMarkerPriority("unknown-future-category"), 1);
});

test("draw order, default sizes and hit-testing agree for the old and new categories", () => {
  const tiers = MAP_MARKER_PRIORITY_ORDER.map(([category]) => projection(category));
  const arranged = paintOrder(tiers);
  assert.deepEqual(arranged, [...tiers].reverse());
  for (let index = 1; index < arranged.length; index++) {
    assert(getMapPointMarkerScale(arranged[index].point, sizes) > getMapPointMarkerScale(arranged[index - 1].point, sizes));
  }
  assert.equal(createMapMarkerHitIndex(arranged, sizes)(100, 100)?.point.category, "custom");
  assert(!isAreaPin(tiers[0].point), "A personal pin can use the same art without becoming a background area label");
  const fire = projection("place-fire");
  const event = projection("place-event");
  const card = projection("place-card");
  const stop = projection("place-transit-stop");
  assert.deepEqual(paintOrder([fire, stop, event, card]).map(row => row.point.category),
    ["place-transit-stop", "place-card", "place-event", "place-fire"]);
});

test("overlapping pins follow personal, landmark, shop and building priorities", () => {
  const categories = ["place-residential", "place-industrial", "place-retail", "place-landmark", "custom"];
  for (const order of [categories, [...categories].reverse()]) {
    const points = order.map(category => projection(category));
    for (const expected of [...categories].reverse()) {
      const sorted = paintOrder(points);
      assert.equal(sorted.at(-1).point.category, expected);
      assert.equal(createMapMarkerHitIndex(sorted, sizes)(100, 100)?.point.category, expected);
      points.splice(points.findIndex(row => row.point.category === expected), 1);
    }
    assert.equal(createMapMarkerHitIndex(points, sizes)(100, 100), null);
  }
});

test("a nearby high priority pin does not capture clicks outside its icon", () => {
  const points = paintOrder([projection("place-residential", 100, 100), projection("place-landmark", 122, 100)]);
  const pick = createMapMarkerHitIndex(points, sizes);
  assert.equal(pick(100, 100)?.point.category, "place-residential");
  assert.equal(pick(116, 100)?.point.category, "place-landmark");
});

test("enlarged landmarks keep their priority across hit-index cell boundaries", () => {
  const large = { ...sizes, categories: { "place-natural": 200 } };
  const points = paintOrder([projection("place-office", 35, 100), projection("place-natural", 65, 100)]);
  assert.equal(createMapMarkerHitIndex(points, large)(45, 100)?.point.category, "place-natural");
  assert.equal(createMapMarkerHitIndex([projection("place-natural", 35, 100)], large)(73, 100)?.point.category,
    "place-natural", "An enlarged pin remains clickable two cells away");
});

test("overview clustering keeps category priorities separate and retains all pins", () => {
  const points = [projection("place-landmark"), projection("place-hotel"), projection("place-residential"),
    { ...projection("place-residential"), point: { ...projection("place-residential").point, id: "second-creature" } }];
  const clusters = createMapPointClusters(points, null, 0.02);
  assert.equal(clusters.flatMap(cluster => cluster.items).length, points.length);
  for (const cluster of clusters) assert.equal(new Set(cluster.items.map(item => getMapMarkerPriority(item.point.category))).size, 1);
  const top = [...clusters].sort((a, b) => getMapMarkerPriority(a.items[0].point.category) - getMapMarkerPriority(b.items[0].point.category)).at(-1);
  assert.equal(top.items[0].point.category, "place-landmark");
});

test("pins and overlapping groups keep their anchors and size between displayed 2% and 3%", () => {
  const station = { ...projection("place-gas").point, x: -6234.496, y: 762.962 };
  const bridge = { ...projection("place-transportation").point, x: -6050, y: 657 };
  const shops = [
    { ...projection("place-retail").point, x: -6240, y: 760, id: "shop-a" },
    { ...projection("place-retail").point, x: -6241, y: 800, id: "shop-b" },
  ];

  const overviewScale = getMapMarkerZoomScale(0.02, "top");
  for (const zoom of [0.02, 0.024, 0.03, 0.034]) {
    assert.equal(getMapMarkerZoomScale(zoom, "top"), overviewScale);
    assert.equal(shouldClusterMapMarkers(true, zoom), true);
    const points = [station, bridge, ...shops].map(point => ({ point, left: point.x * zoom, top: point.y * zoom }));
    const clusters = createMapPointClusters(points, null, zoom);
    const shopGroup = clusters.find(cluster => cluster.items.length === 2);
    assert.ok(shopGroup);
    assert.ok(Math.abs(shopGroup.left / zoom - (shops[0].x + shops[1].x) / 2) < 1e-6);
    assert.ok(Math.abs(shopGroup.top / zoom - (shops[0].y + shops[1].y) / 2) < 1e-6);
    for (const point of [station, bridge]) {
      const cluster = clusters.find(candidate => candidate.items[0].point.id === point.id);
      assert.deepEqual([cluster.left, cluster.top], [point.x * zoom, point.y * zoom]);
    }
  }
});
