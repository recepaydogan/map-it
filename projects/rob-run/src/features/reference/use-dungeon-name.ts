import { useCallback } from "react";
import { useGameText } from "../../i18n/game-text";
import { dungeonDisplayName } from "../map/dungeon-maps";

export const useDungeonName = () => {
  const gameText = useGameText();
  return useCallback((name: string) => dungeonDisplayName(name, gameText), [gameText]);
};
