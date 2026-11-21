import { useMemo, useState } from "react";
import { Search, Skull, Swords, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import CategoryDot from "../../components/category-dot";
import { bossImageFor } from "../../data/boss-images";
import { enemyImageFor } from "../../data/enemy-images";
import { markerArtUrl } from "../../data/marker-art";
import { cn } from "../../lib/cn";
import {
  buildCompanionBossList,
  filterCompanionBosses,
  type CompanionBoss,
} from "./companion-boss-list";
import {
  companionEnemyCategory,
  filterCompanionEnemies,
  useCompanionEnemies,
  type CompanionEnemy,
} from "./companion-enemy-catalog";
import { useCompanionStack } from "./companion-nav";
import CompanionStack from "./companion-stack";
import { pushRecentBossId, readRecentBossIds } from "./companion-prefs";

/**
 * The row's face: the boss's own portrait.
 *
 * Not the map symbol — every boss and miniboss carries the SAME "Enemy" glyph,
 * so a list of 485 of them would read as one repeated icon. The portrait is what
 * actually identifies a fight at a glance. It streams from the asset CDN, so the
 * thumbnails are lazy (only the rows you scroll to are fetched) and fall back to
 * the marker's map art, then a skull, if one is ever missing.
 */
const BossThumb = ({ boss }: { boss: CompanionBoss }) => {
  const [failed, setFailed] = useState(false);
  const portrait = failed ? null : bossImageFor(boss.marker.id);
  const src = portrait ?? markerArtUrl(boss.marker);

  return (
    <span
      className={cn(
        "grid h-[27px] w-[48px] shrink-0 place-items-center overflow-hidden rounded-[4px] border bg-black/40",
        boss.category === "boss" ? "border-rose-400/25" : "border-white/8",
      )}
    >
      {src ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailed(true)}
          className={cn("h-full w-full", portrait ? "object-cover" : "object-contain p-1")}
        />
      ) : (
        <Skull size={12} className="text-zinc-600" aria-hidden="true" />
      )}
    </span>
  );
};

/**
 * The same row for a regular enemy. Its portrait comes from the enemy set (keyed
 * by the English name, which is why the record keeps one) and its fallback is the
 * category dot rather than map art: an enemy has no map symbol of its own.
 */
const EnemyRow = ({ enemy, onSelect }: { enemy: CompanionEnemy; onSelect: () => void }) => {
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false);
  const label = t(`category.${enemy.category}`, { defaultValue: enemy.category });
  const category = companionEnemyCategory(enemy.category, label);
  const portrait = failed ? null : enemyImageFor(enemy.marker.enName ?? enemy.name);

  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center gap-2.5 rounded-[var(--radius-md)] px-2 py-1.5 text-left transition-colors hover:bg-white/[0.05] cursor-pointer"
    >
      <span className="grid h-[27px] w-[48px] shrink-0 place-items-center overflow-hidden rounded-[4px] border border-white/8 bg-black/40">
        {portrait ? (
          <img
            src={portrait}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
            onError={() => setFailed(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <CategoryDot
            color={category?.color ?? "#a1a1aa"}
            icon={category?.icon ?? "enemy"}
            size={18}
          />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-medium text-zinc-200">{enemy.name}</span>
        <span className="block truncate text-[10px] text-zinc-500">
          {[label, enemy.region].filter(Boolean).join(" · ")}
        </span>
      </span>
      {/* One row stands for every placement of this enemy in the region — say so,
          rather than letting it read as a single spawn. */}
      {enemy.count > 1 && (
        <span className="shrink-0 text-[10px] tabular-nums text-zinc-600">×{enemy.count}</span>
      )}
    </button>
  );
};

const BossRow = ({ boss, onSelect }: { boss: CompanionBoss; onSelect: () => void }) => (
  <button
    type="button"
    onClick={onSelect}
    className="flex w-full items-center gap-2.5 rounded-[var(--radius-md)] px-2 py-1.5 text-left transition-colors hover:bg-white/[0.05] cursor-pointer"
  >
    <BossThumb boss={boss} />
    <span className="min-w-0 flex-1">
      <span className="block truncate text-[12.5px] font-medium text-zinc-200">{boss.name}</span>
      {boss.region && (
        <span className="block truncate text-[10px] text-zinc-500">{boss.region}</span>
      )}
    </span>
  </button>
);

/** How many enemy matches a single query renders. A bare two-letter query can
 *  match hundreds; the cap keeps the list scannable, and the header reports the
 *  TRUE count so a capped list never reads as "that's all". */
const ENEMY_RESULT_LIMIT = 60;

/**
 * The Boss tab: a searchable index of every fight the app has real data for,
 * opening into the app's own boss page (and, from there, its Build & Tips).
 *
 * The dashboard reaches a boss by finding it ON THE MAP, which is a poor fit for
 * "I'm stuck on this fight right now" — so the way in here is a search box, a
 * recents strip, and the last boss still open when the window comes back.
 *
 * Searching reaches past the bosses into every ORDINARY enemy too — the rest of
 * the map's "Bosses & Enemies" group (see companion-enemy-catalog). They're
 * search-only: 1,300-odd rows would drown the boss list this tab opens on, and
 * they carry the same combat intel, so they open the very same page.
 */
const CompanionBossAdvisor = () => {
  const { t, i18n } = useTranslation();

  // Names/regions are localized, so the catalog is rebuilt per language. The
  // language is the CACHE KEY, not an input the builder reads — markersByGame is
  // a live binding swapped for localized copies, which the lint rule can't see.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const bosses = useMemo(() => buildCompanionBossList(), [i18n.language]);
  const byId = useMemo(() => new Map(bosses.map((boss) => [boss.marker.id, boss])), [bosses]);

  // Reopen on the boss the player was last working on — the companion is meant
  // to be closed and reopened between attempts without losing its place.
  const [recentIds, setRecentIds] = useState<string[]>(() => readRecentBossIds());
  const stack = useCompanionStack(() => {
    const last = readRecentBossIds()[0];
    return last ? [{ kind: "marker" as const, markerId: last }] : [];
  });
  const [query, setQuery] = useState("");

  const results = useMemo(() => filterCompanionBosses(bosses, query), [bosses, query]);
  const recents = recentIds
    .map((id) => byId.get(id))
    .filter((boss): boss is CompanionBoss => Boolean(boss));

  // The catalog only goes on the wire once there's a query to answer with it.
  const searching = query.trim().length > 0;
  const { enemies, loading: enemiesLoading } = useCompanionEnemies(searching);
  const enemyResults = useMemo(
    () => filterCompanionEnemies(enemies, query),
    [enemies, query],
  );

  const selectBoss = (boss: CompanionBoss) => {
    setRecentIds(pushRecentBossId(boss.marker.id));
    stack.open({ kind: "marker", markerId: boss.marker.id });
    setQuery("");
  };

  // Enemies deliberately stay out of the recents strip: it's restored from disk
  // before the catalog exists, so an enemy in it would come back as a blank row.
  const selectEnemy = (enemy: CompanionEnemy) => {
    stack.open({ kind: "enemy", enemyId: enemy.marker.id });
    setQuery("");
  };

  return (
    <CompanionStack {...stack}>
      <div className="flex flex-col gap-2.5 px-3 py-3">
        <label className="flex items-center gap-2 rounded-[var(--radius-md)] border border-border bg-black/25 px-2.5 transition-colors focus-within:border-accent/60">
          <Search size={14} className="shrink-0 text-zinc-500" aria-hidden="true" />
          <input
            type="search"
            value={query}
            autoFocus
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("companion.searchFight")}
            aria-label={t("companion.searchFight")}
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

        {!query && recents.length > 0 && (
          <section>
            <h3 className="px-1 pb-1 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
              {t("companion.recent")}
            </h3>
            <div className="flex flex-wrap gap-1">
              {recents.map((boss) => (
                <button
                  key={boss.marker.id}
                  type="button"
                  onClick={() => selectBoss(boss)}
                  className="max-w-full truncate rounded-[var(--radius-full)] border border-border bg-white/[0.03] px-2.5 py-1 text-[11px] text-zinc-300 transition-colors hover:border-accent/50 hover:text-white cursor-pointer"
                >
                  {boss.name}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* The boss section keeps its heading even when empty ONLY while there's
            no query — that heading is the list's title, not a result count. */}
        {(results.length > 0 || !searching) && (
          <section>
            <h3 className="flex items-center gap-1.5 px-1 pb-1 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
              <Swords size={11} aria-hidden="true" />
              {t("companion.bossCount", { count: results.length })}
            </h3>
            <div className="flex flex-col">
              {results.map((boss) => (
                <BossRow key={boss.marker.id} boss={boss} onSelect={() => selectBoss(boss)} />
              ))}
            </div>
          </section>
        )}

        {enemyResults.length > 0 && (
          <section>
            <h3 className="flex items-center gap-1.5 px-1 pb-1 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
              <Skull size={11} aria-hidden="true" />
              {t("companion.enemyCount", { count: enemyResults.length })}
            </h3>
            <div className="flex flex-col">
              {enemyResults.slice(0, ENEMY_RESULT_LIMIT).map((enemy) => (
                <EnemyRow
                  key={enemy.marker.id}
                  enemy={enemy}
                  onSelect={() => selectEnemy(enemy)}
                />
              ))}
            </div>
            {enemyResults.length > ENEMY_RESULT_LIMIT && (
              <p className="px-1 pt-2 text-center text-[10.5px] text-zinc-600">
                {t("companion.refineSearch", {
                  shown: ENEMY_RESULT_LIMIT,
                  total: enemyResults.length,
                })}
              </p>
            )}
          </section>
        )}

        {/* "Nothing matches" is only true once the enemy catalog has landed —
            saying it while the answer is still on the wire is worse than waiting. */}
        {searching && results.length === 0 && enemyResults.length === 0 && (
          <p className="px-1 py-6 text-center text-[11.5px] leading-snug text-zinc-500">
            {enemiesLoading ? t("companion.searchingEnemies") : t("companion.noFightMatch", { query })}
          </p>
        )}
      </div>
    </CompanionStack>
  );
};

export default CompanionBossAdvisor;
