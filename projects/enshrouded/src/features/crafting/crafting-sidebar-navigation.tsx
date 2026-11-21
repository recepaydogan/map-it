import { Boxes, Hammer } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ItemCatalogCategory } from "../../components/layout/item-catalog";
import { CRAFTING_CATALOG } from "./enshrouded-crafting-catalog";

export const CRAFTING_SECTIONS = [
  { id: "stations", icon: Hammer, count: CRAFTING_CATALOG.stations.length },
  { id: "materials", icon: Boxes, count: CRAFTING_CATALOG.materials.length },
] as const;

export type CraftingSection = "all" | (typeof CRAFTING_SECTIONS)[number]["id"];

export default function CraftingSidebarNavigation({ activeSection, onSelect, children }: {
  activeSection: CraftingSection;
  onSelect: (section: CraftingSection) => void;
  children: ReactNode;
}) {
  const { t, i18n } = useTranslation();
  return <>
    <ItemCatalogCategory label={t("itemCatalog.viewAll")} active={activeSection === "all"}
      onSelect={() => onSelect("all")} />
    {CRAFTING_SECTIONS.map(({ id, count }) => <div key={id}>
      <ItemCatalogCategory label={t("craftingGuide." + id)} count={count.toLocaleString(i18n.language)}
        active={activeSection === id} onSelect={() => onSelect(id)} />
      {activeSection === id && <div className="item-catalog-subcategories">{children}</div>}
    </div>)}
  </>;
}
