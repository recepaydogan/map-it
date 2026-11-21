import { GAME_STRUCTURE_GROUPS, GAME_STRUCTURE_TYPES } from "../../game-config";
import { getUserMarkerAppearance, USER_MARKER_ICONS } from "../map/map-config";
import type { UserMarkerColor, UserMarkerIcon } from "../map/types";
import { structureIcon } from "./world-structure-icons";

export const WORLD_PIN_STRUCTURE_ICONS = [
  ...GAME_STRUCTURE_GROUPS.map(group => ({
    id: `structure-group:${group.id}`, labelKey: `structureMap.groups.${group.id}`,
    icon: structureIcon(group.icon), artwork: group.artwork, accentColor: undefined as string | undefined,
    darkArtwork: "darkArtwork" in group && group.darkArtwork === true,
  })),
  ...GAME_STRUCTURE_TYPES.map(type => ({
    id: `structure:${type.id}`, labelKey: `structureMap.types.${type.id}`,
    icon: structureIcon(type.icon), artwork: type.artwork, accentColor: type.color as string | undefined,
    darkArtwork: "darkArtwork" in type && type.darkArtwork === true,
  })),
];

export const isStructureWorldPinIcon = (icon: string): boolean =>
  WORLD_PIN_STRUCTURE_ICONS.some(option => option.id === icon);

export const getWorldPinAppearance = (icon: string, color: UserMarkerColor) => {
  const structure = WORLD_PIN_STRUCTURE_ICONS.find(option => option.id === icon);
  if (structure) return {
    icon: structure.icon, source: structure.artwork,
    markerClass: "map-marker-structure", accentColor: structure.accentColor,
    darkArtwork: structure.darkArtwork,
  };
  const generic = getUserMarkerAppearance(color, icon as UserMarkerIcon);
  return { ...generic, source: undefined, accentColor: undefined, darkArtwork: false };
};

export const genericWorldPinIcon = (icon: string): UserMarkerIcon | null => {
  if (isStructureWorldPinIcon(icon)) return null;
  return USER_MARKER_ICONS.find(option => option.id === icon)?.id ?? "pin";
};
