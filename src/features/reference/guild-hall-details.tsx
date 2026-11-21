import { useTranslation } from "react-i18next";
import DatabaseSectionTitle from "../database/database-section-title";
import type { ReferenceEntry } from "./reference-types";

const GuildHallDetails = ({ details }: { details: NonNullable<ReferenceEntry["guildHall"]> }) => {
  const { t, i18n } = useTranslation();
  return <section>
    <DatabaseSectionTitle>{t("reference.guildHall.rental")}</DatabaseSectionTitle>
    <dl className="grid grid-cols-2 overflow-hidden rounded-[var(--radius-sm)] border border-border bg-black/10">
      <div className="min-w-0 border-r border-border px-3 py-2">
        <dt className="text-[10px] leading-4 text-subtle">{t("reference.guildHall.cost")}</dt>
        <dd className="mt-1 whitespace-nowrap text-[13px] font-semibold leading-4 tabular-nums text-zinc-100">{details.rentalCost.toLocaleString(i18n.language)} {t("reference.guildHall.currency")}</dd>
      </div>
      <div className="min-w-0 px-3 py-2">
        <dt className="text-[10px] leading-4 text-subtle">{t("reference.guildHall.duration")}</dt>
        <dd className="mt-1 text-[13px] font-semibold leading-4 tabular-nums text-zinc-100">{t("reference.guildHall.days", { count: details.rentalDays })}</dd>
      </div>
      <div className="col-span-2 border-t border-border px-3 py-2">
        <dt className="text-[10px] leading-4 text-subtle">{t("reference.guildHall.legionLevel")}</dt>
        <dd className="mt-1 text-[13px] font-semibold leading-4 text-zinc-100">{t("reference.guildHall.levelValue", { level: details.legionLevel })}</dd>
      </div>
    </dl>
    <p className="mt-3 text-xs leading-relaxed text-subtle">{t("reference.guildHall.extension", { count: details.extensionWindowDays })}</p>
    <p className="mt-1.5 text-xs leading-relaxed text-subtle">{t("reference.guildHall.access")}</p>
  </section>;
};

export default GuildHallDetails;
