import { ArrowUpRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import DatabaseSectionTitle from "../database/database-section-title";
import { ReferenceLinks } from "../reference/reference-sections";
import { requestMapReferenceInMain } from "../map/map-window-bridge";
import { GUIDE_NAVIGATION_ZOOM } from "../map/map-focus-request";
import { ReferenceLocationContext } from "../reference/reference-location-context";
import { openReference } from "../reference/reference-navigation";
import { useIntelligenceData } from "../reference/use-reference-data";
import type { ReferenceLink } from "../reference/reference-types";
import type { CompanionData } from "./intelligence-types";
import { useGameText } from "../../i18n/game-text";
import { useContext } from "react";

export default function CompanionSources({ id, unlockItems = [] }: {
  id: string;
  unlockItems?: ReferenceLink[];
}) {
  const { t } = useTranslation();
  const gameText = useGameText();
  const currentMarker = useContext(ReferenceLocationContext);
  const state = useIntelligenceData<CompanionData>("companions");
  const record = state.status === "ready" ? state.data.entries[id] : undefined;
  const sources = [...new Map(record?.sources.map((source) => [source.npc.id, source]) ?? []).values()];
  if (state.status !== "ready") return <p className="text-xs text-subtle" role={state.status === "error" ? "alert" : "status"}>{t(state.status === "error" ? "reference.error" : "reference.loading")}</p>;
  if (!record && !unlockItems.length) return null;
  return <section className="space-y-4">
    <DatabaseSectionTitle>{t("pets.obtain.title")}</DatabaseSectionTitle>
    {record ? <>
      <div className="w-full max-w-[360px]">
        <ReferenceLinks links={[{ ...record.soul, quantity: record.required }]} />
      </div>
      {sources.length > 0 && <div className="space-y-2">
        <h4 className="text-[12px] font-medium text-zinc-300">{t("pets.obtain.droppedBy")}</h4>
        <div className="grid gap-1.5 sm:grid-cols-2">{sources.map(({ npc, points }) => <button key={npc.id} type="button" onClick={() => points[0]
          ? requestMapReferenceInMain(npc.id, gameText(npc.name), points[0].mapId,
            undefined, undefined, undefined, currentMarker ? undefined : GUIDE_NAVIGATION_ZOOM)
          : openReference(npc)}
          className="flex cursor-pointer items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-border bg-white/[0.025] px-3 py-2 text-left text-[12px] text-zinc-100 transition-colors hover:border-accent/50 hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent">
          <span>{gameText(npc.name)}</span>
          <ArrowUpRight size={14} className="shrink-0 text-accent" aria-hidden="true" />
        </button>)}</div>
      </div>}
      {sources.length === 0 && <p className="text-[12px] leading-relaxed text-subtle">{t("pets.obtain.unknownSoulSource")}</p>}
      <p className="text-[13px] leading-relaxed text-zinc-300">{t("pets.obtain.afterSouls", { count: record.required })}</p>
    </> : <>
      <p className="text-[13px] leading-relaxed text-zinc-300">{t("pets.obtain.itemSources")}</p>
      <ReferenceLinks links={unlockItems} />
    </>}
  </section>;
}
