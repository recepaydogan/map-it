import { useMemo, useState } from "react";
import { GraduationCap, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { erGuideCategories } from "../../data/er-guide-data";
import { nrGuideCategories } from "../../data/nightreign-data";
import type { GuideEntry } from "../../data/guide-types";
import type { Game } from "../../data/types";
import GameSwitcher from "../../components/game-switcher";
import { cn } from "../../lib/cn";

/** Where each game's tutorial art lives (extract-{er,nr}-guide-images.mjs). */
const IMAGE_BASE: Record<Game, string> = {
  "elden-ring": "/icons/elden-ring/tuto",
  nightreign: "/icons/nightreign/tuto",
};

/** One guide page: the game's own illustration (when it ships one) above title + body. */
const GuideCard = ({ entry, imageBase }: { entry: GuideEntry; imageBase: string }) => (
  <article className="flex flex-col overflow-hidden rounded-[var(--radius-lg)] border border-border bg-white/[0.02]">
    {entry.image !== undefined && (
      <img
        src={`${imageBase}/${entry.image}.webp`}
        alt=""
        loading="lazy"
        draggable={false}
        className="aspect-video w-full border-b border-border object-cover"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = "none";
        }}
      />
    )}
    <div className="p-4">
      <h3 className="text-[14.5px] font-semibold leading-tight text-white">{entry.title}</h3>
      {/* A single-line inscription is all title and no body — don't leave a dangling gap. */}
      {entry.body && (
        <p className="mt-2 whitespace-pre-line text-[12.5px] leading-relaxed text-zinc-300">{entry.body}</p>
      )}
    </div>
  </article>
);

/**
 * Guide — each game's OWN in-game knowledge base, rendered for whichever game is active:
 *
 *  • Elden Ring: the tutorial pages (with their illustrations) plus the loading-screen
 *    knowledge cards, grouped by the game's own id bands — including the official Status
 *    Effects explanations (Poison, Scarlet Rot, Blood Loss, Frostbite, Sleep, Madness).
 *  • Nightreign: the Guide archive (Basic Rules / Expedition Region / Roundtable Hold).
 *
 * Every word and picture is the game's own (TutorialParam / KnowledgeLoadScreenItemParam +
 * FMGs); nothing here is hand-written or scraped. Controller-chart categories are dropped at
 * build time because their key-glyph markup can't render outside the game.
 */
const GuideOverlay = ({ onClose, game }: { onClose: () => void; game: Game }) => {
  const { t } = useTranslation();
  // `game` (the map's active game) is only the INITIAL side; an in-header switcher then hosts
  // BOTH games' guides under this one tab, exactly like the unified Archive.
  const [sub, setSub] = useState<Game>(game);
  const categories = sub === "elden-ring" ? erGuideCategories : nrGuideCategories;
  const [catId, setCatId] = useState<string | number | undefined>(undefined);
  // The switcher swaps games under us — fall back to the first category of whichever
  // game is showing instead of stranding a stale (other-game) id.
  const current = useMemo(
    () => categories.find((c) => c.id === catId) ?? categories[0],
    [categories, catId],
  );
  const switchSub = (g: Game) => {
    setSub(g);
    setCatId(undefined); // land on the new game's first category
  };

  return (
    <div data-game={sub} className="absolute inset-0 z-[1500] flex flex-col bg-background animate-fade-in">
      <header className="relative flex items-center gap-3 border-b border-border px-4 py-3.5 sm:px-6 sm:py-4">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-b from-accent/[0.07] to-transparent" />
        <div className="relative grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius-md)] border border-accent/30 bg-accent-soft">
          <GraduationCap size={18} className="text-accent" aria-hidden="true" />
        </div>
        <div className="relative min-w-0">
          <h1 className="font-display text-[16px] font-semibold uppercase leading-none tracking-[0.14em] text-white sm:text-[19px] sm:tracking-[0.18em]">
            {t("nav.guide")}
          </h1>
          <p className="mt-1 truncate text-[11px] tracking-wide text-muted">
            {t(sub === "elden-ring" ? "guide.erSubtitle" : "nightreign.guideSubtitle")}
          </p>
        </div>
        <div className="flex-1" />
        {/* Game switcher — the sub-tabs, shared with the Archive surface. */}
        <GameSwitcher value={sub} onChange={switchSub} />
        <button
          onClick={onClose}
          aria-label={t("nightreign.closeGuide")}
          className="relative grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius-md)] text-zinc-400 hover:bg-white/8 hover:text-white cursor-pointer"
        >
          <X size={17} aria-hidden="true" />
        </button>
      </header>

      {/* A handful of official categories — a segmented strip beats a rail. */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-4 py-2.5 sm:px-6">
        {categories.map((c) => {
          const active = c.id === current?.id;
          return (
            <button
              key={c.id}
              onClick={() => setCatId(c.id)}
              aria-current={active ? "true" : undefined}
              className={cn(
                "rounded-[var(--radius-full)] px-3 py-1.5 text-[12.5px] font-medium transition-colors cursor-pointer",
                active ? "bg-accent-soft text-white" : "text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100",
              )}
            >
              {c.label}
              <span className={cn("ml-1.5 text-[10.5px]", active ? "text-accent" : "text-subtle")}>
                {c.entries.length}
              </span>
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-3.5 px-4 py-5 sm:grid-cols-2 sm:px-6 xl:grid-cols-3">
          {current?.entries.map((e) => (
            <GuideCard key={e.id} entry={e} imageBase={IMAGE_BASE[sub]} />
          ))}
        </div>
      </div>
    </div>
  );
};

export default GuideOverlay;
