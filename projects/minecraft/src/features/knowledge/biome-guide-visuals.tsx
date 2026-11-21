import { ChevronRight } from "lucide-react";
import type { TFunction } from "i18next";
import InspectorSubjectIcon from "../inspector/inspector-subject-icon.tsx";
import type { InspectorSubject } from "../inspector/inspector-controller.ts";
import type { KnowledgeSubjectRef } from "./mechanics-types.ts";
import type { KnowledgeSubjectDisplay } from "./mechanics-inspector-content.ts";
import type { BiomeGuideEntry } from "./biome-guide-data.ts";
import { useGuideNavigation } from "./guide-navigation-context.ts";
import GuideItemLink from "./guide-item-link.tsx";
import { GAME_GUIDE_BIOME_OMIT_MATERIALS, GAME_GUIDE_ENTITY_OVERVIEWS } from "../../game-config.ts";

export const BiomeClimate = ({ biome, availableItems, display, t }: { biome: BiomeGuideEntry;
  availableItems: ReadonlySet<string>; display: KnowledgeSubjectDisplay; t: TFunction }) => {
  const blocks = [biome.topMaterial, biome.seaMaterial].filter((id): id is string =>
    Boolean(id && !GAME_GUIDE_BIOME_OMIT_MATERIALS.has(id)
      && (!availableItems.size || availableItems.has(id))));
  const uniqueBlocks = [...new Set(blocks)];
  return <div className="max-w-[760px] border-y border-border/70">
    <dl className="grid grid-cols-3 divide-x divide-border/70 py-4">
      {([{ label: t("inspector.biomeGuide.dimension"), value: t(`biomeMap.${biome.dimension}`) },
        { label: t("inspector.biomeGuide.temperature"), value: String(biome.temperature) },
        { label: t("inspector.biomeGuide.downfall"), value: String(biome.downfall) }] as const).map(stat =>
        <div key={stat.label} className="min-w-0 px-4 first:pl-0">
          <dt className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">{stat.label}</dt>
          <dd className="mt-1 text-[16px] font-semibold tabular-nums text-zinc-100">{stat.value}</dd>
        </div>)}
    </dl>
    <p className="border-t border-border/70 py-3 text-[11px] leading-5 text-subtle">
      {t("inspector.biomeGuide.climateNote")}
      {biome.precipitation !== undefined && ` ${t(biome.precipitation
        ? "inspector.biomeGuide.hasPrecipitation" : "inspector.biomeGuide.noPrecipitation")}`}
    </p>
    {uniqueBlocks.length > 0 && <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border/70 py-3">
      <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
        {t("inspector.biomeGuide.terrainMaterials")}</span>
      {uniqueBlocks.map(id => <GuideItemLink key={id} id={id} display={display} />)}
    </div>}
  </div>;
};

export const BiomeSubjectLinks = ({ subjects, display }: { subjects: readonly InspectorSubject[];
  display: KnowledgeSubjectDisplay }) => {
  const navigate = useGuideNavigation();
  return <div className="grid grid-cols-2 gap-x-5">
    {subjects.map(subject => {
      const item = display(subject.kind, subject.id);
      return <button key={`${subject.kind}:${subject.id}`} type="button" onClick={() => navigate(subject)}
        className="group flex min-w-0 cursor-pointer items-center gap-2 border-b border-border/70 py-2 text-left text-[12px] font-medium text-zinc-100 hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
        <span className="shrink-0"><InspectorSubjectIcon image={item.image} size={26} /></span>
        <span className="min-w-0 flex-1 break-words group-hover:underline">{item.name}</span>
        <ChevronRight size={13} className="shrink-0 text-accent/75" aria-hidden="true" />
      </button>;
    })}
  </div>;
};

export const BiomeSpawnGroups = ({ spawns, display, t }: { spawns: readonly KnowledgeSubjectRef[];
  display: KnowledgeSubjectDisplay; t: TFunction }) => {
  const navigate = useGuideNavigation();
  const groups = new Map<"hostile" | "neutral" | "passive", KnowledgeSubjectRef[]>();
  for (const spawn of spawns) {
    const category = spawn.spawn?.category;
    if (!category) continue;
    const behavior = GAME_GUIDE_ENTITY_OVERVIEWS[spawn.id] ?? (category === "monster" ? "hostile" : "passive");
    const group = groups.get(behavior) ?? [];
    group.push(spawn);
    groups.set(behavior, group);
  }
  const ordered = (["hostile", "neutral", "passive"] as const)
    .flatMap(behavior => groups.has(behavior) ? [[behavior, groups.get(behavior)!] as const] : []);
  return <div className="max-w-[760px] space-y-2">
    <p className="text-[11px] leading-5 text-subtle">{t("inspector.mobDetails.spawnCaveat")}</p>
    {ordered.map(([behavior, members]) => <section key={behavior} className="border-t border-border/70 pt-3">
      <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-200">
        {t(`inspector.mobDetails.behaviors.${behavior}`)}
        <span className="ml-2 font-normal text-muted">{members.length}</span>
      </h4>
      <div className="grid grid-cols-2 gap-x-5">
        {members.map(ref => {
          const appearance = display("entity", ref.id);
          const spawn = ref.spawn!;
          return <button key={ref.id} type="button" onClick={() => navigate({ kind: "entity", id: ref.id })}
            className="group flex min-w-0 cursor-pointer items-center gap-2 border-b border-border/70 py-2 text-left hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
            <span className="shrink-0"><InspectorSubjectIcon image={appearance.image} size={26} /></span>
            <span className="min-w-0 flex-1"><span className="block truncate text-[12px] font-medium text-zinc-100 group-hover:text-accent">{appearance.name}</span>
              <span className="block text-[10px] text-subtle">{t("inspector.biomeGuide.spawnDetail", {
                group: spawn.group.min === spawn.group.max ? String(spawn.group.min)
                  : `${spawn.group.min}–${spawn.group.max}`, weight: spawn.weight })}</span></span>
            <ChevronRight size={13} className="shrink-0 text-accent/75" aria-hidden="true" />
          </button>;
        })}
      </div>
    </section>)}
  </div>;
};
