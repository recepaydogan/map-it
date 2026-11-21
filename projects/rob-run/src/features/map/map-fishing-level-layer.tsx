import { Fish } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Tooltip from "../../components/tooltip";
import { useGameText } from "../../i18n/game-text";
import { fishingLevelLabels, fishingRegionPaths, fishingSkillColor } from "./map-fishing-levels";
import { worldToScreen, type MapProjectionMode } from "./map-projection";
import type { MapView } from "./types";

interface Props { view: MapView; width: number; height: number; projection: MapProjectionMode }

export default function MapFishingLevelLayer({ view, width, height, projection }: Props) {
  const { t } = useTranslation();
  const gameText = useGameText();
  const [hovered, setHovered] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const activeId = hovered ?? focused;
  const regions = useMemo(() => fishingRegionPaths(projection), [projection]);
  const drawnRegions = activeId
    ? [...regions].sort((a, b) => Number(a.id === activeId) - Number(b.id === activeId)) : regions;
  const origin = worldToScreen({ x: 0, y: 0 }, view, width, height, projection);
  const levelFontSize = Math.min(20, Math.max(14, 14 + (view.zoom - 0.02) * 100));
  return <div className="pointer-events-none absolute inset-0 z-20" data-map-fishing-levels="">
    <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-hidden" aria-hidden="true" data-fishing-boundaries="">
      <g transform={`translate(${origin.left} ${origin.top}) scale(${view.zoom})`}>
        {drawnRegions.map((region) => {
          const active = region.id === activeId;
          const color = fishingSkillColor(region.minimumSkill);
          const dash = region.minimumSkill === null ? "5 5" : undefined;
          return <g key={region.id} data-fishing-region={region.id} data-active={active}>
            <path d={region.path} fill={color} fillOpacity={active ? 0.22 : 0.09}
              fillRule="evenodd" stroke="#08121d" strokeOpacity={0.94} strokeWidth={active ? 7 : 5}
              strokeDasharray={dash} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            <path d={region.path} fill="none" stroke={color} strokeOpacity={active ? 1 : 0.95}
              strokeWidth={active ? 3.5 : 2.25} strokeDasharray={dash}
              strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          </g>;
        })}
      </g>
    </svg>
    {fishingLevelLabels(view, width, height, projection).map((zone) => {
      const name = gameText(zone.name, zone.nameKey);
      const minimum = zone.minimumSkill === null ? t("map.fishingLevels.tooltip.castUnknown")
        : t("map.fishingLevels.tooltip.cast", { skill: zone.minimumSkill });
      const target = zone.noEscapeSkill === null ? t("map.fishingLevels.tooltip.catchUnknown")
        : t("map.fishingLevels.tooltip.catch", { skill: zone.noEscapeSkill });
      const scope = "scope" in zone && zone.scope === "coast"
        ? ` · ${t("map.fishingLevels.coast", { name: gameText("Eastwind Shore", "AreaTable:16728:1") })}` : "";
      const displayName = scope ? gameText("Eastwind Shore", "AreaTable:16728:1") : name;
      return <div key={zone.id} data-fishing-zone={zone.id}
        className="pointer-events-auto absolute w-max max-w-[132px] -translate-x-1/2 -translate-y-1/2"
        style={{ left: zone.left, top: zone.top, zIndex: activeId === zone.id ? 1 : undefined }}>
        <Tooltip wrap openOnClick side={zone.top < Math.min(180, height / 2) ? "bottom" : "top"}
          contentClassName="px-3 py-2"
          label={<span className="flex flex-col gap-1.5">
            <strong>{name}{scope}</strong>
            <span>{minimum}</span>
            <span>{target}</span>
          </span>}>
          <button type="button" data-map-marker-control=""
            aria-label={`${name}${scope}. ${minimum} ${target}`}
            className="flex max-w-full cursor-pointer flex-col items-center gap-0.5 text-center focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-sky-200"
            onPointerEnter={() => setHovered(zone.id)} onPointerLeave={() => setHovered(null)}
            onFocus={() => setFocused(zone.id)} onBlur={() => setFocused(null)}>
            {zone.showName && <span className="max-w-full text-[11px] font-semibold leading-tight text-white [text-shadow:0_1px_2px_#000,0_0_4px_#000]">{displayName}</span>}
            <span className="inline-flex min-h-6 items-center gap-1 rounded-md border bg-[#101923] px-1.5 py-0.5 font-bold tabular-nums leading-none shadow-md shadow-black/60"
              style={{ color: fishingSkillColor(zone.minimumSkill), fontSize: levelFontSize }}>
              <Fish size={Math.round(levelFontSize * 0.72)} aria-hidden="true" />{zone.minimumSkill ?? "—"}
            </span>
          </button>
        </Tooltip>
      </div>;
    })}
  </div>;
}

