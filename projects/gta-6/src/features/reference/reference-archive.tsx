import DatabasePage from "../database/database-page";
import ClassBrowser from "../classes/class-browser";
import SpellBrowser from "../spells/spell-browser";
import StarterGuideBrowser from "../guides/starter-guide-browser";
import ProfessionBrowser from "../professions/profession-browser";
import RaceBrowser from "../races/race-browser";
import RecipeItemTarget from "../database/recipe-item-target";
import ReferenceBrowser from "./reference-browser";
import RewardBoxBrowser from "./reward-box-browser";
import ActivityBrowser from "./activity-browser";
import AdventureBrowser from "./adventure-browser";
import type { ReferenceNavigationProps, ReferenceTarget } from "./reference-types";
import { cn } from "../../lib/cn";
import NativeWikiBrowser from "./native-wiki-browser";
import { NATIVE_WIKI_CATEGORIES } from "./use-native-wiki";

const flatCategories = new Set(["items", "recipes", "classes", "races", "professions", "spells", "guides"]);

const ReferenceArchive = ({ target, title, onOpenMap, ...navigation }: ReferenceNavigationProps & {
  target: ReferenceTarget;
  title?: string;
  onOpenMap: (mapId: string, markerId: string) => void;
}) => <div data-reference-page={target.category} className={cn("absolute inset-0 flex flex-col bg-background animate-fade-in", flatCategories.has(target.category) && "flat-reference")}>
  {title && <h1 className="shrink-0 border-b border-border px-5 py-3 text-lg font-semibold text-zinc-100">{title}</h1>}
  {NATIVE_WIKI_CATEGORIES.has(target.category)
    ? <NativeWikiBrowser key={`${target.category}:${target.id}`} target={target} onOpenMap={onOpenMap} {...navigation} />
    : target.category === "items"
    ? <div className="min-h-0 flex-1"><DatabasePage key={target.id} initialItemId={target.id} initialItemTab={target.initialItemTab} onOpenMap={onOpenMap} {...navigation} /></div>
    : target.category === "classes"
      ? <ClassBrowser key={`${target.id}-${target.group ?? ""}`} target={target} {...navigation} />
    : target.category === "spells"
      ? <SpellBrowser key={target.id} target={target} {...navigation} />
    : target.category === "guides"
      ? <StarterGuideBrowser key={target.id} target={target} {...navigation} />
    : target.category === "professions"
      ? <ProfessionBrowser target={target} onOpenMap={onOpenMap} {...navigation} />
    : target.category === "races"
      ? <RaceBrowser target={target} {...navigation} />
    : target.category === "recipes"
      ? <div className="min-h-0 flex-1"><RecipeItemTarget key={target.id} recipeId={target.id} onOpenMap={onOpenMap} {...navigation} /></div>
      : ["quests", "dungeons"].includes(target.category)
        ? <AdventureBrowser key={`${target.category}-${target.id}`} target={target} onOpenMap={onOpenMap} {...navigation} />
      : target.category === "activities"
        ? <ActivityBrowser key={`${target.category}-${target.id}`} target={target} onOpenMap={onOpenMap} {...navigation} />
      : target.category === "world-bosses"
        ? <ReferenceBrowser key="world-bosses" target={{ category: "creatures", group: "Boss", id: target.id }} onOpenMap={onOpenMap} {...navigation} />
      : target.category === "boxes"
        ? <RewardBoxBrowser key={`${target.category}-${target.id}`} target={target} onOpenMap={onOpenMap} {...navigation} />
        : <ReferenceBrowser key={`${target.category}-${target.group ?? ""}-${target.id}`} target={target} onOpenMap={onOpenMap} {...navigation} />}
</div>;

export default ReferenceArchive;
