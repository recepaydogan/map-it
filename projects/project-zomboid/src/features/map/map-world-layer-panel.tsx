import { CarFront, EyeOff, MapPinHouse, Trees, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import MapSpawnProfessionFilter from "./map-spawn-profession-filter";
import type { MapSpawnData } from "./types";

interface MapWorldLayerPanelProps {
  foragingAvailable: boolean;
  foragingVisible: boolean;
  vehicleSpawnsAvailable: boolean;
  vehicleSpawnsVisible: boolean;
  spawnPoints: MapSpawnData | null;
  spawnPointsVisible: boolean;
  spawnProfessionId: string | null;
  onToggleForaging: () => void;
  onToggleVehicleSpawns: () => void;
  onToggleSpawnPoints: () => void;
  onSpawnProfessionChange: (professionId: string | null) => void;
  onClose: () => void;
}

/**
 * World-layer switches, as a panel beside the map toolbar rather than a popover
 * hanging off its button. It is sized by its content and never scrolls: the one
 * long list it owns (professions) floats above it instead of growing inside it.
 */
const MapWorldLayerPanel = ({
  foragingAvailable,
  foragingVisible,
  vehicleSpawnsAvailable,
  vehicleSpawnsVisible,
  spawnPoints,
  spawnPointsVisible,
  spawnProfessionId,
  onToggleForaging,
  onToggleVehicleSpawns,
  onToggleSpawnPoints,
  onSpawnProfessionChange,
  onClose,
}: MapWorldLayerPanelProps) => {
  const { t } = useTranslation();
  const [professionOpen, setProfessionOpen] = useState(false);

  const options = [
    {
      id: "foraging",
      available: foragingAvailable,
      active: foragingVisible,
      icon: Trees,
      label: t("map.worldLayers.foraging"),
      description: t("map.worldLayers.foragingHint"),
      onToggle: onToggleForaging,
    },
    {
      id: "vehicle-spawns",
      available: vehicleSpawnsAvailable,
      active: vehicleSpawnsVisible,
      icon: CarFront,
      label: t("map.worldLayers.vehicleSpawns"),
      description: t("map.worldLayers.vehicleSpawnsHint"),
      onToggle: onToggleVehicleSpawns,
    },
    {
      id: "spawn-points",
      available: Boolean(spawnPoints),
      active: spawnPointsVisible,
      icon: MapPinHouse,
      label: t("map.worldLayers.spawnPoints"),
      description: t("map.worldLayers.spawnPointsHint"),
      onToggle: () => {
        // Hiding the layer unmounts the profession picker; drop its open state
        // too, so re-enabling the layer does not bring the popover back with it.
        setProfessionOpen(false);
        onToggleSpawnPoints();
      },
    },
  ].filter(({ available }) => available);

  const activeOptions = options.filter(({ active }) => active);

  return (
    <section
      aria-label={t("map.worldLayers.title")}
      className="pointer-events-auto w-[19rem] rounded-[var(--radius-lg)] border border-border bg-surface/95 p-3 shadow-2xl shadow-black/50 backdrop-blur-xl animate-fade-in"
    >
      <header className="flex items-start gap-2 pb-2.5">
        <div className="min-w-0 flex-1">
          <h2 className="text-[13px] font-semibold text-zinc-100">{t("map.worldLayers.title")}</h2>
          <p className="mt-0.5 text-[12px] leading-snug text-zinc-400">
            {t("map.worldLayers.activeCount", { shown: activeOptions.length, total: options.length })}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("map.worldLayers.close")}
          className="-mr-1 grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-md)] text-zinc-400 transition-colors hover:bg-white/5 hover:text-white"
        >
          <X size={15} aria-hidden="true" />
        </button>
      </header>

      <div className="flex flex-col gap-1.5">
        {options.map(({ id, active, icon: Icon, label, description, onToggle }) => (
          <button
            key={id}
            type="button"
            onClick={onToggle}
            aria-pressed={active}
            className={cn(
              "flex w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-md)] border px-2.5 py-2 text-left transition-colors",
              active
                ? "border-accent/50 bg-accent-soft"
                : "border-border bg-white/[0.03] hover:bg-surface-hover",
            )}
          >
            <span
              className={cn(
                "grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius-sm)] transition-colors",
                active ? "bg-accent/20 text-accent" : "bg-white/8 text-zinc-400",
              )}
            >
              <Icon size={15} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-zinc-100">{label}</span>
              <span className="mt-0.5 block truncate text-[12px] text-zinc-400">{description}</span>
            </span>
            <span
              aria-hidden="true"
              className={cn(
                "relative h-[18px] w-8 shrink-0 rounded-[var(--radius-full)] border transition-colors",
                active ? "border-accent/60 bg-accent/25" : "border-white/15 bg-white/8",
              )}
            >
              <span
                className={cn(
                  "absolute top-[2px] left-[2px] h-3 w-3 rounded-[var(--radius-full)] transition-transform",
                  active ? "translate-x-[14px] bg-accent" : "bg-zinc-400",
                )}
              />
            </span>
          </button>
        ))}
      </div>

      {spawnPointsVisible && spawnPoints && (
        <MapSpawnProfessionFilter
          data={spawnPoints}
          value={spawnProfessionId}
          open={professionOpen}
          onOpenChange={setProfessionOpen}
          onChange={onSpawnProfessionChange}
        />
      )}

      {activeOptions.length > 0 && (
        <button
          type="button"
          onClick={() => activeOptions.forEach(({ onToggle }) => onToggle())}
          className="mt-2.5 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-border px-2.5 py-1.5 text-[12px] font-medium text-zinc-300 transition-colors hover:bg-surface-hover hover:text-zinc-100"
        >
          <EyeOff size={13} aria-hidden="true" />
          {t("map.worldLayers.hideAll")}
        </button>
      )}
    </section>
  );
};

export default MapWorldLayerPanel;
