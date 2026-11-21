import assert from "node:assert/strict";
import { matchesTravelFilters } from "../src/features/reference/travel-presentation.ts";
import { isCurrentTravelDestination } from "../src/features/reference/travel-destination-context.ts";

const entry = { travel: { kind: "teleport", regions: ["Harbor"], faction: "All", hasMarker: true } };
assert(matchesTravelFilters(entry, { region: "Harbor", faction: "Dark" }), "Shared points must remain available when filtering one faction");
assert(!matchesTravelFilters(entry, { region: "Desert", faction: "" }));
assert(!matchesTravelFilters(entry, { region: "", faction: "unknown" }), "Shared points are not unknown-faction points");
assert(!matchesTravelFilters({ travel: { ...entry.travel, faction: "Light" } }, { region: "", faction: "Dark" }));
assert(matchesTravelFilters({ unnamed: true, travel: { ...entry.travel, hasMarker: false } }, { region: "", faction: "" }),
  "Travel entries remain available regardless of marker coverage or name availability");
console.log("Travel filters verified.");

const marker = { mapId: "harbor", markerId: "waypoint" };
const waypoint = { travel: { kind: "teleport" }, locations: [marker] };
assert(isCurrentTravelDestination(waypoint, marker), "A waypoint must not offer navigation back to its own landing point");
assert(!isCurrentTravelDestination(waypoint), "Database navigation to the waypoint must remain available");
assert(!isCurrentTravelDestination(waypoint, { ...marker, mapId: "another-map" }));
assert(!isCurrentTravelDestination({ ...waypoint, travel: { kind: "npc" } }, marker), "NPC departures must retain their outbound destination links");
assert(!isCurrentTravelDestination({ ...waypoint, travel: { kind: "rift" } }, marker));
console.log("Waypoint identity is distinguished from outbound routes.");
