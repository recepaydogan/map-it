import { useTranslation } from "react-i18next";
import DatabaseSectionTitle from "../database/database-section-title";
import EventGuideItemLink from "./event-guide-item-link";
import { useEventGuide } from "./use-event-guide";

export default function EventCandyKeyAcquisition({ itemId }: { itemId: string }) {
  const { t } = useTranslation();
  const state = useEventGuide();
  if (state.status === "loading") return <p role="status" className="text-xs text-subtle">{t("reference.loading")}</p>;
  if (state.status === "error") return <p role="alert" className="text-xs text-danger-text">{t("reference.error")}</p>;

  const key = state.data.candy.keys.find((entry) => entry.keyItemId === itemId);
  if (!key || !state.data.items[state.data.candy.fragmentItemId]) {
    return <p role="alert" className="text-xs text-danger-text">{t("reference.error")}</p>;
  }

  return <section className="space-y-2">
    <DatabaseSectionTitle>{t("database.acquisition.title")}</DatabaseSectionTitle>
    <EventGuideItemLink id={state.data.candy.fragmentItemId} guide={state.data} quantity={key.fragmentCost} compact />
  </section>;
}
