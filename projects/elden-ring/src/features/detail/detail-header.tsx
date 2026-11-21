import { useState } from "react";
import { MapPin, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import CategoryDot from "../../components/category-dot";
import { markerArtUrl, markerFallbackUrl } from "../../data/marker-art";
import type { CategoryDef, Marker } from "../../data/types";
import { cn } from "../../lib/cn";

interface DetailHeaderProps {
  marker: Marker;
  def: CategoryDef | undefined;
  layerLabel: string;
  onClose: () => void;
}

/** The header symbol: the marker's real extracted map art (boss → the game's
 * enemy marker, grace → bonfire, …) when it has one, else the category glyph. */
const HeaderIcon = ({ marker, color, glyph }: { marker: Marker; color: string; glyph: string }) => {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const url = markerArtUrl(marker);
  const fallback = markerFallbackUrl(marker);

  if ((!url || failed) && !fallback) return <CategoryDot color={color} icon={glyph} size={56} />;

  return (
    <span className="relative grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-[var(--radius-md)] bg-black/30">
      {fallback && (!loaded || failed) && (
        <img src={fallback} alt="" draggable={false} className="absolute inset-0 h-full w-full object-contain" />
      )}
      {url && !failed && (
        <img
          src={url}
          alt=""
          draggable={false}
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          // Art is pre-trimmed at extraction, so object-contain fills the frame
          // without the old scale-up crop hack.
          className={`relative h-full w-full object-contain transition-opacity ${loaded ? "opacity-100" : "opacity-0"}`}
        />
      )}
    </span>
  );
};

// The fixed identity card — lives OUTSIDE the panel's scroll area, so the
// scrollbar only runs alongside the body below it. Mirrors DetailItem's header:
// bottom border, blurred surface, 56px symbol. `relative` anchors the close X.
const DetailHeader = ({ marker, def, layerLabel, onClose }: DetailHeaderProps) => {
  const { t } = useTranslation();
  const location = [marker.region, layerLabel].filter(Boolean).join(" · ");
  return (
    <header className="relative mb-4 flex shrink-0 items-start gap-3 border-b border-border bg-surface/95 px-4 pb-4 pt-4 backdrop-blur-xl">
      <button
        onClick={onClose}
        aria-label={t("detail.closeDetails")}
        className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-[var(--radius-md)] text-zinc-400 hover:bg-white/8 hover:text-white cursor-pointer"
      >
        <X size={16} aria-hidden="true" />
      </button>

      <HeaderIcon marker={marker} color={def?.color ?? "#a1a1aa"} glyph={def?.icon ?? "pin"} />
      <div className="min-w-0 pr-8">
        <h2 className="text-base font-semibold leading-tight text-white">{marker.name}</h2>
        {def?.label ? <p className="mt-0.5 text-xs text-muted">{def.label}</p> : null}
        {location && (
          <p className="mt-1 flex items-center gap-1 text-[11px] text-subtle">
            <MapPin size={11} className="text-accent" aria-hidden="true" />
            {location}
          </p>
        )}
      </div>
    </header>
  );
};

/** Boss stats / night / seeding badges — rendered inside the scroll body. */
export const MarkerMeta = ({ marker }: { marker: Marker }) => {
  const { t, i18n } = useTranslation();
  if (!(marker.bossMeta || marker.day || marker.seeded === false)) return null;
  return (
    <div className="flex flex-wrap justify-center gap-1.5 px-4 pb-1">
      {marker.bossMeta?.hp ? (
        <MetaBadge label={t("detail.hp")} value={marker.bossMeta.hp.toLocaleString(i18n.language)} />
      ) : null}
      {marker.bossMeta?.poise ? (
        <MetaBadge label={t("detail.poise")} value={marker.bossMeta.poise.toLocaleString(i18n.language)} />
      ) : null}
      {marker.bossMeta?.runes ? (
        <MetaBadge label={t("detail.runes")} value={marker.bossMeta.runes.toLocaleString(i18n.language)} />
      ) : null}
      {marker.day ? <MetaBadge label={t("detail.night")} value={String(marker.day)} /> : null}
      {marker.seeded === false ? (
        <span className="rounded-[var(--radius-full)] border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-200">
          {t("detail.locationNotGuaranteed")}
        </span>
      ) : null}
    </div>
  );
};

const MetaBadge = ({ label, value, className }: { label: string; value: string; className?: string }) => (
  <span
    className={cn(
      "rounded-[var(--radius-full)] bg-white/8 px-2 py-0.5 text-[11px] font-medium text-zinc-200",
      className,
    )}
  >
    <span className="text-zinc-500">{label} </span>
    <span className="tabular-nums">{value}</span>
  </span>
);

export default DetailHeader;
