import { erItemExtra } from "./er-codex-extras";
import { erItemKey, type ErItem } from "./er-items-data";
import { localizeErMapText } from "./er-map-text";

/** The game's terse one-liner for an item ("Raises attributes, but also increases damage
 *  taken"), rendered above the lore passage. Ashes of War are excluded: `GemInfo` is
 *  boilerplate — byte-identical on all 117 of them ("Grants affinities and skills to an
 *  armament") — so it would only restate the category heading. */
export const erItemInfo = (item: ErItem): string | undefined => {
  if (item.category === "ash-of-war") return undefined;
  const info = erItemExtra(erItemKey(item))?.info;
  // The *Info FMG one-liners are baked English; the ER-map flat dictionary
  // carries their official translations.
  return info ? localizeErMapText(info) : undefined;
};
