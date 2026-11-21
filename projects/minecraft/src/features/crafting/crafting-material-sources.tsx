import { Boxes, X } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { getPortalRoot } from "../../lib/portal";
import { gameKnowledgeSubjectDisplay } from "../knowledge/game-knowledge-subject-display";
import { localizedKnowledgeValue } from "../knowledge/localized-knowledge-value";
import type { KnowledgeCatalogs } from "../knowledge/knowledge-catalogs";
import RecipeDiagram from "../knowledge/recipe-diagram";
import { createRecipeSubjectDisplay } from "../knowledge/recipe-subject-display";
import type { CatalogRecipe } from "../knowledge/recipe-types";
import MapPointIcon from "../map/map-point-icon";

interface MaterialSource {
  key: string;
  recipe: CatalogRecipe;
}

type SourceGroup = "crafting" | "mob" | "chest" | "fishing";

const mechanicGroup = (kind: string, id: string): Exclude<SourceGroup, "crafting"> | null => {
  if (kind === "drop") return "mob";
  if (kind !== "loot") return null;
  if (id.includes("/fishing/")) return "fishing";
  if (id.includes("/chests/")) return "chest";
  return null;
};

export default function CraftingMaterialSources({ itemId, catalogs }: {
  itemId: string;
  catalogs: KnowledgeCatalogs;
}) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [activeGroup, setActiveGroup] = useState<SourceGroup>("crafting");
  const [position, setPosition] = useState<CSSProperties | null>(null);
  const contentId = useId();
  const rootRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const recipeDisplay = useMemo(() => catalogs.recipes
    ? createRecipeSubjectDisplay(catalogs.recipes, gameKnowledgeSubjectDisplay)
    : gameKnowledgeSubjectDisplay, [catalogs.recipes]);
  const sources = useMemo<MaterialSource[]>(() =>
    (catalogs.recipes?.index.produces[itemId] ?? [])
      .map(id => catalogs.recipes?.recipes.find(recipe => recipe.id === id))
      .filter((recipe): recipe is CatalogRecipe => Boolean(recipe))
      .slice(0, 2)
      .map(recipe => ({
        key: `recipe:${recipe.id}`,
        recipe,
      })), [catalogs.recipes, itemId]);
  const mechanicSources = useMemo(() => {
    const ids = new Set(catalogs.mechanics?.index[`item:${itemId}`] ?? []);
    return [...(catalogs.mechanics?.mechanics ?? [])]
      .filter(mechanic => ids.has(mechanic.id) && mechanic.outputs.some(output => output.id === itemId))
      .map(mechanic => ({ key: `mechanic:${mechanic.id}`, mechanic }));
  }, [catalogs.mechanics, itemId]);
  const sourceGroups = useMemo(() => ([
    { id: "crafting" as const, label: t("crafting.sourceTabs.crafting"), count: sources.length },
    ...(["mob", "chest", "fishing"] as const).map(id => ({
      id, label: t(`crafting.sourceTabs.${id}`), count: mechanicSources.filter(source => mechanicGroup(source.mechanic.kind, source.mechanic.subject.id) === id).length,
    })),
  ]).filter(group => group.count > 0), [mechanicSources, sources.length, t]);
  const visibleGroup = sourceGroups.some(group => group.id === activeGroup) ? activeGroup : sourceGroups[0]?.id ?? "crafting";
  const visibleMechanics = mechanicSources.filter(source => mechanicGroup(source.mechanic.kind, source.mechanic.subject.id) === visibleGroup);

  const updatePosition = useCallback(() => {
    const trigger = buttonRef.current?.getBoundingClientRect();
    const portalRoot = getPortalRoot();
    const boundary = portalRoot.parentElement?.getBoundingClientRect()
      ?? new DOMRect(0, 0, window.innerWidth, window.innerHeight);
    if (!trigger) return;
    const width = Math.min(288, Math.max(220, boundary.width - 16));
    const left = Math.min(Math.max(trigger.left - boundary.left, 8), Math.max(8, boundary.width - width - 8));
    const spaceBelow = boundary.bottom - trigger.bottom;
    const spaceAbove = trigger.top - boundary.top;
    const placeBelow = spaceBelow >= 220 || spaceBelow >= spaceAbove;
    const maxHeight = Math.max(0, Math.min(220, (placeBelow ? spaceBelow : spaceAbove) - 7));
    setPosition(placeBelow
      ? { left, top: trigger.bottom - boundary.top + 7, width, maxHeight }
      : { left, bottom: boundary.bottom - trigger.top + 7, width, maxHeight });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const closeWhenOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !popoverRef.current?.contains(target)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      buttonRef.current?.focus({ preventScroll: true });
    };
    window.addEventListener("pointerdown", closeWhenOutside);
    window.addEventListener("keydown", closeOnEscape, true);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("pointerdown", closeWhenOutside);
      window.removeEventListener("keydown", closeOnEscape, true);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, updatePosition]);

  if (!sourceGroups.length) return null;

  const portalRoot = open ? getPortalRoot() : null;
  const sourceLabel = (group: SourceGroup) => t(`crafting.sourceTabs.${group}`);
  const sourceDisplay = (kind: string, id: string) => {
    const group = mechanicGroup(kind, id);
    if (group === "fishing") return gameKnowledgeSubjectDisplay("item", "minecraft:fishing_rod");
    if (kind === "loot" && id.includes("/chests/village/")) return gameKnowledgeSubjectDisplay("poi", "minecraft:village");
    return gameKnowledgeSubjectDisplay(kind as Parameters<typeof gameKnowledgeSubjectDisplay>[0], id);
  };
  return <span ref={rootRef} className="mt-1.5 block w-fit">
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[10.5px]">
      <span className="font-semibold text-zinc-400">{t("crafting.sourcePrefix")}</span>
      {sourceGroups.map((group, index) => <span key={group.id} className="inline-flex items-center gap-x-1.5">
        {index > 0 && <span className="text-zinc-500">-</span>}
        {group.id === "fishing" ? <span className="font-semibold text-zinc-400">{sourceLabel(group.id)}</span>
          : <button ref={group.id === visibleGroup ? buttonRef : undefined} type="button"
            aria-expanded={open && visibleGroup === group.id} aria-controls={contentId} aria-haspopup="dialog"
            onClick={event => { buttonRef.current = event.currentTarget; setActiveGroup(group.id); setOpen(true); updatePosition(); }}
            className={cn("cursor-pointer font-semibold underline underline-offset-2 transition-colors hover:text-white", open && visibleGroup === group.id ? "text-white" : "text-accent")}>{sourceLabel(group.id)}</button>}
      </span>)}
    </div>
    {open && position && portalRoot && createPortal(<div ref={popoverRef} id={contentId} role="dialog"
      aria-label={sourceLabel(visibleGroup)} style={{ position: "absolute", ...position }}
      className="pointer-events-auto z-[3000] flex flex-col overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface p-2 shadow-[var(--panel-shadow)] animate-fade-in">
      <div className="mb-1.5 flex shrink-0 items-center justify-between border-b border-border px-1 pb-1.5">
        <p className="text-[11px] font-semibold text-white">{sourceLabel(visibleGroup)}</p>
        <button type="button" onClick={() => setOpen(false)} className="cursor-pointer text-zinc-500 hover:text-white" aria-label={t("overlay.minimap.close")}><X size={13} aria-hidden="true" /></button>
      </div>
      <div className="min-h-0 overflow-y-auto">
      {visibleGroup === "crafting" ? <div className="space-y-1.5">{sources.map(source =>
        <div key={source.key} className="overflow-x-auto rounded-[var(--radius-sm)] bg-black/20 p-2">
          <RecipeDiagram recipe={source.recipe} display={recipeDisplay} compact />
        </div>)}
      </div> : <div className="space-y-1">{visibleMechanics.map(({ key, mechanic }) => {
        const source = sourceDisplay(mechanic.subject.kind, mechanic.subject.id);
        const copy = localizedKnowledgeValue(mechanic.text, i18n.resolvedLanguage ?? i18n.language);
        return <div key={key} className="flex items-center gap-2 rounded-[var(--radius-sm)] bg-black/20 px-2 py-1.5">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-background"><MapPointIcon source={source.image} fallback={Boxes} size={22} /></span>
          <div className="min-w-0"><p className="truncate text-[11px] font-semibold text-white">{source.name}</p>
            {copy?.description && <p className="mt-0.5 line-clamp-2 text-[10.5px] leading-4 text-zinc-300">{copy.description}</p>}</div>
        </div>;
      })}</div>}
      </div>
    </div>, portalRoot)}
  </span>;
}
