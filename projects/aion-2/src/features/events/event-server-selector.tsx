import { useTranslation } from "react-i18next";
import { EVENT_SERVER_REGIONS, type EventServerRegion } from "../../game-config";
import CategoryDropdown from "../../components/category-dropdown";

export default function EventServerSelector({ value, onChange }: {
  value: EventServerRegion | null;
  onChange: (region: EventServerRegion | null) => void;
}) {
  const { t } = useTranslation();
  return <CategoryDropdown ariaLabel={t("events.gameRegion")} value={value ?? "eu"}
    onChange={(key) => onChange(key as EventServerRegion)}
    options={EVENT_SERVER_REGIONS.map((region) => ({ key: region.key, label: t(region.labelKey) }))} />;
}
