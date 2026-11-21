import { useTranslation } from "react-i18next";
import { Crown, Layers, type LucideIcon, Moon } from "lucide-react";
import Dropdown, { type DropdownOption } from "../../components/dropdown";
import { gameLabels } from "../../data/maps";
import type { Game, MapLayer } from "../../data/types";
import { cn } from "../../lib/cn";
import { useIsMobile } from "../../utils/platform";

const GAMES: { key: Game; icon: LucideIcon }[] = [
  { key: "elden-ring", icon: Crown },
  { key: "nightreign", icon: Moon },
];

interface WorldSwitcherViewProps {
  game: Game;
  layer: MapLayer;
  layers: { key: MapLayer; label: string }[];
  onGameChange: (game: Game) => void;
  onLayerChange: (layer: MapLayer) => void;
  disabledGames?: ReadonlySet<Game>;
}

/**
 * Top-left map control: which GAME's map you're looking at, and which layer of it.
 *
 * The game pair is the only route between the Elden Ring map and the Nightreign
 * one — `game` is persisted, so removing it strands whoever last used the other
 * map. The layer dropdown only appears where there's a choice to make (Nightreign
 * has a single layer).
 */
const WorldSwitcherView = ({
  game,
  layer,
  layers,
  onGameChange,
  onLayerChange,
  disabledGames,
}: WorldSwitcherViewProps) => {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const layerOptions: DropdownOption[] = layers.map((item) => ({
    value: item.key,
    label: item.label,
  }));
  const gameName = (key: Game) => t(`game.${key}`, { defaultValue: gameLabels[key] });

  return (
    <div data-tour="world" className="flex min-w-0 items-center gap-1.5 sm:gap-2">
      <div
        role="group"
        aria-label={t("nav.game")}
        className="flex shrink-0 items-center gap-0.5 rounded-[var(--radius-full)] border border-border bg-surface/85 p-0.5 shadow-lg shadow-black/30 backdrop-blur-xl"
      >
        {GAMES.map(({ key, icon: Icon }) => {
          const active = game === key;
          const disabled = disabledGames?.has(key) ?? false;
          return (
            <button
              key={key}
              onClick={() => !active && !disabled && onGameChange(key)}
              disabled={disabled}
              aria-pressed={active}
              aria-label={gameName(key)}
              title={disabled ? t("erMap.gameUnavailable") : gameName(key)}
              className={cn(
                // Icon-only and tight on a phone: every pixel this group gives
                // back is a pixel the toolbar's action buttons need on the row.
                "flex items-center gap-1.5 rounded-[var(--radius-full)] px-2 py-1.5 text-[13px] font-semibold transition-colors cursor-pointer sm:px-3",
                active
                  ? "bg-accent text-on-accent"
                  : "text-zinc-300 hover:bg-white/5 hover:text-white",
                disabled && "cursor-not-allowed opacity-45 hover:bg-transparent hover:text-zinc-300",
              )}
            >
              <Icon size={14} aria-hidden="true" />
              <span className="hidden sm:inline">{gameName(key)}</span>
            </button>
          );
        })}
      </div>

      {layers.length > 1 && (
        <Dropdown
          // The Layers glyph is decoration next to a label that already says
          // "Overworld" — dropped on a phone, where its 22px (icon + gap) is
          // what keeps the whole toolbar on one row.
          icon={isMobile ? undefined : Layers}
          value={layer}
          options={layerOptions}
          onChange={(value) => onLayerChange(value as MapLayer)}
          className="bg-surface/85 shadow-lg shadow-black/30 backdrop-blur-xl max-sm:gap-1.5 max-sm:px-2.5"
        />
      )}
    </div>
  );
};

export default WorldSwitcherView;
