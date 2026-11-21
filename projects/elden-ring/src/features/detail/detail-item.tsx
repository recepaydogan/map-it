import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight, Coins, Layers, MapPin, Weight, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import CategoryDot from "../../components/category-dot";
import ItemIcon from "../../components/item-icon";
import { categoryMap } from "../../data/categories";
import { erCategoryColor, erItemByBareId, erItemKey, goodsKind, type ErItem } from "../../data/er-items-data";
import { layersByGame } from "../../data/maps";
import { itemDropSources, itemLocations } from "../../data/markers";
import type { Game, Marker } from "../../data/types";
import { cn } from "../../lib/cn";
import { erItemInfo } from "../../data/er-item-info";
import { ErItemEffects, ErItemSkill } from "../codex/er-item-extras";
import ErItemStats, { erMaxHeld } from "../codex/er-item-stats";
import ErItemUsableOn from "../codex/er-item-usable-on";
import ItemAcquisition from "../item-acquisition/item-acquisition";
import { localizeDropNote } from "./drop-note";
import ItemMiniCard from "./item-mini-card";
import { type DropSource } from "../../data/markers";

// Boss/miniboss marker categories — reused so a drop source's chip is the SAME
// disc + glyph the map pin uses for that boss (skull boss / swords miniboss).
const ER_CATEGORY_DEFS = categoryMap("elden-ring");

const CAT_LABEL: Record<string, string> = {
  weapon: "Weapon", armor: "Armor", talisman: "Talisman", "ash-of-war": "Ash of War",
  sorcery: "Sorcery", incantation: "Incantation", consumable: "Spirit Ash / Goods",
  material: "Material", key: "Key Item",
};
const BADGE_LABEL: Record<string, string> = {
  infinite: "Infinite stock", limited: "Limited stock", "one-time": "One-time",
  renewable: "Renewable", farmable: "Farmable",
};

interface DetailItemProps {
  item: ErItem;
  /** Active game — resolves layer labels for cross-layer "where to find" entries. */
  game: Game;
  /** Where the marker sits — region + layer, the on-map context. */
  location?: string;
  onClose: () => void;
  /** When shown as a drill-down (e.g. a dungeon's loot), return to the parent. */
  onBack?: () => void;
  backLabel?: string;
  /** Jump to one of this item's map locations (omit to render them as static info). */
  onNavigate?: (markerId: string) => void;
  /** Tooltip for those jumps. Defaults to "show on map"; a surface without a map
   *  (the companion window, which opens the target's page in place) overrides it. */
  navigateTitle?: string;
  /** Marker id currently being viewed — excluded from the "where to find" list. */
  currentMarkerId?: string;
  /** Drill into a sub-item by its itemKey (e.g. a cookbook's taught recipe). */
  onDrill?: (itemKey: string) => void;
  /** Action row (found/favorite/center) rendered at the top of the scroll body. */
  actions?: ReactNode;
  /** Optional custom locations overrides (e.g. for test map) */
  customLocations?: Marker[];
  /** Optional custom drop sources overrides (e.g. for test map) */
  customDropSources?: DropSource[];
}

/**
 * Rich item view inside the marker detail panel: the item's real extracted icon,
 * full FMG description, and type-aware stats (attack/scaling/requirements for
 * weapons, negation/poise for armor, FP/requirements for spells, …) — the "wiki
 * page" for whatever the marker drops.
 */
const DetailItem = ({
  item,
  game,
  location,
  onClose,
  onBack,
  backLabel,
  onNavigate,
  navigateTitle,
  currentMarkerId,
  onDrill,
  actions,
  customLocations,
  customDropSources,
}: DetailItemProps) => {
  const { t, i18n } = useTranslation();
  const color = erCategoryColor[item.category] ?? "#a1a1aa";
  // Every map spot this exact item appears (collision-safe key), grouped by region
  // so "where to find" reads cleanly even when one region has several pins.
  const spots = (customLocations ?? itemLocations(erItemKey(item))).filter((m) => m.id !== currentMarkerId);
  const byRegion = new Map<string, { region: string; markers: typeof spots }>();
  for (const m of spots) {
    const region = m.region ?? t("detail.unknownRegion");
    const e = byRegion.get(region);
    if (e) e.markers.push(m);
    else byRegion.set(region, { region, markers: [m] });
  }
  const regions = [...byRegion.values()];
  // Bosses/enemies that drop this item, with their real drop chance — the inverse
  // of the boss-side `drops` list. Navigation pushes the boss as a new selection.
  // Each source name bakes in its region ("Boss (Region)"). When most drops share
  // one place that parenthetical repeats on every row — noise. Split it out, lift
  // the shared region to the section header, and keep it inline ONLY where it differs
  // (which is what disambiguates same-named bosses, e.g. a Gargoyle in the Royal vs
  // the Ashen Capital). Mirrors the codex item detail.
  const cleanRegion = (r: string) => r.replace(/\s*[-–]\s*/g, " – ").trim();
  const dropSources = (customDropSources ?? itemDropSources(erItemKey(item))).map((s) => {
    const m = s.name.match(/^(.*?)\s*\(([^()]+)\)\s*$/);
    return { ...s, boss: m ? m[1].trim() : s.name, region: m ? cleanRegion(m[2]) : null };
  });
  const dropRegionFreq = new Map<string, number>();
  for (const d of dropSources) if (d.region) dropRegionFreq.set(d.region, (dropRegionFreq.get(d.region) ?? 0) + 1);
  const topDropRegion = [...dropRegionFreq.entries()].sort((a, b) => b[1] - a[1])[0];
  const commonDropRegion = topDropRegion && topDropRegion[1] > 1 ? topDropRegion[0] : null;
  // When an item spans layers (e.g. a Smithing Stone in both the overworld and the
  // underground), tag each "where to find" row with its layer so a navigate that
  // switches the map isn't a surprise. Single-layer items need no tag (no ambiguity).
  const multiLayer = new Set(spots.map((m) => m.layer)).size > 1;
  const layerLabel = (key: string) => {
    const layer = layersByGame[game].find((entry) => entry.key === key);
    return t(`layer.${key}`, { defaultValue: layer?.label ?? key });
  };
  // The reverse of "crafted from": every recipe this item is an ingredient OF.
  // `used_in_recipes` ids are goods/ammunition ids straight from EquipMtrlSetParam.
  const usedIn = (item.used_in_recipes ?? [])
    .map((id) => erItemByBareId(id))
    .filter((p): p is ErItem => !!p);
  // "consumable" lumps spirit ashes + goods; label by what it actually is so a
  // Smithing Stone doesn't read "Spirit Ash / Goods".
  const catLabelRaw =
    item.category === "consumable"
      ? goodsKind(item) ??
        (item.id >= 200000 && item.id < 300000 ? "Spirit Ash" : "Goods")
      : CAT_LABEL[item.category] ?? item.category;
  const catLabel = t(`term.${catLabelRaw}`, { defaultValue: catLabelRaw });
  // Drop the contradictory "limited" badge when the item is also "infinite", and
  // never surface a -1 (sentinel for unlimited) stock count.
  const badges = item.obtainability?.badges ?? [];
  const shownBadges = badges.includes("infinite") ? badges.filter((b) => b !== "limited") : badges;
  const stock = item.obtainability?.shop_stock;
  return (
    <>
      {onBack && (
        <button
          data-detail-back
          onClick={onBack}
          className="flex w-full shrink-0 items-center gap-1 px-4 pt-3 text-xs font-medium text-zinc-400 hover:text-white cursor-pointer"
        >
          <ChevronLeft size={15} aria-hidden="true" />
          <span className="truncate">{backLabel ? t("detail.backTo", { label: backLabel }) : t("detail.back")}</span>
        </button>
      )}
      {/* Fixed identity card — outside the scroll body, so the scrollbar only runs
          alongside the body below it. `relative` anchors the close X. */}
      <header
        className={cn(
          "relative mb-4 flex shrink-0 items-start gap-3 border-b border-border bg-surface/95 px-4 pb-4 backdrop-blur-xl",
          onBack ? "pt-2.5" : "pt-4",
        )}
      >
        <button
          onClick={onClose}
          aria-label={t("detail.closeDetails")}
          className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-[var(--radius-md)] text-zinc-400 hover:bg-white/8 hover:text-white cursor-pointer"
        >
          <X size={16} aria-hidden="true" />
        </button>
        <ItemIcon iconId={item.icon_id} category={item.category} color={color} glyph="pin" size={56} />
        <div className="min-w-0 pr-8">
          <h2 className="text-base font-semibold leading-tight text-white">{item.name}</h2>
          <p className="mt-0.5 text-xs text-muted">
            {item.subtype ? `${t(`term.${item.subtype}`, { defaultValue: item.subtype })} · ` : ""}
            {catLabel}
          </p>
          {location && (
            <p className="mt-1 flex items-center gap-1 text-[11px] text-subtle">
              <MapPin size={11} className="text-accent" aria-hidden="true" />
              {location}
            </p>
          )}
        </div>
      </header>

      {/* The only scrollable region. Content is pinned to the panel's
          no-scrollbar inner width (w-90 desktop / inset-x-2 mobile, − 2px
          borders) so the 8px bar overlays the right padding when it appears —
          text wrapping never shifts and no gutter is reserved. */}
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        <div className="w-[calc(min(22.5rem,100vw_-_1rem)_-_2px)]">
        {actions}
        <div className="space-y-3.5 px-4 pb-4">
        {/* Badges: value, weight, obtainability */}
        <div className="flex flex-wrap gap-1.5">
          {item.sell_value > 0 && (
            <span className="flex items-center gap-1 rounded-[var(--radius-full)] bg-white/8 px-2 py-0.5 text-[11px] font-medium text-zinc-200">
              <Coins size={11} aria-hidden="true" />
              <span className="tabular-nums">{item.sell_value.toLocaleString(i18n.language)}</span> {t("detail.runesSuffix")}
            </span>
          )}
          {item.weight ? (
            <span className="flex items-center gap-1 rounded-[var(--radius-full)] bg-white/8 px-2 py-0.5 text-[11px] font-medium text-zinc-200">
              <Weight size={11} aria-hidden="true" />
              <span className="tabular-nums">{item.weight}</span> {t("detail.weightSuffix")}
            </span>
          ) : null}
          {erMaxHeld(item) ? (
            <span className="flex items-center gap-1 rounded-[var(--radius-full)] bg-white/8 px-2 py-0.5 text-[11px] font-medium text-zinc-200">
              <Layers size={11} aria-hidden="true" />
              {t("term.Max held", { defaultValue: "Max held" })}{" "}
              <span className="tabular-nums">{erMaxHeld(item)}</span>
            </span>
          ) : null}
          {shownBadges.map((b) => (
            <span
              key={b}
              className={cn(
                "rounded-[var(--radius-full)] px-2 py-0.5 text-[11px] font-medium",
                b === "infinite" ? "bg-emerald-600/25 text-emerald-200" : "bg-amber-600/25 text-amber-200",
              )}
            >
              {t(`term.${BADGE_LABEL[b] ?? b}`, { defaultValue: BADGE_LABEL[b] ?? b })}
              {b === "limited" && stock && stock > 0 ? ` (${stock})` : ""}
            </span>
          ))}
        </div>

        {/* The game's own one-line summary of the effect — the sentence the lore passage
            below politely declines to give you. */}
        {erItemInfo(item) && (
          <p className="text-[13px] font-medium leading-relaxed text-zinc-100">{erItemInfo(item)}</p>
        )}

        {/* Description — real in-game FMG text. For cookbooks the FMG text ends with a
            "- ItemName" recipe list; drop that tail (it's rendered as drillable cards below)
            and keep the lore + the "Acquire the knowledge to craft the following:" header. */}
        {item.description && (
          <p className="whitespace-pre-line text-[13px] leading-relaxed text-zinc-300">
            {item.unlocks?.length ? item.description.split(/\n\s*-\s/)[0].trimEnd() : item.description}
          </p>
        )}

        {/* Numbers first, straight off the description: attack power / scaling /
            requirements are what you compare weapons on, so they lead the "what this
            thing does" block rather than sitting behind the skill card. */}
        <ErItemStats item={item} />

        {/* Then the skill — an Ash of War IS its skill, and burying it under how-to-get
            and the mount list meant scrolling past the answer to reach the footnotes. */}
        <ErItemSkill item={item} />

        {/* The decoded SpEffect numbers — still part of "what this thing does", so they
            stay with the skill and the stat tables, above where-to-find/how-to-get. */}
        <ErItemEffects item={item} />

        {/* Acquisition sequence: answer where, then how, then compatibility. */}
        {regions.length > 0 && (
          <div>
            <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              {t("detail.whereToFind")}{spots.length > 1 ? ` · ${spots.length}` : ""}
            </h4>
            <div className="flex flex-col gap-1.5">
              {regions.map(({ region, markers }) => {
                const go = onNavigate ? () => onNavigate(markers[0].id) : undefined;
                const inner = (
                  <>
                    <MapPin size={14} className="shrink-0 text-accent" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-[13px] text-zinc-100">{region}</span>
                    {multiLayer && (
                      <span className="shrink-0 rounded-[var(--radius-full)] bg-white/8 px-1.5 py-0.5 text-[10px] font-medium text-zinc-300">
                        {layerLabel(markers[0].layer)}
                      </span>
                    )}
                    {go && <ChevronRight size={14} className="shrink-0 text-zinc-500" aria-hidden="true" />}
                  </>
                );
                return go ? (
                  <button
                    key={region}
                    onClick={go}
                    className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-border bg-white/[0.03] px-2.5 py-2 text-left transition-colors hover:border-accent/50 hover:bg-white/[0.06] cursor-pointer"
                  >
                    {inner}
                  </button>
                ) : (
                  <div
                    key={region}
                    className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-border bg-white/[0.03] px-2.5 py-2"
                  >
                    {inner}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <ItemAcquisition
          item={item}
          heading={(
            <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              {t("codex.section.howToGet")}
            </h4>
          )}
          onNavigate={onNavigate}
          navigateTitle={navigateTitle}
        />

        <ErItemUsableOn item={item} />

        {/* Cookbook recipes — each taught item links to its own codex page. */}
        {item.unlocks?.length ? (
          <div>
            <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              {t("detail.teaches")}{item.unlocks.length > 1 ? ` · ${item.unlocks.length}` : ""}
            </h4>
            <div className="flex flex-col gap-1.5">
              {item.unlocks.map((u) => (
                <ItemMiniCard
                  key={u.item_key}
                  item={{ id: String(u.id), name: u.name, category: u.category, itemId: u.id, iconId: u.icon_id, itemKey: u.item_key }}
                  game={game}
                  onSelect={onDrill}
                />
              ))}
            </div>
          </div>
        ) : null}

        {/* Dropped by — which boss/enemy drops this and how often (real ItemLot
            chance). Click jumps to that boss (kept as a push so Back returns here). */}
        {dropSources.length > 0 && (
          <div>
            <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              {t("detail.droppedBy")}{dropSources.length > 1 ? ` · ${dropSources.length}` : ""}
              {commonDropRegion && (
                <span className="font-normal normal-case tracking-normal text-zinc-500">
                  {" · "}{commonDropRegion}
                </span>
              )}
            </h4>
            <div className="flex flex-col gap-1.5">
              {dropSources.map((s) => {
                const go = onNavigate ? () => onNavigate(s.markerId) : undefined;
                // The marker's own chip — same disc + glyph the map draws for this boss.
                const def = ER_CATEGORY_DEFS.get(s.category);
                const inner = (
                  <>
                    <CategoryDot
                      color={def?.color ?? "#d65a4e"}
                      icon={def?.icon ?? "skull"}
                      iconUrl={s.iconUrl}
                      size={20}
                    />
                    <span className="min-w-0 flex-1 truncate text-[13px] text-zinc-100">
                      {s.boss}
                      {s.region && s.region !== commonDropRegion && (
                        <span className="text-zinc-500"> · {s.region}</span>
                      )}
                    </span>
                    {s.note && (
                      <span
                        className={cn(
                          "shrink-0 rounded-[var(--radius-full)] px-1.5 py-0.5 text-[10px] font-medium tabular-nums",
                          s.note === "Guaranteed"
                            ? "bg-emerald-600/25 text-emerald-200"
                            : "bg-amber-600/20 text-amber-200",
                        )}
                      >
                        {localizeDropNote(s.note, t, i18n.language, { compact: true })}
                      </span>
                    )}
                    {go && <ChevronRight size={14} className="shrink-0 text-zinc-500" aria-hidden="true" />}
                  </>
                );
                return go ? (
                  <button
                    key={s.markerId}
                    onClick={go}
                    className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-border bg-white/[0.03] px-2.5 py-2 text-left transition-colors hover:border-accent/50 hover:bg-white/[0.06] cursor-pointer"
                  >
                    {inner}
                  </button>
                ) : (
                  <div
                    key={s.markerId}
                    className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-border bg-white/[0.03] px-2.5 py-2"
                  >
                    {inner}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Crafting */}
        {item.crafting?.materials.length ? (
          <div>
            <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              {t("detail.craftedFrom")}
            </h4>
            <div className="flex flex-col gap-1.5">
              {item.crafting.materials.map((m) => (
                <ItemMiniCard
                  key={m.item_id}
                  item={{
                    id: String(m.item_id), name: m.name ?? `#${m.item_id}`,
                    category: m.category ?? "material", qty: m.count,
                    itemId: m.item_id, iconId: m.icon_id, itemKey: m.item_key,
                  }}
                  game={game}
                  onSelect={onDrill}
                />
              ))}
            </div>
          </div>
        ) : null}

        {/* Reverse crafting — every recipe this item is an ingredient of. */}
        {usedIn.length > 0 && (
          <div>
            <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              {t("detail.usedIn")}{usedIn.length > 1 ? ` · ${usedIn.length}` : ""}
            </h4>
            <div className="flex flex-col gap-1.5">
              {usedIn.map((p) => (
                <ItemMiniCard
                  key={erItemKey(p)}
                  item={{
                    id: String(p.id), name: p.name, category: p.category,
                    itemId: p.id, iconId: p.icon_id, itemKey: erItemKey(p),
                  }}
                  game={game}
                  onSelect={onDrill}
                />
              ))}
            </div>
          </div>
        )}
        </div>
        </div>
      </div>
    </>
  );
};

export default DetailItem;
