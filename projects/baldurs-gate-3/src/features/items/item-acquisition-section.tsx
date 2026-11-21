import { ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import type { MapLocationNavigationTarget } from "../map/map-location-navigation";
import { presentItemAcquisitions } from "./item-acquisition-presentation";
import ItemAcquisitionSourceCard from "./item-acquisition-source-card";
import type { ItemAcquisition, ItemAcquisitionKind } from "./types";

const DEFAULT_INITIAL_LIMIT = 8;

const GROUPS: Array<{
  id: string;
  kind: ItemAcquisitionKind;
  combinedMethods?: boolean;
}> = [
  { id: "world", kind: "world" },
  { id: "combined-carried", kind: "carried", combinedMethods: true },
  { id: "drop", kind: "drop" },
  { id: "pickpocket", kind: "pickpocket" },
  { id: "vendor", kind: "vendor" },
  { id: "container", kind: "container" },
  { id: "reward", kind: "reward" },
  { id: "crafted", kind: "crafted" },
  { id: "carried", kind: "carried", combinedMethods: false },
  { id: "random-loot", kind: "random-loot" },
];

const belongsToGroup = (
  source: ReturnType<typeof presentItemAcquisitions>[number],
  group: (typeof GROUPS)[number],
) => source.kind === group.kind
  && (group.combinedMethods === undefined
    || (source.methods.length > 1) === group.combinedMethods);

interface ItemAcquisitionSectionProps {
  acquisitions: ItemAcquisition[];
  onNavigateMapLocation: (target: MapLocationNavigationTarget) => void;
  initialLimit?: number;
}

const ItemAcquisitionSection = ({
  acquisitions,
  onNavigateMapLocation,
  initialLimit = DEFAULT_INITIAL_LIMIT,
}: ItemAcquisitionSectionProps) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const presentations = useMemo(() => presentItemAcquisitions(acquisitions), [acquisitions]);
  const orderedPresentations = GROUPS.flatMap((group) =>
    presentations.filter((presentation) => belongsToGroup(presentation, group)));
  const visible = expanded ? orderedPresentations : orderedPresentations.slice(0, initialLimit);
  const groups = GROUPS.map((group) => ({
    ...group,
    sources: visible.filter((source) => belongsToGroup(source, group)),
    total: presentations.filter((source) => belongsToGroup(source, group)).length,
  })).filter((group) => group.sources.length > 0);

  if (acquisitions.length === 0) return null;

  return (
    <div className="space-y-4">
      {groups.map((group) => {
        const regions = group.sources
          .flatMap((source) => source.acquisitions)
          .map((acquisition) => acquisition.region)
          .filter((region): region is string => Boolean(region));
        const commonRegion = regions.length > 1 && regions.every((region) => region === regions[0])
          ? regions[0]
          : null;
        const headingId = `item-acquisition-${group.id}`;

        return (
          <section key={group.id} aria-labelledby={headingId}>
            <h2
              id={headingId}
              className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-subtle"
            >
              {t(`items.acquisition.kinds.${group.kind}`)}
              {group.total > 1 ? ` · ${group.total}` : ""}
              {commonRegion && (
                <span className="font-normal normal-case tracking-normal text-muted">
                  {" · "}{commonRegion}
                </span>
              )}
            </h2>

            <div className="flex flex-col gap-1.5">
              {group.sources.map((source) => (
                <ItemAcquisitionSourceCard
                  key={source.id}
                  source={source}
                  commonRegion={commonRegion}
                  onNavigateMapLocation={onNavigateMapLocation}
                />
              ))}
            </div>
          </section>
        );
      })}

      {presentations.length > initialLimit && (
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="flex cursor-pointer items-center gap-1.5 text-[11px] font-semibold text-subtle transition-colors hover:text-white"
        >
          <ChevronDown size={13} className={cn("transition-transform", expanded && "rotate-180")} aria-hidden="true" />
          {expanded
            ? t("items.acquisition.showLess")
            : t("items.acquisition.showAll", { count: presentations.length })}
        </button>
      )}
    </div>
  );
};

export default ItemAcquisitionSection;
