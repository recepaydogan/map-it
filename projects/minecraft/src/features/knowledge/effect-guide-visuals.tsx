import { ChevronRight } from "lucide-react";
import GuideItemLink from "./guide-item-link.tsx";
import { useGuideNavigation } from "./guide-navigation-context.ts";
import InspectorSubjectIcon from "../inspector/inspector-subject-icon.tsx";
import type { KnowledgeSubjectDisplay } from "./mechanics-inspector-content.ts";

export const EffectPotionLinks = ({ ids, display }: { ids: readonly string[]; display: KnowledgeSubjectDisplay }) =>
  <div className="grid max-w-[760px] grid-cols-2 gap-x-5">
    {ids.map(id => <div key={id} className="min-w-0 border-b border-border/70 py-2">
      <GuideItemLink id={id} display={display} />
    </div>)}
  </div>;

export const EffectRelatedLinks = ({ ids, display }: { ids: readonly string[]; display: KnowledgeSubjectDisplay }) => {
  const navigate = useGuideNavigation();
  return <div className="grid max-w-[760px] grid-cols-2 gap-x-5">
    {ids.map(id => {
      const effect = display("effect", id);
      return <button key={id} type="button" onClick={() => navigate({ kind: "effect", id })}
        className="group flex min-w-0 cursor-pointer items-center gap-2 border-b border-border/70 py-2 text-left text-[12px] font-medium text-zinc-100 hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
        <InspectorSubjectIcon image={effect.image} size={26} />
        <span className="min-w-0 flex-1 break-words group-hover:underline">{effect.name}</span>
        <ChevronRight size={13} className="shrink-0 text-accent/75" aria-hidden="true" />
      </button>;
    })}
  </div>;
};
