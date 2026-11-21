import { AlertTriangle, Boxes, Home, MapPin, Route } from "lucide-react";
import type { UserMarkerGroup } from "./types";

export const DEFAULT_MARKER_GROUP: UserMarkerGroup = "general";

/** The groups a personal marker can be filed under; labels are `map.markerGroups.<id>`. */
export const MARKER_GROUPS = [
  { id: "general", icon: MapPin },
  { id: "base", icon: Home },
  { id: "resources", icon: Boxes },
  { id: "travel", icon: Route },
  { id: "danger", icon: AlertTriangle },
] as const satisfies ReadonlyArray<{ id: UserMarkerGroup; icon: typeof MapPin }>;
