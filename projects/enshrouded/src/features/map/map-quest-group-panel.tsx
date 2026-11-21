import { ChevronRight, Flag } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getCategoryConfig } from "./map-config";
import { getMapPointDisplayName } from "./map-point-display-name";
import MapPointIcon from "./map-point-icon";
import MapSidebarToolPanel from "./map-sidebar-tool-panel";
import type { MapQuestGroup } from "./map-marker-overlap";
import type { MapPoint } from "./types";

const MapQuestGroupPanel = ({ group, onSelect, onClose }: {
  group: MapQuestGroup;
  onSelect: (point: MapPoint) => void;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const members = [...group.members].sort((left, right) =>
    getMapPointDisplayName(left).localeCompare(getMapPointDisplayName(right))
    || left.id.localeCompare(right.id));

  return <MapSidebarToolPanel
    title={t("map.questGroup.title")}
    description={t("map.questGroup.description", { count: members.length })}
    icon={Flag}
    onClose={onClose}
    selectionPanel
    contentClassName="space-y-1"
  >
    {members.map((point) => {
      const category = getCategoryConfig(point.category);
      return <button key={point.id} type="button" onClick={() => onSelect(point)}
        className="flex w-full cursor-pointer items-center gap-2 rounded-[var(--radius-md)] px-2 py-2.5 text-left text-zinc-200 transition-colors hover:bg-white/8 hover:text-white focus-visible:outline-2 focus-visible:outline-accent">
        <MapPointIcon fallback={category.icon} source={category.nativeIconPath}
          size={22} className="shrink-0 self-center" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium">{getMapPointDisplayName(point)}</span>
          <span className="block text-[11px] text-subtle">{t(point.category === "repeatable-quest"
            ? "map.categories.repeatableQuest"
            : point.category === "dungeon-quest" ? "map.categories.dungeonQuest"
              : "map.categories.quest")}</span>
        </span>
        <ChevronRight size={14} className="shrink-0 text-subtle" aria-hidden="true" />
      </button>;
    })}
  </MapSidebarToolPanel>;
};

export default MapQuestGroupPanel;
