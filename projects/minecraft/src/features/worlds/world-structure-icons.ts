import { Castle, DoorOpen, Flag, House, Landmark, Ship, Waves, type LucideIcon } from "lucide-react";

export type StructureIconName = "home" | "landmark" | "castle" | "waves" | "ship" | "flag" | "portal";
const icons: Record<StructureIconName, LucideIcon> = {
  home: House, landmark: Landmark, castle: Castle, waves: Waves, ship: Ship, flag: Flag, portal: DoorOpen,
};
export const structureIcon = (name: StructureIconName): LucideIcon => icons[name];
