import { FlaskConical } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { MapRecipeUnlockProfile } from "./types";

const MapRecipeUnlockProfileSection = ({ profile }: { profile: MapRecipeUnlockProfile }) => {
  const { t } = useTranslation();

  return (
    <section className="map-dialogue-checks" aria-labelledby="map-recipe-unlock-title">
      <div className="map-dialogue-section-heading">
        <FlaskConical size={14} aria-hidden="true" />
        <h4 id="map-recipe-unlock-title">{t("map.recipeUnlock.title")}</h4>
      </div>
      <p className="map-dialogue-hint">{t("map.recipeUnlock.hint")}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {profile.recipes.map((recipe) => <span key={recipe.id} className="map-dialogue-tag">{recipe.title}</span>)}
      </div>
    </section>
  );
};

export default MapRecipeUnlockProfileSection;
