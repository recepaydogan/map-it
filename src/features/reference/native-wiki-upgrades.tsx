import { useState } from "react";
import { useTranslation } from "react-i18next";
import CategoryDropdown from "../../components/category-dropdown";
import DatabaseSectionTitle from "../database/database-section-title";
import { nativeFieldLabel } from "./native-wiki-labels";
import NativeWikiValues from "./native-wiki-values";
import type { NativeWikiEntry } from "./use-native-wiki";

type UpgradeSection = NativeWikiEntry["sections"][number];
const UpgradeResult = ({ section }: { section: UpgradeSection }) => {
  const { t } = useTranslation();
  const [selectedStep, setSelectedStep] = useState("0");
  // Native arrays are ordered upgrade steps. Do not infer a base equipment level.
  const steps = Array.isArray(section.value) ? section.value : [section.value];
  const current = steps[Number(selectedStep)] ?? steps[0];
  return <>
    {Array.isArray(section.value) && <div className="min-w-0">
      <DatabaseSectionTitle>{t("database.upgradePanel.level")}</DatabaseSectionTitle>
      <CategoryDropdown value={selectedStep} onChange={setSelectedStep}
        ariaLabel={t("database.upgradePanel.level")}
        options={steps.map((_, index) => ({ key: String(index), label: t("wiki.upgradeStep", { step: index + 1 }) }))}
        triggerClassName="py-2.5 pr-4" />
    </div>}
    <div className="native-wiki-upgrade-result col-span-full rounded-[var(--radius-md)] border border-border p-4" aria-live="polite">
      <NativeWikiValues value={current} field={section.label} />
    </div>
  </>;
};

const NativeWikiUpgrades = ({ sections }: { sections: UpgradeSection[] }) => {
  const { t } = useTranslation();
  const [selectedType, setSelectedType] = useState("");
  const current = sections.find(section => section.label === selectedType) ?? sections[0];
  if (!current) return null;
  return <section className="native-wiki-upgrades grid max-w-[900px] grid-cols-1 items-start gap-4 sm:grid-cols-2">
    <div className="min-w-0">
      <DatabaseSectionTitle>{t("database.upgradePanel.operation")}</DatabaseSectionTitle>
      <CategoryDropdown value={current.label} onChange={setSelectedType}
        ariaLabel={t("database.upgradePanel.operation")}
        options={sections.map(section => ({ key: section.label, label: nativeFieldLabel(section.label) }))}
        triggerClassName="py-2.5 pr-4" />
    </div>
    <UpgradeResult key={current.label} section={current} />
  </section>;
};
export default NativeWikiUpgrades;
