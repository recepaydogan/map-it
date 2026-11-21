import { useDeferredValue, useMemo, useState } from "react";
import { Search, Swords, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import ItemIcon from "../../components/item-icon";
import {
  erCategoryColor,
  erItemByKey,
  erItems,
  erItemKey,
  type ErItem,
} from "../../data/er-items-data";
import CodexItemRow from "../../features/codex/codex-item-row";
import { fuzzyScore, matchScore, NO_MATCH, searchQuery } from "../../lib/search-match";
import { useCompanionStack } from "./companion-nav";
import CompanionStack from "./companion-stack";
import { companionWeaponPicks, PICKS_REFERENCE_LEVEL } from "./companion-weapon-picks";

/** How many matches a single query renders. A bare two-letter query can match
 *  thousands of items; the cap keeps typing responsive, and the header always
 *  reports the TRUE match count so a capped list never reads as "that's all". */
const RESULT_LIMIT = 60;

/** How many weapons the opening screen suggests. */
const PICK_COUNT = 8;

/** Below this a query says too little to rank — two letters already match
 *  thousands of items. */
const MIN_QUERY = 2;

/** One suggested weapon: the item, plus the number that earned it the slot. */
const PickRow = ({
  itemKey,
  ar,
  detail,
  onSelect,
}: {
  itemKey: string;
  ar: number;
  detail: string;
  onSelect: () => void;
}) => {
  // Re-resolved by key so the row speaks the CURRENT language — the optimizer's
  // captured item objects keep the language they were computed in.
  const item = erItemByKey.get(itemKey);
  if (!item) return null;
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center gap-2.5 rounded-[var(--radius-md)] px-2 py-1.5 text-left transition-colors hover:bg-white/[0.05] cursor-pointer"
    >
      <ItemIcon
        iconId={item.icon_id}
        category={item.category}
        color={erCategoryColor[item.category] ?? "#a1a1aa"}
        glyph="sword"
        size={28}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-medium text-zinc-200">{item.name}</span>
        <span className="block truncate text-[10px] text-zinc-500">{detail}</span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-[11px] font-bold tabular-nums text-zinc-300">{Math.round(ar)}</span>
        <span className="block text-[8.5px] uppercase tracking-wider text-subtle">AR</span>
      </span>
    </button>
  );
};

/**
 * "Where do I get this?" — the second thing a player alt-tabs for, and the one
 * the companion can answer without ever opening the map.
 *
 * Selecting an item opens the app's own item page, which already carries the
 * full acquisition story (map pickups, who drops it and at what chance, which
 * merchant sells it and for how much) — and here every one of those sources is
 * a link: tap the boss that drops it to read its page, then walk back.
 */
const CompanionItemFinder = () => {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const stack = useCompanionStack();
  // Typing stays responsive while the (large) catalog is filtered.
  const deferredQuery = useDeferredValue(query);

  // Ranked, not just filtered: an exact name has to beat every item that merely
  // contains it, or "Dagger" opens on eleven other daggers. Separator-blind too,
  // so "smithing stone 1" finds "Smithing Stone [1]".
  const matches = useMemo(() => {
    if (deferredQuery.trim().length < MIN_QUERY) return [];
    const query = searchQuery(deferredQuery);
    const collect = (score: (value: string) => number) => {
      const out: { item: ErItem; score: number }[] = [];
      for (const item of erItems) {
        const value = score(item.name);
        if (value !== NO_MATCH) out.push({ item, score: value });
      }
      return out;
    };
    // Typos only rescue a dead end — see lib/search-match.
    let scored = collect((value) => matchScore(value, query));
    if (scored.length === 0) scored = collect((value) => fuzzyScore(value, query));
    return scored
      .sort((a, b) => a.score - b.score || a.item.name.localeCompare(b.item.name))
      .map((entry) => entry.item);
  }, [deferredQuery]);

  // Something to read (and tap) before the first keystroke — see
  // companion-weapon-picks for what these actually rank.
  const picks = useMemo(() => companionWeaponPicks(PICK_COUNT), []);

  return (
    <CompanionStack {...stack}>
      <div className="flex flex-col gap-2.5 px-3 py-3">
        <label className="flex items-center gap-2 rounded-[var(--radius-md)] border border-border bg-black/25 px-2.5 transition-colors focus-within:border-accent/60">
          <Search size={14} className="shrink-0 text-zinc-500" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("companion.searchItem")}
            aria-label={t("companion.searchItem")}
            className="h-9 min-w-0 flex-1 bg-transparent text-[13px] text-zinc-100 outline-none placeholder:text-zinc-600 [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label={t("common.clearSearch")}
              className="shrink-0 rounded-[3px] p-1 text-zinc-500 transition-colors hover:text-zinc-200 cursor-pointer"
            >
              <X size={13} aria-hidden="true" />
            </button>
          )}
        </label>

        {query.trim().length < 2 ? (
          <>
            <p className="px-1 text-[11px] leading-relaxed text-zinc-500">
              {t("companion.findHint")}
            </p>
            <section>
              <h3 className="flex items-center gap-1.5 px-1 pb-1 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                <Swords size={11} aria-hidden="true" />
                {t("companion.picksTitle")}
              </h3>
              <div className="flex flex-col">
                {picks.map((pick) => {
                  const itemKey = erItemKey(pick.item);
                  return (
                    <PickRow
                      key={pick.weaponId}
                      itemKey={itemKey}
                      ar={pick.adjustedAr}
                      detail={[
                        pick.affinity === "standard"
                          ? t("detail.buildAdvisor.affinityNone")
                          : t(`detail.buildAdvisor.affinity.${pick.affinity}`),
                        t("detail.buildAdvisor.upgradeLabel", {
                          level: pick.upgrade,
                          max: pick.maxUpgrade,
                        }),
                      ].join(" · ")}
                      onSelect={() => stack.open({ kind: "item", itemKey })}
                    />
                  );
                })}
              </div>
              {/* Say what the ranking IS, so nobody reads it as a tier list. */}
              <p className="px-1 pt-1.5 text-[10px] leading-snug text-zinc-600">
                {t("companion.picksNote", { level: PICKS_REFERENCE_LEVEL })}
              </p>
            </section>
          </>
        ) : matches.length === 0 ? (
          <p className="px-1 py-8 text-center text-[11.5px] leading-snug text-zinc-500">
            {t("companion.noItemMatch", { query: query.trim() })}
          </p>
        ) : (
          <section>
            <h3 className="px-1 pb-1 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
              {t("companion.itemCount", { count: matches.length })}
            </h3>
            <div className="flex flex-col">
              {matches.slice(0, RESULT_LIMIT).map((item) => (
                <CodexItemRow
                  key={erItemKey(item)}
                  item={item}
                  active={false}
                  onSelect={(selected) =>
                    stack.open({ kind: "item", itemKey: erItemKey(selected) })
                  }
                />
              ))}
            </div>
            {matches.length > RESULT_LIMIT && (
              <p className="px-1 pt-2 text-center text-[10.5px] text-zinc-600">
                {t("companion.refineSearch", { shown: RESULT_LIMIT, total: matches.length })}
              </p>
            )}
          </section>
        )}
      </div>
    </CompanionStack>
  );
};

export default CompanionItemFinder;
