import { MapPin, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import CategoryDropdown from "../../components/category-dropdown";
import type { ProfessionTrainer } from "./use-profession-details";
import { trainerMapMarkers } from "./trainer-map-markers";

const markerIdFor = (trainer: ProfessionTrainer) => trainer.markerId
  ?? (trainer.npc ? trainerMapMarkers[trainer.npc] : undefined);

const ProfessionTrainersPanel = ({ trainers, onOpenMap }: {
  trainers: ProfessionTrainer[];
  onOpenMap: (mapId: string, markerId: string) => void;
}) => {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [faction, setFaction] = useState("");
  const visible = useMemo(() => trainers.filter((trainer) =>
    (!faction || !trainer.side || trainer.side === faction)
    && (!query || `${trainer.n} ${trainer.sub ?? ""} ${trainer.zone ?? ""}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  ).sort((a, b) => Number(Boolean(markerIdFor(b))) - Number(Boolean(markerIdFor(a)))
    || (a.zone ?? "").localeCompare(b.zone ?? "") || a.n.localeCompare(b.n)), [trainers, query, faction]);

  return <div className="space-y-4">
    <div><h3 className="font-display text-lg font-semibold text-white">{t("professions.trainers.title")}</h3>
      <p className="mt-1 text-[12px] leading-5 text-subtle">{t("professions.trainers.sourceNote")}</p></div>
    <div className="flex flex-wrap gap-2">
      <label className="flex h-10 min-w-[190px] flex-1 items-center gap-2 rounded-[var(--radius-md)] border border-border px-3 focus-within:border-accent"><Search size={15} className="text-subtle" aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("professions.trainers.search")} aria-label={t("professions.trainers.search")} className="min-w-0 flex-1 bg-transparent text-[12px] text-white outline-none placeholder:text-muted" /></label>
      <div className="w-[145px] shrink-0"><CategoryDropdown value={faction} onChange={setFaction} ariaLabel={t("professions.trainers.faction")} triggerClassName="h-10 bg-transparent text-[12px] hover:bg-transparent" options={[{ key: "", label: t("professions.trainers.allFactions") }, { key: "Alliance", label: "Alliance" }, { key: "Horde", label: "Horde" }]} /></div>
    </div>
    <p className="text-[11px] text-subtle">{t("professions.trainers.count", { count: visible.length })}</p>
    <div className="grid gap-2 @min-[650px]:grid-cols-2">{visible.map((trainer) => {
      const markerId = markerIdFor(trainer);
      return <div key={trainer.npc ?? markerId} className="rounded-[var(--radius-md)] border border-border p-3">
        <div className="flex items-start justify-between gap-2"><div className="min-w-0"><h4 className="text-[13px] font-semibold text-white">{trainer.n}</h4><p className="mt-0.5 text-[11px] text-subtle">{trainer.sub}</p></div>
          {markerId ? <button type="button" onClick={() => onOpenMap("azeroth", markerId)} className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-[var(--radius-sm)] border border-accent/25 px-2 py-1 text-[10px] font-medium text-accent hover:border-accent/50 hover:text-white focus-visible:outline-2 focus-visible:outline-accent"><MapPin size={12} aria-hidden="true" />{t("professions.trainers.showOnMap")}</button>
            : !trainer.fv && <span className="shrink-0 rounded-[var(--radius-sm)] border border-border px-1.5 py-0.5 text-[10px] font-medium text-subtle">{t("professions.trainers.classicReference")}</span>}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-2 text-[11px] text-zinc-300"><span>{trainer.zone || t(markerId ? "professions.trainers.mapLocation" : "professions.trainers.unknownZone")}{trainer.x !== undefined && trainer.y !== undefined ? ` · ${trainer.x.toFixed(1)}, ${trainer.y.toFixed(1)}` : ""}</span>{trainer.side && <span>{trainer.side}</span>}</div>
      </div>;
    })}</div>
    {!visible.length && <p className="py-6 text-center text-[12px] text-subtle">{t("professions.noMatches")}</p>}
  </div>;
};

export default ProfessionTrainersPanel;
