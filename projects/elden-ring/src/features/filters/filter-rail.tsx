import { useMapExperience } from "../map-experience/map-experience";
import FilterRailView from "./filter-rail-view";
import TrackingFilters from "./tracking-filters";

const FilterRail = () => {
  const {
    groups,
    categories,
    categoryById,
    categoryCounts,
    categoryArt,
    activeCategories,
    visibleMarkers,
    toggleCategory,
    setGroup,
    showOnly,
    railOpen,
    setRailOpen,
  } = useMapExperience();

  return (
    <FilterRailView
      categories={categories}
      groups={groups}
      categoryById={categoryById}
      categoryCounts={categoryCounts}
      categoryArt={categoryArt}
      activeCategories={activeCategories}
      shown={visibleMarkers.length}
      open={railOpen}
      setOpen={setRailOpen}
      toggleCategory={toggleCategory}
      setGroup={setGroup}
      showOnly={showOnly}
      beforeGroups={<TrackingFilters />}
    />
  );
};

export default FilterRail;
