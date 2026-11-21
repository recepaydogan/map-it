import { BookOpen, MapPin } from "lucide-react";
import { useTranslation } from "react-i18next";
import DatabaseSectionTitle from "../database/database-section-title";

const DungeonSecretBossGuide = ({ onOpenMap }: {
  onOpenMap: (mapId: string, markerId: string) => void;
}) => {
  const { t } = useTranslation();
  return <section className="space-y-3" aria-label={t("reference.dalaranSecret.title")}>
    <DatabaseSectionTitle>{t("reference.dalaranSecret.title")}</DatabaseSectionTitle>
    <p className="text-xs leading-relaxed text-zinc-300">{t("reference.dalaranSecret.intro")}</p>
    <ol className="space-y-2">
      {(["shadowfang", "ambermill", "sewers"] as const).map((step, index) => <li key={step}
        className="rounded-[var(--radius-md)] border border-border bg-white/[0.025] p-3">
        <p className="flex items-center gap-2 text-xs font-semibold text-zinc-100">
          <span className="grid size-5 shrink-0 place-items-center rounded-full bg-accent-soft text-[10px] text-accent">{index + 1}</span>
          {t(`reference.dalaranSecret.${step}.title`)}
        </p>
        <p className="mt-1.5 text-[11px] leading-5 text-zinc-300">{t(`reference.dalaranSecret.${step}.body`)}</p>
        {step === "shadowfang" && <button type="button"
          onClick={() => onOpenMap("azeroth", "mapgenie-instance-949872")}
          className="mt-2 flex cursor-pointer items-center gap-1.5 text-[11px] font-medium text-accent hover:text-white"
        ><MapPin size={13} aria-hidden="true" />{t("reference.dalaranSecret.showShadowfang")}</button>}
      </li>)}
    </ol>
    <p className="flex items-start gap-2 text-[11px] leading-5 text-zinc-400">
      <BookOpen size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
      {t("reference.dalaranSecret.tomeNote")}
    </p>
  </section>;
};

export default DungeonSecretBossGuide;
