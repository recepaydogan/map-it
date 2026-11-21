import { useTranslation } from "react-i18next";
import CategoryDropdown from "../../components/category-dropdown";
import { DEFAULT_LANDMARK_FILTERS, setLandmarkFilters, useLandmarkFilters, type LandmarkFilters } from "./map-landmark-filters";
const fields: { key: keyof LandmarkFilters; options: string[] }[] = [
  { key: "name", options: ["all", "confirmed", "unconfirmed", "unknown"] },
  { key: "position", options: ["all", "confirmed", "unconfirmed", "unknown"] },
  { key: "gamePhoto", options: ["all", "with", "without"] },
];
export default function MapLandmarkFilterPanel() {
  const { t } = useTranslation();
  const filters = useLandmarkFilters();
  const active = Object.values(filters).filter(value => value !== "all").length;
  return <details className="mt-3 rounded-lg border border-white/10 bg-transparent" open={active > 0 || undefined}>
    <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-zinc-200">{t("map.landmarks.filters.title")}{active > 0 ? ` (${active})` : ""}</summary>
    <div className="grid grid-cols-2 gap-2 px-3 pb-3">
      {fields.map(({ key, options }) => <div key={key} className="min-w-0 text-[11px] text-zinc-400">
        <p className="mb-1">{t(`map.landmarks.filters.${key}`)}</p>
        <CategoryDropdown value={filters[key]} onChange={value => setLandmarkFilters({ ...filters, [key]: value })}
          ariaLabel={t(`map.landmarks.filters.${key}`)} triggerClassName="px-2 py-1.5 text-xs"
          options={options.map(value => ({ key: value, label: t(`map.landmarks.filterOptions.${value}`) }))} />
      </div>)}
      {active > 0 && <button type="button" onClick={() => setLandmarkFilters({ ...DEFAULT_LANDMARK_FILTERS })}
        className="map-secondary-button col-span-2 mt-1 justify-center">{t("map.landmarks.filters.reset")}</button>}
    </div>
  </details>;
}
