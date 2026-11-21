import { pointReference, type DimensionView, type TrackedDestination,
  type WorldPersonalState, type WorldPin } from "./world-types.ts";
import type { ObservedJourneyPortal } from "../journey/journey-observed-portals.ts";

export const TRACKED_DESTINATION_LIMIT = 24;

export class TrackedDestinationLimitError extends Error {
  constructor() { super(`Tracked destination limit (${TRACKED_DESTINATION_LIMIT}) reached.`); }
}

export const togglePointState = (
  state: WorldPersonalState, field: "favorites" | "found", dimension: string, pointId: string,
): WorldPersonalState => {
  const ref = pointReference(dimension, pointId);
  return { ...state, [field]: state[field].includes(ref)
    ? state[field].filter(item => item !== ref) : [...state[field], ref] };
};

export const savePointNote = (
  state: WorldPersonalState, dimension: string, pointId: string, note: string,
): WorldPersonalState => {
  const notes = { ...state.notes };
  const ref = pointReference(dimension, pointId);
  if (note.trim()) notes[ref] = note.slice(0, 10_000);
  else delete notes[ref];
  return { ...state, notes };
};

export const putWorldPin = (state: WorldPersonalState, pin: WorldPin): WorldPersonalState => ({
  ...state, pins: state.pins.some(item => item.id === pin.id)
    ? state.pins.map(item => item.id === pin.id ? structuredClone(pin) : item)
    : [...state.pins, structuredClone(pin)],
});

export const removeWorldPin = (state: WorldPersonalState, pinId: string): WorldPersonalState => {
  const pin = state.pins.find(item => item.id === pinId);
  if (!pin) return state;
  const ref = pointReference(pin.dimension, pin.id);
  const notes = { ...state.notes };
  delete notes[ref];
  return {
    ...state, pins: state.pins.filter(item => item.id !== pin.id), notes,
    favorites: state.favorites.filter(item => item !== ref),
    found: state.found.filter(item => item !== ref),
    tracked: state.tracked.filter(item => item.pointId !== pin.id || item.dimension !== pin.dimension),
  };
};

export const removeObservedPortal = (state: WorldPersonalState, portal: ObservedJourneyPortal): WorldPersonalState => ({
  ...state,
  portals: (state.portals ?? []).filter(item => item.id !== portal.id),
  removedPortals: [...(state.removedPortals ?? []).filter(item => item.id !== portal.id), structuredClone(portal)],
});

export const setTrackedDestination = (
  state: WorldPersonalState, destination: TrackedDestination, tracked: boolean,
): WorldPersonalState => {
  const existing = state.tracked.some(item => item.id === destination.id);
  if (tracked && !existing && state.tracked.length >= TRACKED_DESTINATION_LIMIT) {
    throw new TrackedDestinationLimitError();
  }
  return { ...state, tracked: tracked
    ? [...state.tracked.filter(item => item.id !== destination.id), structuredClone(destination)]
    : state.tracked.filter(item => item.id !== destination.id) };
};

export const saveDimensionView = (
  state: WorldPersonalState, dimension: string, view: DimensionView,
): WorldPersonalState => ({ ...state, views: { ...state.views, [dimension]: structuredClone(view) } });
