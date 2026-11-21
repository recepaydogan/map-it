import instances from "../../../public/maps/world-atlas/locations-instances.json";
import boundaries from "../../../public/data/gathering/fishing-boundaries.json";
import levels from "../../../public/data/gathering/fishing-levels.json";
import type { ReferenceSummary } from "./reference-types";

function regionAt(x: number, y: number) {
  const area = boundaries.regions.find(({ rings }) => {
    let inside = false;
    for (const ring of rings) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [ax, ay] = ring[j]! as [number, number];
        const [bx, by] = ring[i]! as [number, number];
        if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
      }
    }
    return inside;
  });
  const zone = area && levels.zones.find((entry) => entry.id === area.id && entry.kind !== "water");
  return zone?.name;
}

// Match the dungeon index to the same entrance marker and player count used by the map.
const entrances = new Map(instances.locations.map(point => [point.reference?.id ?? point.id, {
  region: point.region || regionAt(point.x, point.y),
  groupSize: point.instanceFacts?.groupSize,
}]));

export const dungeonListFacts = ({ id, adventure }: ReferenceSummary) => {
  const entrance = id === "scarlet-monastery" ? entrances.get("796") : entrances.get(id);
  return {
    region: adventure?.region || entrance?.region,
    groupSize: entrance?.groupSize ?? adventure?.partySize ?? (adventure?.kind === "party" ? 5 : undefined),
  };
};
