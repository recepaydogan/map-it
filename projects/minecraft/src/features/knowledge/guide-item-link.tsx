import { ChevronRight } from "lucide-react";
import InspectorSubjectIcon from "../inspector/inspector-subject-icon.tsx";
import { useGuideNavigation } from "./guide-navigation-context.ts";
import type { RecipeSubjectDisplay } from "./recipe-subject-display.ts";

const GuideItemLink = ({ id, display, quantity, showIcon = true }: { id: string; display: RecipeSubjectDisplay;
  quantity?: number; showIcon?: boolean }) => {
  const onNavigate = useGuideNavigation();
  const item = display("item", id);
  return <button type="button" onClick={() => onNavigate({ kind: "item", id })} data-guide-item={id}
    className="group flex min-w-0 max-w-full cursor-pointer items-center gap-2 text-left text-[12px] font-medium text-zinc-100 hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
    {showIcon && <span className="shrink-0"><InspectorSubjectIcon image={item.image} size={26} /></span>}
    <span className="min-w-0 break-words group-hover:underline">{item.name}</span>
    {quantity !== undefined && quantity > 1 && <span className="shrink-0 font-semibold tabular-nums text-accent">×{quantity}</span>}
    <ChevronRight size={13} className="shrink-0 text-accent/75 group-hover:text-accent" aria-hidden="true" />
  </button>;
};

export default GuideItemLink;
