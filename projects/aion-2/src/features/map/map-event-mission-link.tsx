import { ArrowRight, ScrollText } from "lucide-react";
import { useTranslation } from "react-i18next";
import { openEventMissions } from "../events/event-mission-navigation";
import { useEventMissions } from "../events/use-event-missions";

export default function MapEventMissionLink({ npcId }: { npcId?: string }) {
  const { t } = useTranslation();
  const catalog = useEventMissions();
  if (catalog.status !== "ready" || !npcId || !catalog.data.merchantLocations.some((location) => location.npcId === npcId)) return null;
  return <button type="button" onClick={openEventMissions} className="mt-4 flex w-full cursor-pointer items-center gap-3 rounded-[var(--radius-md)] border border-accent/35 bg-accent-soft px-3 py-3 text-left hover:border-accent/70 focus-visible:outline-2 focus-visible:outline-accent">
    <ScrollText size={18} className="shrink-0 text-accent" aria-hidden="true" />
    <span className="min-w-0 flex-1"><span className="block text-[12px] font-semibold text-white">{t("events.missions.npcLink")}</span><span className="mt-0.5 block text-[11px] text-zinc-200">{t("events.missions.npcLinkHint")}</span></span>
    <ArrowRight size={15} className="shrink-0 text-accent" aria-hidden="true" />
  </button>;
}
