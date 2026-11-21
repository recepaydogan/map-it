import { ArrowUpRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import EventGuideItemLink from "../events/event-guide-item-link";
import { openEventGuide } from "../events/event-mission-navigation";
import { useEventGuide } from "../events/use-event-guide";

export default function MapEventCandy({ color, entityId }: { color?: string; entityId?: string }) {
  const { t } = useTranslation();
  const state = useEventGuide();
  if (state.status === "loading") return <p role="status" className="mt-4 text-xs text-subtle">{t("reference.loading")}</p>;
  if (state.status === "error") return <p role="alert" className="mt-4 text-xs text-danger-text">{t("reference.error")}</p>;
  const location = state.data.candy.locations.find((entry) => entry.entityId === entityId);
  const key = state.data.candy.keys.find((entry) => entry.color === color)
    ?? state.data.candy.keys.find((entry) => entry.color === location?.color);
  if (!key) return <p role="alert" className="mt-4 text-xs text-danger-text">{t("reference.error")}</p>;
  if (!state.data.items[key.keyItemId]) return <p role="alert" className="mt-4 text-xs text-danger-text">{t("reference.error")}</p>;
  return <section className="mt-4 border-t border-border pt-4">
    <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-300">{t("events.guide.mapHowToOpen")}</h3>
    <EventGuideItemLink id={key.keyItemId} guide={state.data} compact />
    <div className="mt-4">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-300">{t("events.guide.candyRewards")}</p>
      <div className="grid gap-2">{key.rewards.map((reward) => <EventGuideItemLink key={reward.itemId} id={reward.itemId}
        quantity={reward.quantity} guide={state.data} compact />)}</div>
    </div>
    <button type="button" onClick={openEventGuide} className="mt-3 inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-accent underline underline-offset-4 hover:text-white focus-visible:outline-2 focus-visible:outline-accent">
      {t("events.guide.openGuide")}<ArrowUpRight size={14} aria-hidden="true" />
    </button>
  </section>;
}
