import { ChevronLeft } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import NativeWikiUpgrades from "../reference/native-wiki-upgrades";
import { nativeEntryName } from "../reference/native-wiki-presentation";
import { nativeMarkerDetailModel } from "./native-marker-detail-model";
import NativeMarkerProperties from "./native-marker-properties";
import type { NativeMarkerInspectorRequest } from "./native-marker-inspector-context";

export default function NativeMarkerInspector({ request, onClose }: { request: NativeMarkerInspectorRequest; onClose: () => void }) {
  const { t } = useTranslation();
  const { entry, section, markerCategory } = request;
  const backButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    backButton.current?.focus({ preventScroll: true });
    return () => { document.getElementById(`native-marker-action-${entry.id}-${section}`)?.focus({ preventScroll: true }); };
  }, [entry.id, section]);
  const model = nativeMarkerDetailModel(entry, markerCategory);
  const title = t(section === "properties" ? "wiki.properties" : "wiki.marker.upgrades");
  return <aside id="native-marker-inspector" aria-label={title} data-map-selection-panel onKeyDownCapture={event => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); }
  }}
    className="native-marker-inspector pointer-events-auto flex max-h-full min-w-0 max-w-[26.25rem] flex-1 flex-col overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-2xl shadow-black/40 animate-fade-in">
    <header className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
      <button type="button" ref={backButton} onClick={onClose} aria-label={t("map.sidebar.closeTool", { tool: title })}
        className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-md)] text-subtle hover:bg-surface-hover hover:text-white focus-visible:outline-2 focus-visible:outline-accent"><ChevronLeft size={18} aria-hidden="true" /></button>
      <div className="min-w-0"><h2 className="text-sm font-semibold text-zinc-100">{title}</h2><p className="mt-0.5 text-xs text-subtle">{nativeEntryName(entry)}</p></div>
    </header>
    <div className="scroll-slim min-h-0 flex-1 space-y-5 overflow-y-auto p-4 [&_.native-wiki-upgrades]:grid-cols-1">
      {section === "upgrades" ? <NativeWikiUpgrades key={entry.id} sections={model.upgrades} /> : <NativeMarkerProperties entry={entry} markerCategory={markerCategory} />}
    </div>
  </aside>;
}
