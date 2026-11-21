import { useTranslation } from "react-i18next";
import { Crown, Moon } from "lucide-react";
import { gameLabels } from "../data/maps";
import type { Game } from "../data/types";
import { cn } from "../lib/cn";

const SUB_GAMES: { key: Game; icon: typeof Crown }[] = [
  { key: "elden-ring", icon: Crown },
  { key: "nightreign", icon: Moon },
];

/**
 * Segmented Elden Ring / Nightreign switcher for the shared full-window surfaces (Archive,
 * Guide) that host BOTH games behind a single tab. Each segment carries its OWN `data-game`,
 * so Elden Ring always reads Erdtree gold and Nightreign spectral cyan whichever is selected —
 * the pair reads as two games even though only the active one lights up.
 */
const GameSwitcher = ({ value, onChange }: { value: Game; onChange: (g: Game) => void }) => {
  const { t } = useTranslation();
  const gameName = (g: Game) => t(`game.${g}`, { defaultValue: gameLabels[g] });
  return (
    <div
      role="group"
      aria-label={t("nav.game")}
      className="relative flex shrink-0 items-center gap-0.5 rounded-[var(--radius-full)] border border-border bg-surface/70 p-0.5"
    >
      {SUB_GAMES.map(({ key, icon: Icon }) => {
        const active = value === key;
        return (
          <button
            key={key}
            data-game={key}
            onClick={() => onChange(key)}
            aria-pressed={active}
            title={gameName(key)}
            className={cn(
              "flex items-center gap-1.5 rounded-[var(--radius-full)] px-2.5 py-1.5 text-[12px] font-semibold transition-colors cursor-pointer sm:px-3",
              active ? "bg-accent text-on-accent" : "text-zinc-400 hover:text-white",
            )}
          >
            <Icon size={13} aria-hidden="true" />
            <span className="hidden sm:inline">{gameName(key)}</span>
          </button>
        );
      })}
    </div>
  );
};

export default GameSwitcher;
