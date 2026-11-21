import { useTranslation } from "react-i18next";
import type { ReferenceNavigationProps, ReferenceSummary } from "../reference/reference-types";
import { useReferenceEntry, useReferenceIndex } from "../reference/use-reference-data";
import DatabasePage from "./database-page";

type Props = ReferenceNavigationProps & {
  onOpenMap: (mapId: string, markerId: string) => void;
};

const RecipeItem = ({ summary, ...props }: Props & { summary: ReferenceSummary }) => {
  const { t } = useTranslation();
  const state = useReferenceEntry(summary);
  if (state.status !== "ready") return <p className="p-6 text-sm text-muted" role={state.status === "error" ? "alert" : "status"}>{t(state.status === "error" ? "reference.error" : "reference.loading")}</p>;
  const output = state.data.sections.find((section) => section.title === "reference.labels.produces")
    ?.links?.find((link) => link.category === "items");
  return output ? <DatabasePage key={output.id} initialItemId={output.id} initialRecipeId={summary.id} {...props} />
    : <p className="p-6 text-sm text-muted">{t("database.noSectionData")}</p>;
};

// Existing source links resolve to their output item instead of a recipe browser.
const RecipeItemTarget = ({ recipeId, ...props }: Props & { recipeId: string }) => {
  const { t } = useTranslation();
  const index = useReferenceIndex();
  if (!recipeId) return <DatabasePage {...props} />;
  if (index.status !== "ready") return <p className="p-6 text-sm text-muted" role={index.status === "error" ? "alert" : "status"}>{t(index.status === "error" ? "reference.error" : "reference.loading")}</p>;
  const summary = index.data.entries.find((entry) => entry.id === recipeId && entry.category === "recipes");
  return summary ? <RecipeItem summary={summary} {...props} />
    : <p className="p-6 text-sm text-danger-text" role="alert">{t("reference.error")}</p>;
};

export default RecipeItemTarget;
