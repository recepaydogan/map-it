import { POSITION_ADDON_CONFIG } from "../../game-config";

function meetsVersion(version: string | null, threshold: string): boolean {
  if (!version || !/^\d+\.\d+\.\d+$/.test(version)) return false;
  const minimum = threshold.split(".").map(Number);
  const parts = version.split(".").map(Number);
  const firstDifference = parts.findIndex((part, index) => part !== minimum[index]);
  return firstDifference < 0 || parts[firstDifference]! > minimum[firstDifference]!;
}

export const supportsPositionCard = (version: string | null) =>
  meetsVersion(version, POSITION_ADDON_CONFIG.positionCardVersion);

export const supportsStartTracker = (version: string | null) =>
  meetsVersion(version, POSITION_ADDON_CONFIG.startTrackerVersion);

export const isCurrentPositionAddon = (version: string | null) =>
  meetsVersion(version, POSITION_ADDON_CONFIG.currentVersion);
