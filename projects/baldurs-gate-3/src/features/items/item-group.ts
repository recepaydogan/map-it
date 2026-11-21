import { humanize } from "../../lib/humanize";

/** The game data spells "no object group" as an empty string or "None". */
const isMeaningfulGroup = (group: string, type?: string) =>
  Boolean(group) && group !== "None" && group !== type;

/**
 * An item's own object group ("Drink;Alcohol_Rich" reads as
 * "Drink · Alcohol Rich"), or undefined when the data has none and the caller
 * should fall back to the item category label.
 */
export const formatItemGroup = (item: { subtype?: string; type?: string }) => {
  const group = item.subtype?.trim() ?? "";
  if (!isMeaningfulGroup(group, item.type)) return undefined;
  return group.split(";").map(humanize).join(" · ");
};
