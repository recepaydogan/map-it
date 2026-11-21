import { ChevronDown, ChevronRight, FlaskConical } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import ItemIcon from "./item-icon";
import type {
  ItemCraftingMaterial,
  ItemDatabaseEntry,
} from "./types";
import { useItemDatabase } from "./use-item-database";

const INITIAL_USED_IN_LIMIT = 6;

const localizeName = (item: ItemDatabaseEntry, language: string) => (
  item.localizedNames[language] ?? item.localizedNames.en ?? item.name
);

interface RelatedItemRowProps {
  item: ItemDatabaseEntry;
  amount?: number;
  meta?: string;
  onSelectItem?: (itemId: string) => void;
}

const RelatedItemRow = ({ item, amount, meta, onSelectItem }: RelatedItemRowProps) => {
  const { t, i18n } = useTranslation();
  const name = localizeName(item, i18n.language);
  const interactive = Boolean(onSelectItem);
  const content = (
    <>
      <ItemIcon
        item={item}
        size={36}
        className="grid shrink-0 place-items-center overflow-hidden rounded-[var(--radius-md)] border border-white/10 bg-black/25 text-accent"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-medium text-zinc-100">{name}</span>
        {meta && <span className="mt-0.5 block truncate text-[10px] text-muted">{meta}</span>}
      </span>
      {amount !== undefined && (
        <span className="shrink-0 rounded-[var(--radius-full)] border border-accent/25 bg-accent-soft px-2 py-0.5 text-[10px] font-semibold tabular-nums text-accent">
          ×{amount}
        </span>
      )}
      {interactive && <ChevronRight size={15} className="shrink-0 text-zinc-500" aria-hidden="true" />}
    </>
  );

  if (!interactive) {
    return <div className="flex min-w-0 items-center gap-2.5 px-3 py-2.5">{content}</div>;
  }
  return (
    <button
      type="button"
      onClick={() => onSelectItem?.(item.id)}
      aria-label={t("items.crafting.openItem", { item: name })}
      className="flex w-full min-w-0 cursor-pointer items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-white/[0.045] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/70"
    >
      {content}
    </button>
  );
};

const MaterialGroup = ({
  material,
  recipeId,
  itemById,
  onSelectItem,
}: {
  material: ItemCraftingMaterial;
  recipeId: string;
  itemById: Map<string, ItemDatabaseEntry>;
  onSelectItem?: (itemId: string) => void;
}) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const options = material.options.flatMap((itemId) => {
    const option = itemById.get(itemId);
    return option ? [option] : [];
  });
  if (options.length === 0) return null;
  if (options.length === 1) {
    return <RelatedItemRow item={options[0]} amount={material.amount} onSelectItem={onSelectItem} />;
  }

  const expansionId = `crafting-options-${recipeId}-${material.sourceId}`.replace(/[^a-z0-9-_]/gi, "-");
  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        aria-controls={expansionId}
        className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-white/[0.045] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/70"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-white/10 bg-black/25">
          <span className="flex -space-x-2">
            {options.slice(0, 3).map((option) => (
              <ItemIcon
                key={option.id}
                item={option}
                size={22}
                className="grid place-items-center overflow-hidden rounded-[var(--radius-full)] border border-background bg-surface text-accent"
              />
            ))}
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[12px] font-medium text-zinc-100">{t("items.crafting.compatibleMaterial")}</span>
          <span className="mt-0.5 block text-[10px] text-muted">
            {t("items.crafting.options", { count: options.length })}
          </span>
        </span>
        <span className="shrink-0 rounded-[var(--radius-full)] border border-accent/25 bg-accent-soft px-2 py-0.5 text-[10px] font-semibold tabular-nums text-accent">
          ×{material.amount}
        </span>
        <ChevronDown
          size={15}
          className={cn("shrink-0 text-zinc-500 transition-transform", expanded && "rotate-180")}
          aria-hidden="true"
        />
      </button>
      {expanded && (
        <div id={expansionId} className="ml-5 border-l border-accent/20 pl-2">
          {options.map((option) => (
            <RelatedItemRow key={option.id} item={option} onSelectItem={onSelectItem} />
          ))}
        </div>
      )}
    </div>
  );
};

const ItemCraftingSection = ({
  item,
  onSelectItem,
}: {
  item: ItemDatabaseEntry;
  onSelectItem?: (itemId: string) => void;
}) => {
  const { t, i18n } = useTranslation();
  const { data } = useItemDatabase();
  const [showAllUsedIn, setShowAllUsedIn] = useState(false);
  const itemById = useMemo(
    () => new Map((data?.items ?? []).map((candidate) => [candidate.id, candidate])),
    [data],
  );
  const recipeById = useMemo(
    () => new Map((data?.recipes ?? []).map((recipe) => [recipe.id, recipe])),
    [data],
  );
  const recipes = (item.crafting?.recipeIds ?? []).flatMap((recipeId) => {
    const recipe = recipeById.get(recipeId);
    return recipe ? [recipe] : [];
  });
  const usedIn = item.crafting?.usedIn ?? [];
  if (!recipes.length && !usedIn.length) return null;
  const visibleUsedIn = showAllUsedIn ? usedIn : usedIn.slice(0, INITIAL_USED_IN_LIMIT);
  const resolvedUsedIn = visibleUsedIn.flatMap((usage) => {
    const result = itemById.get(usage.resultItemId);
    return result ? [{ usage, result }] : [];
  });

  return (
    <section>
      <h2 className="mb-2.5 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-subtle">
        <span className="h-px w-3 bg-accent/60" aria-hidden="true" />
        {t("items.sections.crafting")}
      </h2>
      <div className="space-y-3">
        {recipes.length > 0 && (
          <div className="overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface">
            <div className="flex items-center gap-2 border-b border-border bg-accent/[0.06] px-3 py-2.5">
              <FlaskConical size={14} className="text-accent" aria-hidden="true" />
              <h3 className="text-[11px] font-semibold text-zinc-100">{t("items.crafting.craftedFrom")}</h3>
              {recipes.length > 1 && (
                <span className="ml-auto text-[10px] tabular-nums text-muted">
                  {t("items.crafting.recipeCount", { count: recipes.length })}
                </span>
              )}
            </div>
            <div className="divide-y divide-border">
              {recipes.map((recipe, recipeIndex) => (
                <div key={recipe.id}>
                  {(recipes.length > 1 || recipe.sourceNames) && (
                    <div className="flex items-center justify-between gap-3 bg-black/10 px-3 py-2 text-[10px] text-muted">
                      <span>
                        {recipe.sourceNames?.[i18n.language]
                          ?? recipe.sourceNames?.en
                          ?? t("items.crafting.recipe", { number: recipeIndex + 1 })}
                      </span>
                      <span>{t("items.crafting.creates", { count: recipe.resultAmount })}</span>
                    </div>
                  )}
                  <div className="divide-y divide-border/80">
                    {recipe.materials.map((material) => (
                      <MaterialGroup
                        key={`${recipe.id}:${material.kind}:${material.sourceId}`}
                        recipeId={recipe.id}
                        material={material}
                        itemById={itemById}
                        onSelectItem={onSelectItem}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {usedIn.length > 0 && (
          <div className="overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface">
            <div className="flex items-center gap-2 border-b border-border bg-accent/[0.06] px-3 py-2.5">
              <FlaskConical size={14} className="text-accent" aria-hidden="true" />
              <h3 className="text-[11px] font-semibold text-zinc-100">
                {t("items.crafting.usedIn", { count: usedIn.length })}
              </h3>
            </div>
            <div className="divide-y divide-border/80">
              {resolvedUsedIn.map(({ usage, result }) => (
                <RelatedItemRow
                  key={`${usage.recipeId}:${result.id}`}
                  item={result}
                  amount={usage.resultAmount > 1 ? usage.resultAmount : undefined}
                  meta={usage.sourceNames?.[i18n.language] ?? usage.sourceNames?.en}
                  onSelectItem={onSelectItem}
                />
              ))}
            </div>
            {usedIn.length > INITIAL_USED_IN_LIMIT && (
              <button
                type="button"
                onClick={() => setShowAllUsedIn((value) => !value)}
                className="w-full cursor-pointer border-t border-border px-3 py-2.5 text-[11px] font-medium text-accent transition-colors hover:bg-accent/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/70"
              >
                {showAllUsedIn
                  ? t("items.crafting.showFewer")
                  : t("items.crafting.showAll", { count: usedIn.length })}
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
};

export default ItemCraftingSection;
