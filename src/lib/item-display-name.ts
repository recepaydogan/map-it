import { formatGameName } from "./game-display-text";
/** Preserve binding annotations while normalizing the game's all-caps typography. */
export const getItemDisplayName = (name: string): string => formatGameName(name);
