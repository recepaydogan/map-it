import { Coins, Layers, MapPin, Weight } from "lucide-react";
import { useTranslation } from "react-i18next";
import CategoryDot from "../../components/category-dot";
import ItemIcon from "../../components/item-icon";
import { categoryMap } from "../../data/categories";
import {
  ER_ITEM_CATEGORIES,
  erCategoryColor,
  erItemByBareId,
  erItemKey,
  goodsKind,
  type ErItem,
} from "../../data/er-items-data";
import { itemDropSources, itemLocations } from "../../data/markers";

// Boss/miniboss marker categories — the SAME color + glyph the map pin uses, so a
// drop source's chip is visually identical to its marker (skull boss / swords miniboss).
const ER_CATEGORY_DEFS = categoryMap("elden-ring");
import { useUiStore } from "../../store/ui-store";
import { cn } from "../../lib/cn";
import { erItemInfo } from "../../data/er-item-info";
import { ErItemEffects, ErItemSkill } from "./er-item-extras";
import ErItemStats, { erMaxHeld } from "./er-item-stats";
import ErItemUsableOn from "./er-item-usable-on";
import ItemAcquisition from "../item-acquisition/item-acquisition";

const meta = (cat: string) => ER_ITEM_CATEGORIES.find((c) => c.key === cat);

/** Obtainability badge ids → their t() key suffix under "codex.badge.*". */
const BADGE_KEY: Record<string, string> = {
  infinite: "infinite",
  limited: "limited",
  "one-time": "oneTime",
  renewable: "renewable",
  farmable: "farmable",
};

interface ErItemDetailProps {
  item: ErItem;
  onSelect: (item: ErItem) => void;
}

/** Section heading with a short accent tick — one heading voice across the page. */
const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <h4 className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-400">
    <span className="h-px w-3 bg-accent/60" aria-hidden="true" />
    {children}
  </h4>
);

/** The item/material "wiki page" — all fields are real game data (FACT + FMG). */
const ErItemDetail = ({ item, onSelect }: ErItemDetailProps) => {
  const { t, i18n } = useTranslation();
  // Localize an ER taxonomy term (category label / subtype / goods kind) by its English text.
  const term = (s: string | null | undefined) => (s ? t(`term.${s}`, { defaultValue: s }) : s);
  const openMapMarker = useUiStore((s) => s.openMapMarker);
  const color = erCategoryColor[item.category] ?? "#a1a1aa";
  // Crafting materials & recipe outputs are goods-group ids — resolve unambiguously.
  const usedIn = (item.used_in_recipes ?? [])
    .map((id) => erItemByBareId(id))
    .filter((x): x is ErItem => Boolean(x));
  // Every map location of this item, by region (collision-safe key). Keep a representative
  // marker id per region so a click can fly the map there (codex → map cross-link).
  const regionCounts = new Map<string, number>();
  const regionMarker = new Map<string, string>();
  for (const m of itemLocations(erItemKey(item))) {
    const region = m.region ?? "Unknown";
    regionCounts.set(region, (regionCounts.get(region) ?? 0) + 1);
    if (!regionMarker.has(region)) regionMarker.set(region, m.id);
  }
  const locTotal = [...regionCounts.values()].reduce((a, b) => a + b, 0);
  // Bosses/enemies that drop this item, with their real drop chance (inverse of
  // the boss-side `drops` list). Click → fly the map to that boss.
  const dropSources = itemDropSources(erItemKey(item));
  // Each source name bakes in its region ("Boss (Region)"). With 14 drops all in one
  // place that parenthetical repeats on every row — noise. Split it out, lift the shared
  // region to the section header, and keep it inline ONLY where it differs (which is what
  // disambiguates same-named bosses, e.g. a Gargoyle in the Royal vs the Ashen Capital).
  const cleanRegion = (r: string) => r.replace(/\s*[-–]\s*/g, " – ").trim();
  const drops = dropSources.map((s) => {
    const m = s.name.match(/^(.*?)\s*\(([^()]+)\)\s*$/);
    return { ...s, boss: m ? m[1].trim() : s.name, region: m ? cleanRegion(m[2]) : null };
  });
  const regionFreq = new Map<string, number>();
  for (const d of drops) if (d.region) regionFreq.set(d.region, (regionFreq.get(d.region) ?? 0) + 1);
  const topRegion = [...regionFreq.entries()].sort((a, b) => b[1] - a[1])[0];
  const commonRegion = topRegion && topRegion[1] > 1 ? topRegion[0] : null;

  return (
    <div className="flex h-full flex-col">
      {/* Hero — the relic gets a framed, category-lit presentation and the name
          carries the engraved display face, so the detail page reads as the
          archive's payoff rather than an enlarged list row. */}
      <header className="relative overflow-hidden border-b border-border px-6 py-5">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{ background: `radial-gradient(115% 130% at 0% 0%, ${color}22, transparent 62%)` }}
        />
        <div className="relative flex max-w-[760px] items-center gap-4">
          <div
            className="grid shrink-0 place-items-center rounded-[var(--radius-md)] border bg-black/30 p-2"
            style={{ borderColor: `${color}55`, boxShadow: `0 0 26px -8px ${color}` }}
          >
            <ItemIcon iconId={item.icon_id} category={item.category} color={color} glyph={meta(item.category)?.icon ?? "pin"} size={72} />
          </div>
          <div className="min-w-0">
            <p
              className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em]"
              style={{ color: `color-mix(in srgb, ${color} 68%, white)` }}
            >
              {term(meta(item.category)?.label ?? item.category)}
            </p>
            <h2 className="font-display text-[22px] font-semibold leading-[1.15] text-white">
              {item.name}
            </h2>
            {(item.subtype ?? goodsKind(item)) && (
              <p className="mt-1.5 text-[12px] text-muted">{term(item.subtype ?? goodsKind(item))}</p>
            )}
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <div className="max-w-[760px] space-y-5">
        {/* Badges */}
        <div className="flex flex-wrap gap-1.5">
          {item.sell_value > 0 && (
            <span className="flex items-center gap-1 rounded-[var(--radius-full)] bg-white/8 px-2 py-0.5 text-[11px] font-medium text-zinc-200">
              <Coins size={11} aria-hidden="true" />
              <span className="tabular-nums">{item.sell_value.toLocaleString(i18n.language)}</span> {t("codex.runes")}
            </span>
          )}
          {/* Weight lives here, not in the stat grid below — one number, printed once.
              Suffix borrowed from the detail panel's key (same word, already localized). */}
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
          {(item.obtainability?.badges.includes("infinite")
            ? item.obtainability.badges.filter((b) => b !== "limited")
            : item.obtainability?.badges ?? []
          ).map((b) => (
            <span
              key={b}
              className={cn(
                "rounded-[var(--radius-full)] px-2 py-0.5 text-[11px] font-medium",
                b === "infinite"
                  ? "bg-emerald-600/25 text-emerald-200"
                  : "bg-amber-600/25 text-amber-200",
              )}
            >
              {BADGE_KEY[b] ? t(`codex.badge.${BADGE_KEY[b]}`) : b}
              {b === "limited" && (item.obtainability?.shop_stock ?? 0) > 0
                ? ` (${item.obtainability?.shop_stock})`
                : ""}
            </span>
          ))}
        </div>

        {/* The game's own one-line summary of what the thing DOES. It leads, because the
            lore passage below is beautiful and frequently unhelpful ("Raises attributes,
            but also increases damage taken" is the sentence you actually came for). */}
        {erItemInfo(item) && (
          <p className="text-[13.5px] font-medium leading-relaxed text-zinc-100">{erItemInfo(item)}</p>
        )}

        {/* Description (FMG, real in-game text) — presented as the lore passage
            it is, set off by a gold rule rather than buried as plain body. */}
        {item.description && (
          <blockquote className="whitespace-pre-line border-l-2 border-accent/40 pl-3.5 text-[13px] leading-relaxed text-zinc-300">
            {item.description}
          </blockquote>
        )}

        {/* Numbers first, straight off the description: attack power / scaling /
            requirements are what you compare weapons on. Same order as the marker panel. */}
        <ErItemStats item={item} />

        {/* Then the skill — an Ash of War IS its skill, so it stays high on the page. */}
        <ErItemSkill item={item} />

        {/* The decoded SpEffect numbers — still part of "what this thing does", so they
            stay with the skill and the stat tables, above where-to-find/how-to-get. */}
        <ErItemEffects item={item} />

        {/* Acquisition sequence: answer where, then how, then compatibility. */}
        {regionCounts.size > 0 && (
          <div>
            <SectionTitle>
              {t("codex.section.whereToFind")}
              {locTotal > 1 ? ` · ${t("codex.onTheMapCount", { count: locTotal })}` : ""}
            </SectionTitle>
            <div className="flex flex-wrap gap-1.5">
              {[...regionCounts.keys()].map((region) => (
                <button
                  key={region}
                  onClick={() => {
                    const id = regionMarker.get(region);
                    if (id) openMapMarker(id);
                  }}
                  title={t("codex.showOnMap")}
                  className="flex items-center gap-1 rounded-[var(--radius-full)] border border-border bg-white/[0.03] px-2.5 py-1 text-[12px] text-zinc-200 transition-colors hover:border-accent/50 hover:bg-accent-soft hover:text-white cursor-pointer"
                >
                  <MapPin size={11} className="text-accent" aria-hidden="true" />
                  {region}
                </button>
              ))}
            </div>
          </div>
        )}

        <ItemAcquisition
          item={item}
          heading={<SectionTitle>{t("codex.section.howToGet")}</SectionTitle>}
          onNavigate={openMapMarker}
        />

        <ErItemUsableOn item={item} />

        {/* Dropped by — which boss/enemy drops this, and how often (real ItemLot
            chance). Click a row to jump the map to that boss. */}
        {drops.length > 0 && (
          <div>
            <SectionTitle>
              {t("codex.section.droppedBy")}{drops.length > 1 ? ` · ${drops.length}` : ""}
              {commonRegion && (
                <span className="font-normal normal-case tracking-normal text-zinc-500">
                  {" · "}{commonRegion}
                </span>
              )}
            </SectionTitle>
            <div className="flex flex-col gap-1.5">
              {drops.map((s) => {
                // The marker's own chip — same disc + glyph the map draws for this
                // category (skull boss / swords miniboss), not a bare lucide icon.
                const def = ER_CATEGORY_DEFS.get(s.category);
                // Region only when it differs from the header's shared one.
                const showRegion = s.region && s.region !== commonRegion;
                return (
                <button
                  key={s.markerId}
                  onClick={() => openMapMarker(s.markerId)}
                  title={t("codex.showOnMap")}
                  className="flex items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-border bg-white/[0.03] px-2.5 py-2 text-left transition-colors hover:border-accent/50 hover:bg-accent-soft cursor-pointer"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <CategoryDot
                      color={def?.color ?? "#d65a4e"}
                      icon={def?.icon ?? "skull"}
                      iconUrl={s.iconUrl}
                      size={20}
                    />
                    <span className="truncate text-[13px] text-zinc-100">
                      {s.boss}
                      {showRegion && <span className="text-zinc-500"> · {s.region}</span>}
                    </span>
                  </span>
                  {s.note && (
                    <span
                      className={cn(
                        "shrink-0 rounded-[var(--radius-full)] px-1.5 py-0.5 text-[11px] font-medium tabular-nums",
                        s.note === "Guaranteed"
                          ? "bg-emerald-600/25 text-emerald-200"
                          : "bg-amber-600/20 text-amber-200",
                      )}
                    >
                      {s.note === "Guaranteed" ? t("codex.guaranteed") : s.note.replace(" drop", "")}
                    </span>
                  )}
                </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Crafting */}
        {item.crafting?.materials.length ? (
          <div>
            <SectionTitle>{t("codex.section.craftedFrom")}</SectionTitle>
            <div className="flex flex-col gap-1.5">
              {item.crafting.materials.map((m) => {
                const mat = erItemByBareId(m.item_id);
                return (
                <button
                  key={m.item_id}
                  onClick={() => mat && onSelect(mat)}
                  className="flex items-center justify-between rounded-[var(--radius-sm)] border border-border bg-white/[0.03] px-2.5 py-2 text-left transition-colors hover:bg-white/5 cursor-pointer"
                >
                  <span className="text-[13px] text-zinc-100">{m.name ?? `#${m.item_id}`}</span>
                  <span className="text-[12px] tabular-nums text-zinc-400">×{m.count}</span>
                </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* Used in recipes (material reverse index) */}
        {usedIn.length ? (
          <div>
            <SectionTitle>
              {t("codex.section.usedInRecipes", { count: usedIn.length })}
            </SectionTitle>
            <div className="flex flex-wrap gap-1.5">
              {usedIn.map((u) => (
                <button
                  key={u.id}
                  onClick={() => onSelect(u)}
                  className="rounded-[var(--radius-full)] border border-border px-2.5 py-1 text-[12px] text-zinc-200 transition-colors hover:bg-white/5 cursor-pointer"
                >
                  {u.name}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        </div>
      </div>
    </div>
  );
};

export default ErItemDetail;
