import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useGameText } from "../../i18n/game-text";
import { useGameNames } from "../../i18n/use-game-names";
import ForeverLabel from "../../components/forever-label";
import DatabaseSectionTitle from "../database/database-section-title";
import { useReferenceNavigation } from "../reference/reference-navigation-context";
import { SPELL_CLASSES, type SpellDetail, type SpellIndexRow } from "./spell-data";
import SpellIcon from "./spell-icon";
import type { SpellWriteup } from "./spell-writeups";

const SpellWriteupPanel = ({ detail, currentDescription, oldDescription, writeup, classId, rows }: {
  detail: SpellDetail;
  currentDescription?: string;
  oldDescription?: string;
  writeup: SpellWriteup | null;
  classId: number;
  rows: SpellIndexRow[];
}) => {
  const { t } = useTranslation();
  const gameText = useGameText();
  const { specializationName } = useGameNames();
  const openReference = useReferenceNavigation();
  const changedTooltip = Boolean(detail.old && detail.old !== detail.d);
  const pairs = (writeup?.pairsWith ?? []).map((pair) => ({
    name: pair,
    spell: rows.find((row) => row[4] === classId && row[1] === pair && !row[6]),
  }));

  return <>
    {(writeup?.forever || changedTooltip) && <section aria-label={t("spells.changedInForever")}>
      <DatabaseSectionTitle className="text-zinc-200"><ForeverLabel text={t("spells.changedInForever")} /></DatabaseSectionTitle>
      {writeup?.forever && <p className="text-[13px] leading-6 text-zinc-200">{writeup.forever}</p>}
      {changedTooltip && <details className="mt-2 rounded-[var(--radius-sm)] border border-border bg-surface/50 px-3 py-2.5 text-[12px]">
        <summary className="cursor-pointer font-medium text-accent focus-visible:outline-2 focus-visible:outline-accent">{t("spells.changedFromClassic")}</summary>
        <div className="mt-3 space-y-3 border-t border-border pt-3">
          <div><p className="text-[10px] font-semibold uppercase tracking-wide text-subtle">{t("spells.classicEra")}</p><p className="mt-1 leading-5 text-zinc-300">{oldDescription ?? detail.old}</p></div>
          <div><p className="text-[10px] font-semibold uppercase tracking-wide text-accent">{t("spells.forever")}</p><p className="mt-1 leading-5 text-zinc-100">{currentDescription ?? detail.d}</p></div>
        </div>
      </details>}
    </section>}
    {!!writeup?.useWhen?.length && <section aria-label={t("spells.useWhen")}>
      <DatabaseSectionTitle>{t("spells.useWhen")}</DatabaseSectionTitle>
      <ul className="space-y-1.5">{writeup.useWhen.map((item, index) => <li key={`${item}-${index}`} className="border-l border-accent/40 py-0.5 pl-3 text-[13px] leading-5 text-zinc-200">{item}</li>)}</ul>
    </section>}
    {pairs.length > 0 && <section aria-label={t("spells.pairsWith")}>
      <DatabaseSectionTitle>{t("spells.pairsWith")}</DatabaseSectionTitle>
      <div className="flex flex-wrap gap-1.5">{pairs.map(({ name, spell }) => {
        const localizedName = gameText(name, spell ? `SpellName:${spell[0]}:0` : undefined);
        return <div key={name} className="inline-flex max-w-full rounded-[var(--radius-sm)] border border-border bg-surface/50">
        {spell ? <button type="button" onClick={() => openReference({ category: "spells", id: String(spell[0]), name: localizedName })} className="inline-flex max-w-full cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-2.5 py-1.5 text-left text-[12px] font-medium text-zinc-100 hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent"><SpellIcon id={spell[3]} name={localizedName} size={24} /><span className="min-w-0 truncate">{localizedName}</span><ChevronRight size={13} className="shrink-0 text-accent/70" aria-hidden="true" /></button>
          : <span className="px-2.5 py-1.5 text-[12px] text-zinc-300">{localizedName}</span>}
      </div>;
      })}</div>
    </section>}
    {!!writeup?.specs?.length && <section aria-label={t("spells.coreFor")}>
      <DatabaseSectionTitle>{t("spells.coreFor")}</DatabaseSectionTitle>
      <p className="text-[13px] leading-5 text-zinc-200">{writeup.specs.map((spec) =>
        specializationName(SPELL_CLASSES[classId]?.toLowerCase() ?? "", spec)).join(" · ")}</p>
    </section>}
  </>;
};

export default SpellWriteupPanel;
