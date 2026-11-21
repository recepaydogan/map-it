import type { MapCategoryGroupId } from "./map-config";

export const MAP_FILTER_GROUP_EVENT = "gm:open-filter-group";

export const requestMapFilterGroup = (groupId: MapCategoryGroupId) => {
  window.dispatchEvent(new CustomEvent(MAP_FILTER_GROUP_EVENT, { detail: groupId }));
};
