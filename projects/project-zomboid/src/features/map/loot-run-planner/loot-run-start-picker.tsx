import { useTranslation } from "react-i18next";
import { cn } from "../../../lib/cn";
import type { MapTown, UserMapMarker } from "../types";
import { LOOT_RUN_BASE_RADIUS, type LootRunStart } from "./loot-run-start";
import type { LootRunOriginSource } from "./use-loot-run-origin";

export interface LootRunStartPickerProps {
  value: LootRunStart;
  towns: MapTown[];
  markers: UserMapMarker[];
  originSource: LootRunOriginSource;
  picking: boolean;
  ready: boolean;
  onChange: (value: LootRunStart) => void;
  onPick: () => void;
  onCancelPick: () => void;
  onSelectBase: () => void;
}

const LootRunStartPicker = ({ value, towns, markers, originSource, picking, onChange, onPick, onCancelPick, onSelectBase }: LootRunStartPickerProps) => {
  const { t } = useTranslation();
  const baseMarkers = markers.filter((marker) => marker.group === "safehouses"
    || (value.mode === "base" && marker.id === value.markerId));
  const controlClass = "w-full rounded-[var(--radius-sm)] border border-border bg-surface px-2 py-2 text-[11px] text-white focus-visible:outline-2 focus-visible:outline-accent";
  return <fieldset className="shrink-0 space-y-2">
    <legend className="mb-2 text-[11px] font-semibold text-white">{t("map.lootRun.start.title")}</legend>
    <div className="grid grid-cols-2 gap-1.5">
      {(["current", "town", "point", "base"] as const).map((mode) => <button
        key={mode} type="button" aria-pressed={value.mode === mode}
        onClick={() => {
          if (value.mode === mode) return;
          onCancelPick();
          if (mode === "current") onChange({ mode });
          if (mode === "town") onChange({ mode, townId: "" });
          if (mode === "point") onChange({ mode, point: null });
          if (mode === "base") onChange({ mode, markerId: "" });
        }}
        className={cn("cursor-pointer rounded-[var(--radius-sm)] border px-2 py-2 text-left text-[11px] text-white transition-colors focus-visible:outline-2 focus-visible:outline-accent", value.mode === mode ? "border-accent bg-accent-soft" : "border-border hover:bg-white/5")}
      >{t(`map.lootRun.start.${mode}`)}</button>)}
    </div>
    {value.mode === "current" && <p className="text-[10px] leading-4 text-white/80" role="status">
      {t(originSource === "unavailable" ? "map.lootRun.start.noPosition" : `map.lootRun.origin.${originSource}`)}
    </p>}
    {value.mode === "town" && <label className="block">
      <span className="sr-only">{t("map.lootRun.start.chooseTown")}</span>
      <select className={controlClass} value={value.townId} onChange={(event) => onChange({ mode: "town", townId: event.target.value })}>
        <option value="">{t("map.lootRun.start.chooseTown")}</option>
        {towns.map((town) => <option key={town.id} value={town.id}>{town.name}</option>)}
      </select>
      <span className="mt-1 block text-[10px] leading-4 text-white/80">{t("map.lootRun.start.townHint")}</span>
    </label>}
    {value.mode === "point" && <div className="space-y-1.5">
      <p className="text-[10px] leading-4 text-white/80" role="status">{picking
        ? t("map.lootRun.start.pickHint")
        : value.point ? t("map.lootRun.start.coordinates", { x: Math.round(value.point.x), y: Math.round(value.point.y) }) : t("map.lootRun.start.pointHint")}</p>
      <button type="button" className={cn(controlClass, "cursor-pointer hover:bg-surface-hover")} onClick={picking ? onCancelPick : onPick}>
        {t(picking ? "map.lootRun.start.cancelPick" : "map.lootRun.start.pickPoint")}
      </button>
    </div>}
    {value.mode === "base" && <div className="space-y-1.5">
      {baseMarkers.length === 0 ? (
        <button type="button" className={cn(controlClass, "cursor-pointer border-accent bg-accent-soft hover:bg-surface-hover")} onClick={onSelectBase}>
          {t("map.lootRun.start.selectMyBase")}
        </button>
      ) : (
      <label className="block">
        <span className="sr-only">{t("map.lootRun.start.chooseBase")}</span>
        <select className={controlClass} value={value.markerId} onChange={(event) => onChange({ mode: "base", markerId: event.target.value })}>
          <option value="">{t("map.lootRun.start.chooseBase")}</option>
          {baseMarkers.map((marker) => <option key={marker.id} value={marker.id}>{marker.name}</option>)}
        </select>
      </label>
      )}
      <p className="text-[10px] leading-4 text-white/80">{t("map.lootRun.start.baseHint", { radius: LOOT_RUN_BASE_RADIUS })}</p>
    </div>}
  </fieldset>;
};

export default LootRunStartPicker;
