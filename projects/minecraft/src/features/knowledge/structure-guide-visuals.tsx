import { ArrowRight, ArrowUpRight, MapPinned } from "lucide-react";
import type { TFunction } from "i18next";
import type { InspectorLink } from "../inspector/inspector-types.ts";
import InspectorSubjectIcon from "../inspector/inspector-subject-icon.tsx";
import type { KnowledgeSubjectDisplay } from "./mechanics-inspector-content.ts";
import { useGuideNavigation } from "./guide-navigation-context.ts";
import { structureGuideDimensions, type StructureGuideType } from "./structure-guide-data.ts";

export const StructureGuideLinks = ({ links, display }: { links: readonly InspectorLink[]; display: KnowledgeSubjectDisplay }) => {
  const navigate = useGuideNavigation();
  return <div className="grid grid-cols-2 gap-x-5">
    {links.map(link => {
      const item = display(link.subject.kind, link.subject.id);
      return <button key={link.key} type="button" onClick={() => navigate(link.subject)}
        className="group flex min-w-0 cursor-pointer items-center gap-2 border-b border-border/70 py-2 text-left text-[12px] font-medium text-zinc-100 hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
        <span className="shrink-0"><InspectorSubjectIcon image={item.image} size={26} /></span>
        <span className="min-w-0 flex-1 break-words group-hover:underline">{item.name}</span>
        <ArrowUpRight size={13} className="shrink-0 text-accent/75" aria-hidden="true" />
      </button>;
    })}
  </div>;
};

export const StructureGuideOverview = ({ type, name, description, t, onSearchMap }: { type: StructureGuideType;
  name: string; description: string; t: TFunction; onSearchMap?: () => void }) =>
  <div className="max-w-[760px]">
    <div className="grid grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] gap-5 border-y border-border/70 py-4">
      <div className="aspect-video min-w-0 overflow-hidden bg-surface">
        <img src={type.preview} alt={name} loading="eager" decoding="async" draggable={false}
          className="h-full w-full object-cover" />
      </div>
      <div className="min-w-0">
        <dl className="grid grid-cols-2 gap-3 border-b border-border/70 pb-3">
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">{t("biomeMap.dimension")}</dt>
            <dd className="mt-1 text-[12px] font-medium text-zinc-100">{structureGuideDimensions(type.knowledgeId)
              .map(dimension => t(`biomeMap.${dimension}`)).join(" · ")}</dd>
          </div>
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">{t("inspector.structureGuide.region")}</dt>
            <dd className="mt-1 text-[12px] font-medium text-zinc-100">{t(`structureMap.groups.${type.group}`)}</dd>
          </div>
        </dl>
        <p className="pt-3 text-[12px] leading-[1.65] text-zinc-200">{description}</p>
      </div>
    </div>
    <dl className="divide-y divide-border/70 border-b border-border/70">
      <div className="grid grid-cols-[130px_minmax(0,1fr)] items-baseline gap-4 py-3">
        <dt className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">{t("inspector.structureGuide.find")}</dt>
        <dd className="min-w-0 text-[12px] leading-[1.6] text-zinc-100">
          <p>{t(`inspector.structureGuide.locations.${type.id}`)}</p>
          {onSearchMap && <button type="button" onClick={onSearchMap}
            className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-[var(--radius-sm)] border border-accent/35 bg-accent-soft px-2.5 py-1.5 text-[11px] font-semibold text-accent hover:border-accent/70 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
            <MapPinned size={13} aria-hidden="true" />{t("structureMap.search.label")}
            <ArrowRight size={12} aria-hidden="true" />
          </button>}
        </dd>
      </div>
      <div className="grid grid-cols-[130px_minmax(0,1fr)] items-baseline gap-4 py-3">
        <dt className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">{t("inspector.structureGuide.approach")}</dt>
        <dd className="min-w-0 text-[12px] leading-[1.6] text-zinc-100">{t(`inspector.structureGuide.tips.${type.id}`)}</dd>
      </div>
    </dl>
  </div>;
