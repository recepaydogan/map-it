import { useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { Library, X } from "lucide-react";
import type { Game } from "../../data/types";
import { useMapStore } from "../../store/map-store";
import GameSwitcher from "../../components/game-switcher";
import { cn } from "../../lib/cn";
import CodexOverlay from "./codex-overlay";
import NrArchive, { NIGHTREIGN_CATALOG_ART } from "../nightreign/nr-archive";

/**
 * Hosts the active item catalog. Older archive links that omit a game keep
 * the game picker, while direct navigation opens its catalog immediately.
 */
const ArchiveOverlay = ({
  onClose,
  initialItemKey,
  initialGame,
}: {
  onClose: () => void;
  initialItemKey?: string | null;
  initialGame?: Game | null;
}) => {
  const { t } = useTranslation();
  const activeGame = useMapStore((s) => s.game);
  // An ER item jump lands on the Elden Ring side regardless of the map's game; otherwise open
  // on the game you're playing so the catalog matches the map you came from.
  const [sub, setSub] = useState<Game>(
    initialItemKey ? "elden-ring" : (initialGame ?? activeGame),
  );
  const showSwitcher = !initialGame && !initialItemKey;
  const isNightreign = sub === "nightreign";

  return (
    <div
      data-game={sub}
      data-reference-page="archive"
      className={cn("absolute inset-0 z-[1500] flex flex-col bg-background animate-fade-in", isNightreign && "game-page-artwork")}
      style={isNightreign ? { "--game-page-image": `url(${NIGHTREIGN_CATALOG_ART})` } as CSSProperties : undefined}
    >
      {showSwitcher && <header className="relative flex items-center gap-3 border-b border-border bg-surface px-4 py-3 sm:px-6 sm:py-3.5">
        <div className="relative grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius-md)] border border-border">
          <Library size={20} className="relative text-accent" aria-hidden="true" />
        </div>
        <div className="relative min-w-0">
          <h1 className="font-display text-[16px] font-semibold uppercase leading-none tracking-[0.16em] text-white sm:text-[19px] sm:tracking-[0.18em]">
            {t("nav.archive")}
          </h1>
          <p className="mt-1 truncate text-[11px] tracking-wide text-muted">
            {sub === "elden-ring" ? t("codex.subtitle") : t("nightreign.archiveSubtitle")}
          </p>
        </div>

        <div className="flex-1" />

        {/* Game switcher — the sub-tabs, shared with the Guide surface. */}
        <GameSwitcher value={sub} onChange={setSub} />

        <button
          onClick={onClose}
          aria-label={t("codex.closeArchive")}
          className="relative grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius-md)] text-zinc-400 hover:bg-white/8 hover:text-white cursor-pointer"
        >
          <X size={17} aria-hidden="true" />
        </button>
      </header>}

      {/* Body — the two catalogs render embedded (no wrapper/masthead of their own). Mounting
          only the shown side keeps one list in the tree; switching games is a cheap remount. */}
      {sub === "elden-ring" ? (
        <CodexOverlay embedded initialItemKey={initialItemKey} />
      ) : (
        <NrArchive />
      )}
    </div>
  );
};

export default ArchiveOverlay;
