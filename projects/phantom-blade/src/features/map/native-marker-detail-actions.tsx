import { ChevronRight, SlidersHorizontal, Wrench } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { NativeWikiEntry } from "../reference/use-native-wiki";
import { nativeMarkerDetailModel } from "./native-marker-detail-model";
import { useNativeMarkerInspector } from "./native-marker-inspector-context";

export default function NativeMarkerDetailActions({ entry, markerCategory }: { entry: NativeWikiEntry; markerCategory?: string }) {
  const { t } = useTranslation();
  const inspector = useNativeMarkerInspector();
  const model = nativeMarkerDetailModel(entry, markerCategory);
  const sections = (["properties", "upgrades"] as const).filter(section => section === "properties" ? model.hasProperties && !model.inlineProperties : model.upgrades.length > 0);
  if (!inspector || !sections.length) return null;
  return <div className="native-marker-detail-actions grid grid-cols-2 gap-2">
    {sections.map(section => {
      const Icon = section === "properties" ? SlidersHorizontal : Wrench;
      const active = inspector.active?.entry.id === entry.id && inspector.active.section === section;
      return <button type="button" key={section} id={`native-marker-action-${entry.id}-${section}`} aria-expanded={active} aria-controls={active ? "native-marker-inspector" : undefined}
        onClick={() => inspector.open({ entry, section, markerCategory })}
        className="flex min-h-11 min-w-0 cursor-pointer items-center gap-2 rounded-[var(--radius-md)] border border-border px-3 py-2.5 text-left text-xs font-medium text-zinc-100 transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-accent">
        <Icon size={15} aria-hidden="true" className="shrink-0 text-subtle" /><span className="min-w-0 flex-1">{t(section === "properties" ? "wiki.properties" : "wiki.marker.upgrades")}</span><ChevronRight size={14} aria-hidden="true" className="shrink-0 text-subtle" />
      </button>;
    })}
  </div>;
}
