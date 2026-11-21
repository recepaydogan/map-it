import { useState } from "react";
import { useTranslation } from "react-i18next";
import CategoryDropdown from "../../components/category-dropdown";
import DatabaseSectionTitle from "../database/database-section-title";
import AdventureLinkList from "../reference/adventure-link-list";
import type { ReferenceSection } from "../reference/reference-types";

const MapEventEntranceRewards = ({ sections }: { sections: ReferenceSection[] }) => {
  const { t } = useTranslation();
  const ranges = sections.flatMap((section) => section.rows ?? []).filter((row) => row.links?.length);
  const [selectedRange, setSelectedRange] = useState(ranges[0]?.name ?? "");
  const selected = ranges.find((row) => row.name === selectedRange) ?? ranges[0];
  const links = [...sections.flatMap((section) => section.links ?? []), ...(selected?.links ?? [])];

  if (!links.length) return null;

  return <section className="space-y-3">
    <DatabaseSectionTitle>{t("reference.labels.possible-rewards")}</DatabaseSectionTitle>
    {ranges.length > 1 && <div className="w-48 max-w-full">
      <CategoryDropdown ariaLabel={t("reference.activity.rewardLevel")} value={selected?.name ?? ""}
        onChange={setSelectedRange} options={ranges.map((row) => ({ key: row.name, label: row.name }))} />
    </div>}
    <AdventureLinkList links={links} showRates />
  </section>;
};

export default MapEventEntranceRewards;
