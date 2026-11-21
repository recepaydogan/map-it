import { createContext, useContext } from "react";
import type { NativeWikiEntry } from "../reference/use-native-wiki";

export type NativeMarkerInspectorSection = "properties" | "upgrades";
export interface NativeMarkerInspectorRequest { entry: NativeWikiEntry; section: NativeMarkerInspectorSection; markerCategory?: string }
export const NativeMarkerInspectorContext = createContext<{
  active: NativeMarkerInspectorRequest | null;
  open: (request: NativeMarkerInspectorRequest) => void;
} | null>(null);
export const useNativeMarkerInspector = () => useContext(NativeMarkerInspectorContext);
