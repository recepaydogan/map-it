import { CHARACTER_PROFILE_CONFIG } from "../../game-config";

export const characterProfileImageUrl = (value: string | null | undefined): string | null => {
  if (!value) return null;
  try {
    const url = new URL(value, CHARACTER_PROFILE_CONFIG.profileImageBaseUrl);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
};
