/**
 * The reverse of marker-comment-key: what to CALL the place a note is filed
 * under, for the one surface that reads notes without standing on the marker —
 * the moderation queue.
 *
 * Not every key can be named, and that is by design rather than a gap:
 *   • `er:<production id>` resolves to a real marker, and can be jumped to.
 *   • `er:<raw id>` is an ER Map tab marker with no production twin; naming it
 *     would mean loading the whole spatial dataset for a label, so the queue
 *     shows the key instead.
 *   • `nr:<category>:<name>` carries its own name — Nightreign is keyed by the
 *     POI type — but there is nowhere to jump: the place moves every night.
 *   • `custom:<id>` is someone else's private pin. This build has never seen it.
 */

import { markersByGame } from "../../data/markers";
import type { Marker } from "../../data/types";

export interface CommentTarget {
  /** Display name, or null when this build cannot name the key. */
  name: string | null;
  /** Production marker id to select on the map, when the key points at one. */
  markerId: string | null;
}

// markersByGame is a LIVE BINDING reassigned to localized copies on every
// language change, so the index is rebuilt when the source identity moves —
// a module-load snapshot would pin these names to the boot language.
let indexedSource: Marker[] | null = null;
let byId = new Map<string, Marker>();

const ensureIndex = (): Map<string, Marker> => {
  const source = markersByGame["elden-ring"];
  if (source !== indexedSource) {
    indexedSource = source;
    byId = new Map(source.map((marker) => [marker.id, marker]));
  }
  return byId;
};

export const commentTargetFor = (markerKey: string): CommentTarget => {
  if (markerKey.startsWith("er:")) {
    const id = markerKey.slice(3);
    const marker = ensureIndex().get(id);
    return marker ? { name: marker.name, markerId: marker.id } : { name: null, markerId: null };
  }

  if (markerKey.startsWith("nr:")) {
    const rest = markerKey.slice(3);
    const split = rest.indexOf(":");
    return { name: split >= 0 ? rest.slice(split + 1) : rest, markerId: null };
  }

  return { name: null, markerId: null };
};
