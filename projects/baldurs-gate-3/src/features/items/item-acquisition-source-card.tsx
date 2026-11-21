import {
  Anvil,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  Dice5,
  Gift,
  Hand,
  MapPin,
  PackageOpen,
  Skull,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import type { MapLocationNavigationTarget } from "../map/map-location-navigation";
import {
  uniqueAcquisitionLocations,
  type ItemAcquisitionPresentation,
} from "./item-acquisition-presentation";
import type { ItemAcquisition, ItemAcquisitionKind } from "./types";

const ICONS: Record<ItemAcquisitionKind, LucideIcon> = {
  world: MapPin,
  drop: Skull,
  pickpocket: Hand,
  vendor: CircleDollarSign,
  container: PackageOpen,
  "random-loot": Dice5,
  reward: Gift,
  crafted: Anvil,
  carried: UserRound,
};

interface ItemAcquisitionSourceCardProps {
  source: ItemAcquisitionPresentation;
  commonRegion: string | null;
  onNavigateMapLocation: (target: MapLocationNavigationTarget) => void;
}

const localized = (
  values: Record<string, string> | undefined,
  fallback: string | undefined,
  language: string,
) => values?.[language] ?? values?.[language.split("-")[0]] ?? values?.en ?? fallback;

const uniqueLocationNames = (acquisitions: ItemAcquisition[]) => {
  const names = acquisitions.flatMap(({ mapName, region }) => [mapName, region]).filter(Boolean) as string[];
  return names.filter((name, index) => names.indexOf(name) === index);
};

const ItemAcquisitionSourceCard = ({
  source,
  commonRegion,
  onNavigateMapLocation,
}: ItemAcquisitionSourceCardProps) => {
  const { t, i18n } = useTranslation();
  const [locationsExpanded, setLocationsExpanded] = useState(false);
  const acquisition = source.acquisitions[0];
  const language = i18n.resolvedLanguage ?? i18n.language;
  const Icon = ICONS[source.kind];
  const locations = uniqueAcquisitionLocations(source.acquisitions);
  const sourceName = localized(acquisition.localizedSources, acquisition.source, language) ?? acquisition.source;
  const locationNames = uniqueLocationNames(source.acquisitions);
  const primary = source.kind === "world"
    ? acquisition.region ?? acquisition.mapName ?? sourceName
    : sourceName;
  const secondary = locationNames
    .filter((location) => location !== primary && location !== commonRegion)
    .join(" · ");
  const details = new Set(source.acquisitions.map((entry) => localized(entry.localizedDetails, entry.detail, language)));
  const detail = details.size === 1 ? localized(acquisition.localizedDetails, acquisition.detail, language) : undefined;
  const combinedMethods = source.methods.length > 1;
  const amount = source.acquisitions.every(({ amount: value }) => value === acquisition.amount)
    ? acquisition.amount
    : undefined;
  const guaranteed = acquisition.certainty === "guaranteed";
  const hasOneLocation = locations.length === 1;
  const hasMultipleLocations = locations.length > 1;
  const singleLocationDetail = hasOneLocation
    ? localized(locations[0].localizedLocationDetails, locations[0].locationDetail, language)
    : undefined;

  const content = (
    <>
      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-[var(--radius-full)] border border-accent/25 bg-accent-soft text-accent">
        <Icon size={11} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] text-zinc-100">{primary}</span>
        {secondary && (
          <span className="mt-0.5 block truncate text-[11px] text-muted">
            {secondary}
          </span>
        )}
        {detail && <span className="mt-1 block text-[11px] leading-relaxed text-subtle">{detail}</span>}
        {singleLocationDetail && singleLocationDetail !== detail && (
          <span className="mt-1 block text-[11px] leading-relaxed text-subtle">{singleLocationDetail}</span>
        )}
        {combinedMethods && (
          <span className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] font-medium text-subtle">
            {source.methods.map((method) => {
              const MethodIcon = ICONS[method];
              return (
                <span key={method} className="inline-flex items-center gap-1">
                  <MethodIcon size={10} aria-hidden="true" />
                  {t(`items.acquisition.methods.${method}`)}
                </span>
              );
            })}
          </span>
        )}
      </span>
      {amount && amount > 1 && (
        <span className="shrink-0 text-[11px] font-medium tabular-nums text-subtle">×{amount}</span>
      )}
      {(!combinedMethods || !guaranteed) && (
        <span className={cn(
          "shrink-0 rounded-[var(--radius-full)] px-1.5 py-0.5 text-[10px] font-medium tabular-nums",
          guaranteed
            ? "bg-emerald-600/25 text-emerald-200"
            : "bg-warning/15 text-warning",
        )}>
          {guaranteed
            ? t("items.acquisition.guaranteedChance")
            : acquisition.inventoryVariants?.length
              ? t("map.itemStoryImpact.conditional")
              : t(`items.acquisition.certainty.${acquisition.certainty}`)}
        </span>
      )}
      {hasOneLocation && <ChevronRight size={14} className="shrink-0 text-muted" aria-hidden="true" />}
      {hasMultipleLocations && (
        <ChevronDown
          size={14}
          className={cn("shrink-0 text-muted transition-transform", locationsExpanded && "rotate-180")}
          aria-hidden="true"
        />
      )}
    </>
  );

  const cardClassName = "flex w-full items-center gap-2 px-2.5 py-2 text-left";
  const interactiveClassName = "cursor-pointer transition-colors hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent";

  if (hasMultipleLocations) {
    return (
      <article className="overflow-hidden rounded-[var(--radius-sm)] border border-border bg-white/[0.03]">
        <button
          type="button"
          onClick={() => setLocationsExpanded((current) => !current)}
          className={cn(cardClassName, interactiveClassName, "hover:border-accent/50")}
          aria-expanded={locationsExpanded}
          aria-label={t("items.acquisition.showLocations", { source: primary })}
        >
          {content}
        </button>
        {locationsExpanded && (
          <div className="border-t border-border px-2 py-1.5">
            {locations.map((location) => {
              const locationName = location.region ?? location.mapName ?? primary;
              const locationDetail = localized(
                location.localizedLocationDetails,
                location.locationDetail,
                language,
              );
              return (
                <button
                  type="button"
                  key={`${location.mapId}:${location.locationId}`}
                  onClick={() => onNavigateMapLocation({
                    mapId: location.mapId!,
                    locationId: location.locationId!,
                  })}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left transition-colors hover:bg-white/[0.04] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
                  aria-label={t("items.acquisition.showOnMap", { source: `${primary}, ${locationName}` })}
                >
                  <MapPin size={11} className="shrink-0 text-accent" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11px] font-medium text-zinc-200">{locationName}</span>
                    {locationDetail && (
                      <span className="mt-0.5 block text-[10px] leading-4 text-muted">{locationDetail}</span>
                    )}
                  </span>
                  <ChevronRight size={12} className="shrink-0 text-muted" aria-hidden="true" />
                </button>
              );
            })}
          </div>
        )}
      </article>
    );
  }

  if (hasOneLocation) {
    return (
      <button
        type="button"
        onClick={() => onNavigateMapLocation({
          mapId: locations[0].mapId!,
          locationId: locations[0].locationId!,
        })}
        className={cn(
          cardClassName,
          interactiveClassName,
          "rounded-[var(--radius-sm)] border border-border bg-white/[0.03] hover:border-accent/50",
        )}
        aria-label={t("items.acquisition.showOnMap", { source: primary })}
      >
        {content}
      </button>
    );
  }

  return (
    <article className={cn(cardClassName, "rounded-[var(--radius-sm)] border border-border bg-white/[0.03]")}>
      {content}
    </article>
  );
};

export default ItemAcquisitionSourceCard;
