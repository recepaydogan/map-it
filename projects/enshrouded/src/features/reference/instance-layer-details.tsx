import { useTranslation } from "react-i18next";
import DatabaseSectionTitle from "../database/database-section-title";
import AdventureLinkList from "./adventure-link-list";
import type { ReferenceEntry } from "./reference-types";

const InstanceLayerDetails = ({ details }: { details: NonNullable<ReferenceEntry["instanceLayer"]> }) => {
  const { t } = useTranslation();
  if (!details.questAccess.length) return null;
  return <section className="space-y-3">
    <DatabaseSectionTitle count={details.questAccess.length}>{t("reference.instanceLayer.questAccess")}</DatabaseSectionTitle>
    <AdventureLinkList links={details.questAccess} />
  </section>;
};

export default InstanceLayerDetails;
