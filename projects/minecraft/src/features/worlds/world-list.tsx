import { MoreHorizontal, Star } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { GAME_EDITIONS } from "../../game-config";
import { cn } from "../../lib/cn";
import type { WorldRecord } from "./world-types";

interface WorldListProps {
  worlds: WorldRecord[];
  selectedId: string | null;
  busy: boolean;
  onSelect: (world: WorldRecord) => void;
  onFavorite: (world: WorldRecord) => void;
  onManage: (world: WorldRecord) => void;
}

/** Kept mounted under drill-down panes so search, scope, and scroll survive Back. */
const WorldList = ({ worlds, selectedId, busy, onSelect, onFavorite, onManage }: WorldListProps) => {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const matching = worlds.filter(world => (!favoritesOnly || world.favorite)
    && `${world.name} ${world.generation.seed} ${world.generation.version}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 space-y-2 px-4 pb-2 pt-3">
        <div className="flex gap-2">
          {[false, true].map(only => (
            <button key={String(only)} type="button" aria-pressed={favoritesOnly === only} onClick={() => setFavoritesOnly(only)}
              className={cn("flex-1 cursor-pointer rounded-[var(--radius-md)] border px-2 py-1.5 text-[12px] font-medium",
                favoritesOnly === only ? "border-accent/60 bg-accent-soft text-accent" : "border-border bg-white/5 text-zinc-200 hover:bg-white/10")}>
              {t(only ? "worlds.favorites" : "worlds.recent")}
            </button>
          ))}
        </div>
        <input type="search" value={query} onChange={event => setQuery(event.target.value)} aria-label={t("worlds.search")}
          placeholder={t("worlds.search")} className="w-full rounded-[var(--radius-md)] border border-border bg-black/25 px-2.5 py-1.5 text-[13px] text-white outline-none placeholder:text-zinc-400 focus:border-accent" />
      </div>
      <ul className="scroll-slim min-h-0 flex-1 overflow-y-auto px-4 pb-2">
        {matching.map(world => (
          <li key={world.id} className={cn("flex items-center gap-1 rounded-[var(--radius-md)] border border-transparent px-2 py-1",
            selectedId === world.id && "border-accent/30 bg-accent/10")}>
            <button type="button" disabled={busy} onClick={() => onSelect(world)} aria-current={selectedId === world.id ? "true" : undefined}
              className="min-w-0 flex-1 cursor-pointer py-2 text-left disabled:cursor-wait">
              <span className="block truncate text-[13px] font-semibold text-zinc-100">{world.name}</span>
              <span className="block truncate text-[11px] text-zinc-300">
                {t(GAME_EDITIONS.find(edition => edition.id === world.edition)?.labelKey ?? "worlds.edition")} · {world.generation.version}
              </span>
            </button>
            <button type="button" disabled={busy} onClick={() => onFavorite(world)} aria-label={t("worlds.favorites")} aria-pressed={world.favorite}
              className={cn("grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-sm)] hover:bg-white/5", world.favorite ? "text-accent" : "text-zinc-400")}>
              <Star size={14} fill={world.favorite ? "currentColor" : "none"} aria-hidden="true" />
            </button>
            <button type="button" disabled={busy} onClick={() => onManage(world)} aria-label={t("worlds.actions", { name: world.name })}
              className="grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-sm)] text-zinc-300 hover:bg-white/5">
              <MoreHorizontal size={16} aria-hidden="true" />
            </button>
          </li>
        ))}
        {matching.length === 0 && <li className="px-2 py-6 text-center text-[12px] text-white/80">{t(worlds.length ? "worlds.noResults" : "worlds.empty")}</li>}
      </ul>
    </div>
  );
};

export default WorldList;
