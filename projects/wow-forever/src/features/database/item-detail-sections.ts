import type { ReferenceSection } from "../reference/reference-types";
import type { ItemDetailTab } from "./item-detail-tabs";

export const isAcquisitionSection = (section: ReferenceSection) => [
  "reference.labels.additional-acquisition-sources",
  "reference.labels.available-from-boxes",
  "reference.labels.monolith-sources",
].includes(section.title);

export const getItemSectionGroup = (section: ReferenceSection): ItemDetailTab | "acquisition" => {
  if (isAcquisitionSection(section) || section.title === "reference.labels.crafted-from"
    || section.title === "reference.labels.substance-conversion"
    || section.title === "reference.labels.shop-purchase-limits") return "acquisition";
  if (section.title === "reference.labels.dismantling") return "dismantling";
  if (section.title === "reference.labels.upgrades-and-sets"
    || section.title === "reference.labels.imprint-chances"
    || section.title === "reference.labels.transfer-chances"
    || section.title === "reference.labels.used-in-recipes") return "upgrades";
  return "statistics";
};
