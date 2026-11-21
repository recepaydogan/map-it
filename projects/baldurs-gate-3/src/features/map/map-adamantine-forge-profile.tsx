import { Hammer } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { MapAdamantineForgeProfile } from "./types";

const MapAdamantineForgeProfileSection = ({ profile }: { profile: MapAdamantineForgeProfile }) => {
  const { t } = useTranslation();

  return (
    <section className="map-dialogue-checks" aria-labelledby="map-adamantine-forge-title">
      <div className="map-dialogue-section-heading">
        <Hammer size={14} aria-hidden="true" />
        <h4 id="map-adamantine-forge-title">{t(`map.adamantineForge.titles.${profile.role}`)}</h4>
      </div>
      <p className="map-dialogue-hint">{t(`map.adamantineForge.hints.${profile.role}`)}</p>
      {profile.role === "forge" && (
        <ol className="mt-3 grid gap-1.5 pl-4 text-[11px] leading-relaxed text-white/70">
          <li>{t("map.adamantineForge.steps.insertMold")}</li>
          <li>{t("map.adamantineForge.steps.insertOre")}</li>
          <li>{t("map.adamantineForge.steps.lowerPlatform")}</li>
          <li>{t("map.adamantineForge.steps.releaseLava")}</li>
          <li>{t("map.adamantineForge.steps.strikeHammer")}</li>
        </ol>
      )}
      {profile.recipes.length > 0 && (
        <>
          <h5 className="mt-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/45">
            {t(profile.role === "mold" ? "map.adamantineForge.result" : "map.adamantineForge.results")}
          </h5>
          <ul className="map-dialogue-events">
            {profile.recipes.map((recipe) => (
              <li key={recipe.id}>
                <strong>{recipe.title}</strong>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {recipe.gameplay?.rarity && <span className="map-dialogue-tag">{recipe.gameplay.rarity}</span>}
                  {recipe.gameplay?.armorClass && <span className="map-dialogue-tag">{t("map.adamantineForge.armorClass", { value: recipe.gameplay.armorClass })}</span>}
                  {recipe.gameplay?.damage && <span className="map-dialogue-tag">{recipe.gameplay.damage} {recipe.gameplay.damageType}</span>}
                  {recipe.gameplay?.proficiency && <span className="map-dialogue-tag">{recipe.gameplay.proficiency.replaceAll(";", " · ")}</span>}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
};

export default MapAdamantineForgeProfileSection;
