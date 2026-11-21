import { create } from "zustand";
import type { SavedCharacter } from "./types";

const SELECTION_KEY = "er-save-tracking-character";
const readSelection = () => {
  try { return localStorage.getItem(SELECTION_KEY) ?? ""; }
  catch (error) { console.warn("[save-tracking] Cannot restore character selection", error); return ""; }
};

interface SaveTrackingState {
  state: "loading" | "waiting" | "ready" | "no-save" | "retry" | "error";
  characters: SavedCharacter[];
  activeId: string | null;
  selectedId: string;
  error: string | null;
  focusNonce: number;
  select: (id: string) => void;
  focus: () => void;
}

export const useSaveTracking = create<SaveTrackingState>((set) => ({
  state: "loading",
  characters: [],
  activeId: null,
  selectedId: readSelection(),
  error: null,
  focusNonce: 0,
  select: (selectedId) => {
    try { localStorage.setItem(SELECTION_KEY, selectedId); }
    catch (error) { console.warn("[save-tracking] Cannot save character selection", error); }
    set({ selectedId });
  },
  focus: () => set((state) => ({ focusNonce: state.focusNonce + 1 })),
}));

export const selectedCharacter = (state: SaveTrackingState) => {
  if (state.state !== "ready" && state.state !== "retry") return null;
  const id = state.selectedId || state.activeId;
  return state.characters.find((character) => character.id === id) ?? null;
};

export const subscribeSelectionChanges = () => {
  const onStorage = (event: StorageEvent) => {
    if (event.key === SELECTION_KEY || event.key === null) {
      useSaveTracking.setState({ selectedId: readSelection() });
    }
  };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
};
