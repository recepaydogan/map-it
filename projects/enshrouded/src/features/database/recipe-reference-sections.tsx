import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ReferenceEntry, ReferenceSection } from "../reference/reference-types";
import ReferenceSections from "../reference/reference-sections";
import { withRecipeItemDetails } from "./recipe-item-details";
import { useItemCatalog } from "./use-item-catalog";

const RecipeReferenceSections = ({ entry, sections }: { entry: ReferenceEntry; sections: ReferenceSection[] }) => {
  const { t } = useTranslation();
  const catalogState = useItemCatalog();
  const catalog = catalogState.status === "ready" ? catalogState.catalog : null;
  const itemsById = useMemo(() => new Map(catalog?.items.map((item) => [item.id, item]) ?? []), [catalog]);
  return <ReferenceSections sections={withRecipeItemDetails(entry, sections, itemsById,
    (level) => t("database.recipeRequiredEnhancement", { level }))} />;
};

export default RecipeReferenceSections;
