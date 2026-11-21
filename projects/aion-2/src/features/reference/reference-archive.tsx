import DatabasePage from "../database/database-page";
import RecipeItemTarget from "../database/recipe-item-target";
import ReferenceBrowser from "./reference-browser";
import RewardBoxBrowser from "./reward-box-browser";
import ActivityBrowser from "./activity-browser";
import AdventureBrowser from "./adventure-browser";
import WingPage from "./wing-page";
import type { ReferenceNavigationProps, ReferenceTarget } from "./reference-types";
import type { MapReferenceSearch } from "../map/map-focus-request";

const ReferenceArchive = ({ target, title, onOpenMap, ...navigation }: ReferenceNavigationProps & {
  target: ReferenceTarget;
  title?: string;
  onOpenMap: (mapId: string, markerId: string, search?: MapReferenceSearch) => void;
}) => <div data-reference-page={target.category} className="absolute inset-0 reference-catalog-archive flex flex-col animate-fade-in">
  {title && <h1 className="shrink-0 border-b border-border px-5 py-3 text-lg font-semibold text-zinc-100">{title}</h1>}
  {target.category === "items"
    ? <div className="min-h-0 flex-1"><DatabasePage key={`${target.id}:${target.enhancementLevel ?? 0}`} initialItemId={target.id} initialEnhancementLevel={target.enhancementLevel} onOpenMap={onOpenMap} {...navigation} /></div>
    : target.category === "wings"
      ? <WingPage key={`${target.category}-${target.id}`} target={target} onOpenMap={onOpenMap} {...navigation} />
    : target.category === "recipes"
      ? <div className="min-h-0 flex-1"><RecipeItemTarget key={target.id} recipeId={target.id} onOpenMap={onOpenMap} {...navigation} /></div>
      : target.category === "quests"
        ? <AdventureBrowser key={`${target.category}-${target.id}`} target={target} onOpenMap={onOpenMap} {...navigation} />
      : target.category === "dungeons"
        ? <AdventureBrowser key={`${target.category}-${target.id}`} target={target} onOpenMap={onOpenMap} {...navigation} />
      : target.category === "activities"
        ? <ActivityBrowser key={`${target.category}-${target.id}`} target={target} onOpenMap={onOpenMap} {...navigation} />
      : target.category === "world-bosses"
        ? <ReferenceBrowser key={`world-bosses-${target.id}`} target={{ category: "creatures", group: "Boss", id: target.id }} onOpenMap={onOpenMap} {...navigation} />
      : target.category === "boxes"
        ? <RewardBoxBrowser key={`${target.category}-${target.id}`} target={target} onOpenMap={onOpenMap} {...navigation} />
        : <ReferenceBrowser key={`${target.category}-${target.group ?? ""}-${target.id}`} target={target} onOpenMap={onOpenMap} {...navigation} />}
</div>;

export default ReferenceArchive;
