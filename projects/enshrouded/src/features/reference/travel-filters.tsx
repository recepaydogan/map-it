import { useTranslation } from "react-i18next";
import CategoryDropdown from "../../components/category-dropdown";
import type { ReferenceSummary } from "./reference-types";
import { travelValueKey, type TravelFilterValue } from "./travel-presentation";

const TravelFilters = ({ entries, value, onChange }: {
  entries: ReferenceSummary[]; value: TravelFilterValue; onChange: (value: TravelFilterValue) => void;
}) => {
  const { t } = useTranslation();
  const regions = [...new Set(entries.flatMap((entry) => entry.travel?.regions ?? []))].sort();
  const factions = [...new Set(entries.map((entry) => entry.travel?.faction ?? "unknown"))].sort();
  return <>
    <CategoryDropdown ariaLabel={t("reference.travel.region")} value={value.region} onChange={(region) => onChange({ ...value, region })}
      options={[{ key: "", label: t("reference.travel.allRegions") }, ...regions.map((region) => ({ key: region, label: region }))]} />
    <CategoryDropdown ariaLabel={t("reference.labels.faction")} value={value.faction} onChange={(faction) => onChange({ ...value, faction })}
      options={[{ key: "", label: t("reference.travel.allFactions") }, ...factions.map((faction) => ({ key: faction, label: t(travelValueKey(faction) ?? faction) }))]} />
  </>;
};

export default TravelFilters;
