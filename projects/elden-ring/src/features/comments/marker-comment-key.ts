/**
 * The stable address a marker's notes are filed under.
 *
 * Notes outlive the data they hang off: a marker file gets rebuilt every time
 * the game data is re-extracted, so the key must be a pure rewrite of something
 * that survives that — never a join, a coordinate, or anything resolved at
 * runtime (the project's no-heuristic-joins rule applies to identity most of
 * all). EVERY marker gets one; there is no marker you cannot write a note on.
 *
 * Three namespaces, because the three kinds of marker are identified by three
 * different things:
 *
 * `er:` — Elden Ring, by marker id. There are two ER marker spaces and the same
 * boss lives in both, so these keys are built to COLLIDE ON PURPOSE where the
 * marker is the same thing:
 *
 *     ER Map tab (raw game data)    boss:12345  ─┐
 *                                                ├─► "er:er-boss-12345"
 *     Map tab (production markers)  er-boss-12345┘
 *
 * A raw marker with no production id space of its own (an MSB-placed enemy)
 * keeps its raw id — it only ever appears on the ER Map tab, so there is nothing
 * to merge it with.
 *
 * `nr:` — Nightreign, by category and name. Its ids are pattern (seed) scoped
 * and mean nothing across runs: "the church in the north-east" is a different
 * church every night. What IS stable is the POI's type, and the data spells that
 * out — 147 distinct category/name pairs, with the variant already in the name
 * ("Great Church - Mausoleum Knight", "Sorcerer's Rise - Fog Door"). So a note
 * lands on the KIND of place, which is the only thing that stays true between
 * runs, and is what someone wants to be told anyway.
 *
 * `custom:` — a player's own dropped pin, by its id. Those ids carry a random
 * suffix, so they are unique to the person who made them; nobody else has that
 * marker, so the notes are in practice private to their author. Keying them by
 * name instead would be a bug: two players both calling a pin "Boss" would land
 * in each other's notes.
 */

import type { Marker } from "../../data/types";
import { productionMarkerIdFor } from "../er-map/er-map-marker-metadata";
import type { RawErMapMarker } from "../er-map/types";

/** A dropped pin's own id already carries the `custom:` namespace (see
 *  newCustomMarkerId); anything that doesn't gets it here rather than being
 *  trusted to be unique on its own. */
const customKey = (id: string): string => (id.startsWith("custom:") ? id : `custom:${id}`);

/** Notes on the ER Map tab's raw marker. */
export const erMapCommentKey = (marker: RawErMapMarker): string =>
  marker.custom ? customKey(marker.id) : `er:${productionMarkerIdFor(marker) ?? marker.id}`;

/** Notes on the Map tab's production marker, in either game. */
export const productionCommentKey = (marker: Marker): string => {
  if (marker.custom) return customKey(marker.id);
  if (marker.game === "elden-ring") return `er:${marker.id}`;
  return `nr:${marker.category}:${marker.name}`;
};
