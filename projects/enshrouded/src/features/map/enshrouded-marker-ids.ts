import mapMetadata from "../../../public/maps/enshrouded/metadata.json";

export const VALID_ENSHROUDED_MARKER_IDS = new Set(mapMetadata.locations.map((point) => point.id));
export const ENSHROUDED_MARKER_NAMES = new Map(mapMetadata.locations.map((point) => [point.id, point.name]));
