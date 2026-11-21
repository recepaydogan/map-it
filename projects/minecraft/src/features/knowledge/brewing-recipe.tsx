import { Package } from "lucide-react";
import { useTranslation } from "react-i18next";
import Tooltip from "../../components/tooltip";
import { GAME_GUIDE_BREWING } from "../../game-config";
import type { RecipeSubjectDisplay } from "./recipe-grid";
import type { CatalogRecipe } from "./recipe-types";
import MapPointIcon from "../map/map-point-icon";
import GuideItemLink from "./guide-item-link.tsx";
import { useGuideNavigation } from "./guide-navigation-context.ts";

export default function BrewingRecipe({ recipe, display, compact = false }: {
  recipe: CatalogRecipe; display: RecipeSubjectDisplay; compact?: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useGuideNavigation();
  const input = recipe.ingredients[0]?.choices[0], reagent = recipe.ingredients[1]?.choices[0], output = recipe.outputs[0];
  return <div className="brewing-recipe w-full max-w-[760px]" role="group"
    aria-label={t("inspector.brewingTitle")}>
    <div className="brewing-recipe-layout">
      <div className={compact ? "relative w-[224px] max-w-full" : "relative w-[280px] max-w-full"}
        style={{ aspectRatio: `${GAME_GUIDE_BREWING.guiLayout.width} / ${GAME_GUIDE_BREWING.guiLayout.height}` }}>
        <img src={GAME_GUIDE_BREWING.guiImage} alt="" className="absolute inset-0 h-full w-full [image-rendering:pixelated]" />
        {GAME_GUIDE_BREWING.guiLayout.slots.map((slot, index) => {
          const choice = slot.role === "fuel" ? { kind: "item" as const, id: GAME_GUIDE_BREWING.fuel } : slot.role === "reagent" ? reagent : input;
          const appearance = choice ? display(choice.kind, choice.id) : undefined;
          return <Tooltip key={index} label={appearance?.name ?? ""} disabled={!appearance} side="top"
            style={{ position: "absolute", left: `${slot.x / GAME_GUIDE_BREWING.guiLayout.width * 100}%`,
              top: `${slot.y / GAME_GUIDE_BREWING.guiLayout.height * 100}%` }}>
            <button type="button" disabled={!choice} data-guide-item={choice?.id}
              aria-label={appearance ? `${t("inspector.openGuide")}: ${appearance.name}` : undefined}
              onClick={() => choice && navigate({ kind: choice.kind, id: choice.id })}
              className="cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
              {appearance && <MapPointIcon source={appearance.image} fallback={Package} size={compact ? 20 : 25} className="guide-asset-icon [image-rendering:pixelated]" />}
            </button>
          </Tooltip>;
        })}
      </div>
      <div className="brewing-recipe-result min-w-0">
        <span className="text-[12px] font-medium text-zinc-200">
          {t("inspector.brewingTime", { seconds: GAME_GUIDE_BREWING.seconds })}</span>
        {output && <GuideItemLink id={output.id} display={display} quantity={output.count} />}
      </div>
    </div>
  </div>;
}
