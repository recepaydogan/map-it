import DatabaseSectionTitle from "../database/database-section-title";
import { useTranslation } from "react-i18next";
import AdventureLinkList from "./adventure-link-list";
import type { ReferenceLink } from "./reference-types";

export default function FirstKillTitles({ titles }: { titles: ReferenceLink[] }) {
  const { t } = useTranslation();
  if (!titles.length) return null;
  return <section className="space-y-2">
    <DatabaseSectionTitle>{t("reference.loot.firstKillTitle")}</DatabaseSectionTitle>
    <p className="text-[11px] text-subtle">{t("reference.loot.firstKillTitleHint")}</p>
    <AdventureLinkList links={titles} />
  </section>;
}
