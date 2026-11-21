import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { MapPin } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getPortalRoot } from "../../lib/portal";
import { getMapDefinition, hasMapDefinition } from "../map/map-registry";
import type { EventMapTarget, EventMapChoice } from "./event-schedule";

const buttonClass = "flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-[var(--radius-sm)] px-2 text-[11px] font-medium text-accent hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent";

export default function EventMapAction({ target, entrances, onShowMap }: {
  target?: EventMapTarget;
  entrances?: EventMapChoice[];
  onShowMap: (target: EventMapTarget) => void;
}) {
  const { t } = useTranslation();
  const availableEntrances = entrances?.filter((candidate) => hasMapDefinition(candidate.mapId)) ?? [];
  const singleTarget = availableEntrances[0] ?? (target && hasMapDefinition(target.mapId) ? target : undefined);
  if (!singleTarget) return null;
  if (availableEntrances.length <= 1) return <button type="button" onClick={() => onShowMap(singleTarget)} className={buttonClass}>
    <MapPin size={14} aria-hidden="true" />{t("events.showOnMap")}
  </button>;

  const choiceCounts = new Map<string, number>();
  for (const entrance of availableEntrances) {
    const key = entrance.faction ?? entrance.mapId;
    choiceCounts.set(key, (choiceCounts.get(key) ?? 0) + 1);
  }
  const choiceIndexes = new Map<string, number>();
  return <DropdownMenu.Root modal={false}>
    <DropdownMenu.Trigger className={buttonClass}><MapPin size={14} aria-hidden="true" />{t("events.showOnMap")}</DropdownMenu.Trigger>
    <DropdownMenu.Portal container={getPortalRoot()}>
      <DropdownMenu.Content align="end" sideOffset={6} collisionBoundary={getPortalRoot()} collisionPadding={8}
        className="pointer-events-auto z-[1600] max-h-[min(320px,45vh,var(--radix-dropdown-menu-content-available-height))] w-64 max-w-[var(--radix-dropdown-menu-content-available-width)] overflow-y-auto rounded-[var(--radius-md)] border border-border bg-surface p-1 shadow-xl shadow-black/50 animate-fade-in">
        {availableEntrances.map((entrance) => {
          const key = entrance.faction ?? entrance.mapId;
          const number = (choiceIndexes.get(key) ?? 0) + 1;
          choiceIndexes.set(key, number);
          const location = entrance.faction
            ? t(`reference.activity.factions.${entrance.faction}`)
            : getMapDefinition(entrance.mapId).name;
          const label = choiceCounts.get(key)! > 1
            ? t(entrance.faction ? "events.entranceOption" : "events.locationOption", { faction: location, map: location, number }) : location;
          return <DropdownMenu.Item key={`${entrance.mapId}:${entrance.markerId}`} onSelect={() => onShowMap(entrance)}
            className="flex cursor-pointer items-start gap-2 rounded-[var(--radius-sm)] px-2.5 py-2 text-left outline-none data-[highlighted]:bg-surface-hover">
            <MapPin size={14} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
            <span className="min-w-0"><span className="block text-xs font-medium text-zinc-100">{label}</span>{entrance.name && <span className="block truncate text-[11px] text-subtle">{entrance.name}</span>}</span>
          </DropdownMenu.Item>;
        })}
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  </DropdownMenu.Root>;
}
