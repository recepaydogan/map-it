/** Publish placed direction signs with reciprocal links to their posted places. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const trace = await readJson("data/client-research/world-signpost-relations.json");
const atlas = await readJson("public/maps/world-atlas/metadata.json");
const english = await readJson("src/i18n/locales/en.json");
const settlementPath = "public/maps/world-atlas/locations-settlements.json";
const pointPath = "public/maps/world-atlas/locations-points-of-interest.json";
const overlayPath = "public/maps/world-atlas/locations-client.json";
const signpostPath = "public/maps/world-atlas/locations-world-signposts.json";
const settlements = await readJson(settlementPath);
const points = await readJson(pointPath);
const overlays = await readJson(overlayPath);
if (trace.source.build !== atlas.source.build
  || trace.source.product !== atlas.source.product
  || trace.physicalSignCount !== trace.atlasSignCount + trace.outsideAtlas.length
  || trace.atlasSignCount !== trace.nativeTerrainSignCount + trace.outsideNativeTerrain.length
  || trace.nativeTerrainSignCount !== trace.signposts.reduce((sum, post) =>
    sum + post.members.length, 0)
  || trace.signposts.length !== trace.signpostCount
  || english.map.directionalSigns.name !== "Directional signpost"
  || english.map.directionalSigns.signedPlaces !== "Points toward") {
  throw new Error("Client direction signs and world atlas are not verified for publication.");
}
const places = new Map([...settlements.locations, ...points.locations,
  ...overlays.locations.filter(({ category }) => ["city", "town"].includes(category))].map((place) =>
  [place.id, place]));
const localize = (key) => key.split(".").reduce((value, part) => value?.[part], english);
const reverse = new Map();
const locations = trace.signposts.map((post) => {
  const { x, y } = post.atlasPosition;
  const nameKey = `map.worldSignposts.${post.signpostId.replace("client-world-signpost-", "")}`;
  const expectedName = `Sign to ${post.destinations[0].name}${post.destinations.length > 1
    ? ` +${post.destinations.length - 1}` : ""}`;
  if (x < atlas.bounds.minX || x > atlas.bounds.maxX
    || y < atlas.bounds.minY || y > atlas.bounds.maxY
    || post.members[0]?.nativeTerrain?.alpha === 0
    || post.members[0]?.atlasPosition.x !== x
    || post.members[0]?.atlasPosition.y !== y
    || localize(nameKey) !== expectedName) {
    throw new Error(`Signpost ${post.signpostId} has no verified terrain position.`);
  }
  const links = post.destinations.map((destination) => {
    const place = places.get(destination.placeLocationId);
    if (!place || place.id !== destination.placeLocationId
      || localize(place.nameKey) !== destination.name
      || !["city", "town", "point-of-interest"].includes(place.category)
      || !post.members.some(({ placeLocationId }) => placeLocationId === place.id)) {
      throw new Error(`Signpost ${post.signpostId} has an unverified destination.`);
    }
    const backLinks = reverse.get(place.id) ?? [];
    backLinks.push({ mapId: "azeroth", markerId: post.signpostId,
      nameKey });
    reverse.set(place.id, backLinks);
    return { mapId: "azeroth", markerId: place.id, nameKey: place.nameKey };
  });
  return { id: post.signpostId, name: "", nameKey,
    category: "directional-signpost", label: "", subtype: "directional-sign",
    regionId: "", region: "", x, y,
    linkedMarkerGroups: [{ titleKey: "map.directionalSigns.signedPlaces", links }] };
});
const appendReverse = (layer) => {
  layer.locations = layer.locations.map((place) => {
    const groups = (place.linkedMarkerGroups ?? []).map((group) => ({ ...group,
      links: group.links.filter(({ markerId }) =>
        !markerId.startsWith("client-world-signpost-")),
    })).filter(({ links }) => links.length);
    const links = reverse.get(place.id) ?? [];
    const signposts = groups.find(({ titleKey }) => titleKey === "map.places.signposts");
    if (signposts) signposts.links.push(...links);
    else if (links.length) groups.push({ titleKey: "map.places.signposts", links });
    const updated = { ...place };
    if (groups.length) updated.linkedMarkerGroups = groups;
    else delete updated.linkedMarkerGroups;
    return updated;
  });
};
appendReverse(settlements);
appendReverse(points);
appendReverse(overlays);
await writeFile(join(root, signpostPath), `${JSON.stringify({ locations }, null, 2)}\n`);
await writeFile(join(root, settlementPath), `${JSON.stringify(settlements, null, 2)}\n`);
await writeFile(join(root, pointPath), `${JSON.stringify(points, null, 2)}\n`);
await writeFile(join(root, overlayPath), `${JSON.stringify(overlays, null, 2)}\n`);
console.log(`Published ${locations.length} physical signposts with ${[...reverse.values()].reduce((sum, links) => sum + links.length, 0)} reciprocal posted-place links.`);
