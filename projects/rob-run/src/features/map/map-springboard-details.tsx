import { MoveUp, Wind } from "lucide-react";
import { useTranslation } from "react-i18next";
import DatabaseSectionTitle from "../database/database-section-title";
import type { MapLocation } from "./types";

const MapSpringboardDetails = ({ effects }: { effects?: MapLocation["springboard"] }) => {
  const { t } = useTranslation();
  const launch = effects?.launch !== false;
  const glideLift = effects?.glideLift !== false;
  if (!launch && !glideLift) return null;

  return <section className="mt-4 border-t border-border pt-4">
    <DatabaseSectionTitle>{t("map.springboard.movement")}</DatabaseSectionTitle>
    <ul className="divide-y divide-border/60 rounded-[var(--radius-md)] border border-border bg-surface px-3">
      {launch && <li className="flex items-start gap-2.5 py-3 text-[12px] leading-5 text-zinc-200">
        <MoveUp size={15} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
        <span>{t("map.springboard.launch")}</span>
      </li>}
      {glideLift && <li className="flex items-start gap-2.5 py-3 text-[12px] leading-5 text-zinc-200">
        <Wind size={15} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
        <span>{t("map.springboard.glideLift")}</span>
      </li>}
    </ul>
  </section>;
};

export default MapSpringboardDetails;
