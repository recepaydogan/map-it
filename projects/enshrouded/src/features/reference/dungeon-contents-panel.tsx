import { useTranslation } from "react-i18next";
import ProgressiveList from "../../components/progressive-list";
import DatabaseSectionTitle from "../database/database-section-title";
import DungeonCreatureList from "./dungeon-creature-list";
import { ReferenceLinks } from "./reference-sections";
import type { DungeonObject, ReferenceEntry } from "./reference-types";

const DungeonResourceList = ({ objects }: { objects: DungeonObject[] }) => {
  const { t, i18n } = useTranslation();
  if (!objects.length) return null;
  return <section className="space-y-3">
    <DatabaseSectionTitle count={objects.length}>{t("reference.adventure.contentKinds.resources")}</DatabaseSectionTitle>
    <ProgressiveList initialCount={8} className="space-y-3">{objects.map((object) => <div key={object.id}
      className="space-y-2 border-l border-accent/25 py-1 pl-3">
      <h4 className="text-[12px] font-medium text-accent">{object.name}</h4>
      {object.purposes?.map((purpose, index) => <p key={`${object.id}-${index}`} className="text-xs leading-relaxed text-zinc-400">
        {purpose.key ? t(purpose.key) : purpose.text}
      </p>)}
      {object.requiredMastery !== undefined && <p className="text-xs leading-relaxed text-subtle">
        {t("reference.adventure.resourceMastery", { level: object.requiredMastery.toLocaleString(i18n.language) })}
      </p>}
      {!!object.items?.length && <ReferenceLinks links={object.items} />}
    </div>)}</ProgressiveList>
  </section>;
};

const DungeonContentsPanel = ({ contents, dungeonId }: { contents?: ReferenceEntry["dungeonContents"]; dungeonId: string }) => {
  const { t } = useTranslation();
  if (!contents) return null;
  const hasContents = contents.enemies.length > 0 || contents.characters.length > 0 || contents.resources.length > 0;
  if (!hasContents) return null;
  return <div className="space-y-6">
    {(["enemies", "characters"] as const).map((kind) => contents[kind].length > 0 && <section key={kind}>
      <DatabaseSectionTitle>{t(`reference.adventure.contentKinds.${kind}`)}</DatabaseSectionTitle>
      <DungeonCreatureList links={contents[kind]} dungeonId={dungeonId} />
    </section>)}
    <DungeonResourceList objects={contents.resources} />
  </div>;
};
export default DungeonContentsPanel;
