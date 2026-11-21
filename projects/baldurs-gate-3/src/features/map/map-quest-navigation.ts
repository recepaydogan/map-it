import type { MapSearchIndexLocation } from "./types";

const normalizeMarkerName = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase();

const hasExactMarkerName = (location: MapSearchIndexLocation, markerTitle: string) => {
  const normalizedTitle = normalizeMarkerName(markerTitle);
  return [location.name, ...(location.searchTerms ?? [])]
    .some((name) => normalizeMarkerName(name) === normalizedTitle);
};

interface FindQuestMarkerLocationOptions {
  locations: MapSearchIndexLocation[];
  markerTitle?: string;
  currentContentId: string;
  currentMapId: string;
}

/** Resolve only exact marker-name matches, preferring the marker whose quest
 * panel is already open and then another marker on the current map. */
export const findQuestMarkerLocation = ({
  locations,
  markerTitle,
  currentContentId,
  currentMapId,
}: FindQuestMarkerLocationOptions) => {
  if (!markerTitle?.trim()) return undefined;
  const matches = locations.filter((location) => hasExactMarkerName(location, markerTitle));
  return matches.find((location) => (
    location.contentId === currentContentId && location.mapId === currentMapId
  ))
    ?? matches.find((location) => location.contentId === currentContentId)
    ?? matches.find((location) => location.mapId === currentMapId)
    ?? matches[0];
};

export const splitTextAtMarker = (text: string, markerTitle: string) => {
  const start = text.toLocaleLowerCase().indexOf(markerTitle.toLocaleLowerCase());
  if (start < 0) return undefined;
  return {
    before: text.slice(0, start),
    marker: text.slice(start, start + markerTitle.length),
    after: text.slice(start + markerTitle.length),
  };
};
