import { ChevronRight } from "lucide-react";
import type { TFunction } from "i18next";
import type { InspectorSubject } from "../inspector/inspector-controller.ts";
import InspectorSubjectIcon from "../inspector/inspector-subject-icon.tsx";
import { GAME_GUIDE_TUTORIALS } from "../../game-config.ts";
import { useGuideNavigation } from "./guide-navigation-context.ts";
import type { RecipeSubjectDisplay } from "./recipe-subject-display.ts";

const tutorialLinkSubject = (value: string): InspectorSubject => {
  const separator = value.indexOf("|");
  const kind = value.slice(0, separator), id = value.slice(separator + 1);
  if (!id || !["item", "entity", "poi", "trade", "enchantment"].includes(kind))
    throw new Error(`Invalid tutorial link: ${value}`);
  return { kind: kind as InspectorSubject["kind"], id };
};

const TutorialRoute = ({ topic, display, available, t }: { topic: (typeof GAME_GUIDE_TUTORIALS)[number];
  display: RecipeSubjectDisplay; available: (subject: InspectorSubject) => boolean; t: TFunction }) => {
  const navigate = useGuideNavigation();
  return <ol className="relative ml-3 border-l border-border/80">
    {topic.steps.map((step, index) => {
      const key = `inspector.tutorialGuide.topics.${topic.id}.steps.${step.id}`;
      const links = step.links.map(tutorialLinkSubject).filter(available);
      return <li key={step.id} className="relative pb-7 pl-7 last:pb-0">
        <span className="absolute -left-[14px] top-0 grid h-[27px] w-[27px] place-items-center rounded-full border border-accent/50 bg-background text-[11px] font-bold tabular-nums text-accent">
          {index + 1}
        </span>
        <h4 className="pt-0.5 text-[14px] font-semibold leading-5 text-white">{t(`${key}.title`)}</h4>
        <p className="mt-1.5 max-w-[650px] text-[12.5px] leading-[1.65] text-zinc-300">{t(`${key}.body`)}</p>
        {links.length > 0 && <div className="mt-3 flex flex-wrap gap-2">
          {links.map(subject => {
            const item = display(subject.kind, subject.id);
            return <button key={`${subject.kind}:${subject.id}`} type="button"
              onClick={() => navigate(subject)}
              className="group inline-flex min-h-9 max-w-full cursor-pointer items-center gap-2 rounded-[var(--radius-md)] border border-border bg-white/[0.025] px-2.5 py-1.5 text-left text-[11.5px] font-medium text-zinc-100 transition-colors hover:border-accent/45 hover:bg-accent/[0.07] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
              <InspectorSubjectIcon image={item.image} size={21} />
              <span className="min-w-0 break-words">{item.name}</span>
              <ChevronRight size={12} className="shrink-0 text-accent/70 group-hover:text-accent" aria-hidden="true" />
            </button>;
          })}
        </div>}
      </li>;
    })}
  </ol>;
};

export default TutorialRoute;
