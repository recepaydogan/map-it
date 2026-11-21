import { useGameText } from "../../i18n/game-text";
import { useTranslation } from "react-i18next";
import bestiaryCatalog from "../../../public/data/enshrouded/bestiary-catalog.json";
import type { EnshroudedEntryTarget } from "./enshrouded-entry-data";
import EnshroudedLootRows from "./enshrouded-loot-rows";

type BestiaryEntry = {
  name: string;
  role: "enemy" | "boss";
  wikiArticle: string;
  faction: string;
  behavior: string | null;
  resistances: { damageType: string; effectiveness: string }[];
  sections: { title: string; text: string; items: string[] }[];
  drops: { name: string; quantity: string | null; type: string | null; source: string | null }[];
};

const entries = new Map((bestiaryCatalog.records as BestiaryEntry[])
  .map((entry) => [entry.wikiArticle, entry]));
const hiddenEnemySections = new Set(["Attacks", "General Drops", "Weapon Drops"]);
const sectionSummaryKeys: Record<string, string> = {
  "Fell Monstrosity:Abilities": "map.enshrouded.bestiary.abilitySummaries.fellMonstrosity",
  "Fell Wispwyvern:Abilities": "map.enshrouded.bestiary.abilitySummaries.fellWispwyvern",
  "Fell Dragon Youngling:Abilities": "map.enshrouded.bestiary.abilitySummaries.fellDragonYoungling",
  "Hollow Cyclops:Abilities": "map.enshrouded.bestiary.abilitySummaries.hollowCyclops",
  "Exploding Fell Critter:Combat": "map.enshrouded.bestiary.sectionSummaries.explodingFellCritterCombat",
  "Exploding Fell Critter:Tips": "map.enshrouded.bestiary.sectionSummaries.explodingFellCritterTips",
  "Shroud Gazer:Tips": "map.enshrouded.bestiary.sectionSummaries.shroudGazerTips",
  "Shroud Depthdweller:Tips": "map.enshrouded.bestiary.sectionSummaries.shroudDepthdwellerTips",
  "Drak Priest:Tips": "map.enshrouded.bestiary.sectionSummaries.drakPriestTips",
  "Drak Chieftan:Tips": "map.enshrouded.bestiary.sectionSummaries.drakChieftanTips",
};

export default function EnshroudedBestiaryMarkerContent({ article, onOpenEntry }: {
  article: string;
  onOpenEntry: (target: EnshroudedEntryTarget) => void;
}) {
  const contentText = useGameText();
  const { t } = useTranslation();
  const entry = entries.get(article);
  if (!entry) return null;

  return <div className="mt-4 space-y-4 text-xs text-zinc-300">
    <dl className="overflow-hidden rounded-md border border-border/60">
      {contentText(entry.behavior && <div className="grid grid-cols-[6rem_minmax(0,1fr)] border-b border-border/60">
        <dt className="bg-white/[0.04] px-2.5 py-2 font-medium text-zinc-400">{t("map.enshrouded.bestiary.behavior")}</dt>
        <dd className="px-2.5 py-2 text-zinc-100">{contentText(entry.behavior)}</dd>
      </div>)}
      <div className="grid grid-cols-[6rem_minmax(0,1fr)]">
        <dt className="bg-white/[0.04] px-2.5 py-2 font-medium text-zinc-400">{t("map.enshrouded.bestiary.faction")}</dt>
        <dd className="px-2.5 py-2 text-zinc-100">{contentText(entry.faction)}</dd>
      </div>
    </dl>
    {entry.resistances.length > 0 && <section>
      <h3 className="map-micro-label">{t("map.enshrouded.bestiary.damageEffectiveness")}</h3>
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
        {entry.resistances.map((stat) => <div key={stat.damageType} className="flex justify-between gap-2">
          <span className="text-zinc-400">{contentText(stat.damageType)}</span>
          <span className="text-zinc-200">{contentText(stat.effectiveness)}</span>
        </div>)}
      </div>
    </section>}

    {entry.sections.filter((section) => section.title !== "Spawning"
      && (entry.role !== "enemy" || !hiddenEnemySections.has(section.title)))
      .map((section) => {
        const summaryKey = sectionSummaryKeys[`${entry.wikiArticle}:${section.title}`];
        return <section key={section.title} className="border-t border-border/60 pt-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">{contentText(section.title)}</h3>
          {contentText(section.text && <p className="mt-1 leading-relaxed">{summaryKey ? t(summaryKey) : contentText(section.text)}</p>)}
          {!summaryKey && section.items.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-4 leading-relaxed">
            {section.items.map((item, index) => <li key={`${index}-${item}`}>{contentText(item)}</li>)}
          </ul>}
        </section>;
      })}

    {entry.drops.length > 0 && <section className="border-t border-border/60 pt-3">
      <h3 className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-400">
        <span className="h-px w-3 bg-accent/60" aria-hidden="true" />
        {t("map.enshrouded.bestiary.drops")}
        <span className="font-normal tabular-nums tracking-normal text-zinc-500">{entry.drops.length}</span>
      </h3>
      <EnshroudedLootRows rows={entry.drops} onOpenEntry={onOpenEntry} />
    </section>}

  </div>;
}
