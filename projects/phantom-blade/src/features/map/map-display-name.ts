import i18n from "../../i18n";
import { getGameText } from "../../i18n/game-text";
import { formatGameName } from "../../lib/game-display-text";
import { getMapDefinition } from "./map-registry";

export const getMapDisplayName = (id: string | null | undefined): string => {
  const map = getMapDefinition(id);
  return formatGameName(map.nameKey ? String(i18n.t(map.nameKey)) : getGameText(i18n.language, map.name));
};
