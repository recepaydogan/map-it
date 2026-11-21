import { AlertTriangle, Boxes, Car, Home, LocateFixed, MapPin } from "lucide-react";
import type { UserMarkerGroup } from "./types";

export const DEFAULT_MARKER_GROUP: UserMarkerGroup = "general";

export const MARKER_GROUPS = [
  { id: "general", icon: MapPin },
  { id: "safehouses", icon: Home },
  { id: "my-position", icon: LocateFixed },
  { id: "loot", icon: Boxes },
  { id: "vehicles", icon: Car },
  { id: "danger", icon: AlertTriangle },
] as const satisfies ReadonlyArray<{ id: UserMarkerGroup; icon: typeof MapPin }>;
