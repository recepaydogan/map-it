import { create } from "zustand";
import type { Game, MapLayer } from "../../data/types";

/**
 * Transient UI state for the custom-marker authoring flow (NOT persisted — the
 * markers themselves live in map-store). Kept in its own tiny store so arming
 * "placing mode" or opening the dialog doesn't re-render the whole map-experience
 * tree (which would churn the marker layer).
 *
 * Flow: arm() → the user clicks the map → beginCreate(spot) opens the dialog
 * pre-located at that pixel → save writes to map-store and close()s. Editing an
 * existing marker skips placing: beginEdit(id) opens the same dialog by id.
 */
export interface CreateSpot {
  /** NOMINAL-space pixel where the user clicked. */
  pixel: { x: number; y: number };
  game: Game;
  layer: MapLayer;
}

interface CustomMarkerUi {
  /** Armed and waiting for a map click to drop the new marker. */
  placing: boolean;
  /** Set once the user clicks the map → the create dialog opens here. */
  createSpot: CreateSpot | null;
  /** Id of the custom marker being edited, or null. */
  editId: string | null;
  /** Marker most recently saved by the shared dialog; consumed by the active map. */
  savedId: string | null;

  /** Enter placing mode (the "Add marker" button). */
  arm: () => void;
  /** Leave placing mode without creating anything. */
  disarm: () => void;
  /** Map was clicked while armed → open the create dialog at this spot. */
  beginCreate: (spot: CreateSpot) => void;
  /** Open the dialog to edit an existing custom marker. */
  beginEdit: (id: string) => void;
  /** Close the dialog (and clear any placing state). */
  close: () => void;
  notifySaved: (id: string) => void;
  clearSaved: () => void;
}

export const useCustomMarkerUi = create<CustomMarkerUi>((set) => ({
  placing: false,
  createSpot: null,
  editId: null,
  savedId: null,

  arm: () => set({ placing: true, createSpot: null, editId: null }),
  disarm: () => set({ placing: false }),
  beginCreate: (spot) => set({ placing: false, createSpot: spot, editId: null }),
  beginEdit: (id) => set({ placing: false, createSpot: null, editId: id }),
  close: () => set({ placing: false, createSpot: null, editId: null }),
  notifySaved: (id) => set({ savedId: id }),
  clearSaved: () => set({ savedId: null }),
}));
