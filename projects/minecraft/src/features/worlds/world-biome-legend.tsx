import { ChevronDown, Map as MapIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { GAME_BIOMES } from "../../game-config";
import { cn } from "../../lib/cn";

const biomeById = new Map<number, (typeof GAME_BIOMES)[number]>(GAME_BIOMES.map(biome => [biome.id, biome]));

const WorldBiomeLegend = ({ biomeIds }: { biomeIds: readonly number[] }) => {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  if (!biomeIds.length) return null;
  return <section data-biome-legend className="border-b border-border/60">
    <button type="button" onClick={() => setOpen(value => !value)} aria-expanded={open}
      className="flex w-full cursor-pointer items-center gap-2.5 py-2 text-left">
      <MapIcon size={16} className="shrink-0 text-accent" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-zinc-100">{t("biomeMap.legend")}</span>
      <span className="rounded-[var(--radius-full)] bg-white/8 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-zinc-300">
        {biomeIds.length.toLocaleString(i18n.language)}
      </span>
      <ChevronDown size={15} className={cn("text-subtle transition-transform", open && "rotate-180")} aria-hidden="true" />
    </button>
    {open && <div className="grid grid-cols-2 gap-x-2 gap-y-1 pb-3" aria-label={t("biomeMap.visibleBiomes")}>
      {biomeIds.map(id => {
        const biome = biomeById.get(id);
        return <div key={id} className="flex min-w-0 items-center gap-2 rounded-[var(--radius-sm)] px-1.5 py-1 text-[11px] text-zinc-200">
          <span className="h-3 w-3 shrink-0 rounded-[var(--radius-sm)] border border-white/30"
            style={{ backgroundColor: biome?.color ?? "#777777" }} aria-hidden="true" />
          <span className="min-w-0 truncate" title={biome ? t(biome.labelKey) : t("biomeMap.unknownBiome", { id })}>
            {biome ? t(biome.labelKey) : t("biomeMap.unknownBiome", { id })}
          </span>
        </div>;
      })}
    </div>}
  </section>;
};

export default WorldBiomeLegend;
