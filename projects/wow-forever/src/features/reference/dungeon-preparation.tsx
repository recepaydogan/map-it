import { useTranslation } from "react-i18next";
import DatabaseSectionTitle from "../database/database-section-title";

interface Preparation {
  entrance?: string;
  requirements?: string[];
  quests?: string[];
}

const DungeonPreparation = ({ dungeonId, compact = false }: { dungeonId: string; compact?: boolean }) => {
  const { t } = useTranslation();
  const notes = t(`dungeonPreparation.entries.${dungeonId}`, { returnObjects: true, defaultValue: "" }) as Preparation | "";
  const encounterNotes = t(`dungeonPreparation.encounterNotes.${dungeonId}`, { returnObjects: true, defaultValue: "" }) as string[] | "";

  return <>
    {!compact && notes && notes.entrance && <section>
      <DatabaseSectionTitle>{t("dungeonPreparation.entrance")}</DatabaseSectionTitle>
      <p className="text-[13px] leading-5 text-zinc-300">{notes.entrance}</p>
    </section>}
    {!compact && notes && !!notes.requirements?.length && <section>
      <DatabaseSectionTitle>{t("dungeonPreparation.requirements")}</DatabaseSectionTitle>
      <ul className="list-disc space-y-1 pl-4 text-[13px] leading-5 text-zinc-300">
        {notes.requirements.map((note) => <li key={note}>{note}</li>)}
      </ul>
    </section>}
    {!compact && notes && !!notes.quests?.length && <section>
      <DatabaseSectionTitle>{t("dungeonPreparation.quests")}</DatabaseSectionTitle>
      <ul className="list-disc space-y-1 pl-4 text-[13px] leading-5 text-zinc-300">
        {notes.quests.map((note) => <li key={note}>{note}</li>)}
      </ul>
    </section>}
    {encounterNotes && encounterNotes.length > 0 && <section>
      <DatabaseSectionTitle>{t("dungeonPreparation.runNotes")}</DatabaseSectionTitle>
      <ul className="list-disc space-y-1 pl-4 text-[13px] leading-5 text-zinc-300">
        {encounterNotes.map((note) => <li key={note}>{note}</li>)}
      </ul>
    </section>}
  </>;
};

export default DungeonPreparation;
