import { ITEM_RECIPE_ENHANCEMENT_REQUIREMENT } from "../../game-config.ts";
import type { ReferenceEntry, ReferenceSection } from "../reference/reference-types";
import type { DatabaseItem } from "./item-database-types";

export const withRecipeItemDetails = (
  entry: Pick<ReferenceEntry, "group">,
  sections: ReferenceSection[],
  itemsById: Map<string, DatabaseItem>,
  formatRequiredEnhancement: (level: number) => string,
): ReferenceSection[] => sections.map((section) => {
  const ingredient = section.title === "reference.labels.ingredients";
  if (!ingredient && section.title !== "reference.labels.produces") return section;
  return { ...section, links: section.links?.map((link) => {
    if (link.category !== "items") return link;
    const item = itemsById.get(link.id);
    if (!item) return link;
    const requirement = ingredient && entry.group === ITEM_RECIPE_ENHANCEMENT_REQUIREMENT.recipeGroup
      ? item.description?.match(ITEM_RECIPE_ENHANCEMENT_REQUIREMENT.descriptionPattern)
      : undefined;
    const level = requirement ? Number(requirement[1]) : 0;
    const note = [link.note, item.grade, level > 0 ? formatRequiredEnhancement(level) : undefined]
      .filter(Boolean).join(" · ");
    return note ? { ...link, note } : link;
  }) };
});
