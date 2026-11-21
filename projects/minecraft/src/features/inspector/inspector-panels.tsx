import { useEffect, useRef, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import InspectorPanel from "./inspector-panel";
import type { InspectorController, InspectorSubject } from "./inspector-controller";
import type { InspectorContent } from "./inspector-types";

interface Props {
  controller: InspectorController; resolve: (subject: InspectorSubject, navigate?: (target: InspectorSubject) => void) => InspectorContent | null;
  /** Measure the usable map container, already excluding the ad rail and any reserved panels. */
  availableWidth: number; active?: boolean; onDismiss?: () => void; baseLabel?: string;
}

const InspectorPanels = ({ controller, resolve, availableWidth, active = true, onDismiss, baseLabel }: Props) => {
  const { t } = useTranslation(), state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const root = state.entries[0], current = state.entries.at(-1), parent = state.entries.at(-2);
  const sideBySide = availableWidth >= 1180;
  const previousCount = useRef(state.entries.length);
  useEffect(() => {
    if (previousCount.current > 0 && !state.entries.length) onDismiss?.();
    previousCount.current = state.entries.length;
  }, [state.entries.length, onDismiss]);
  useEffect(() => {
    if (!active || !state.entries.length) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || event.isComposing) return;
      // Bubble after focused controls, allowing a dropdown/dialog to consume Escape first.
      const higherLayers = document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"], [role="listbox"]');
      if ([...higherLayers].some(layer => !layer.closest("[hidden], [inert]") && layer.getClientRects().length > 0 && getComputedStyle(layer).visibility !== "hidden")) return;
      event.preventDefault(); event.stopPropagation(); controller.back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, controller, state.entries.length]);
  if (!root || !current || !active) return null;
  const content = (subject: InspectorSubject, navigate?: (target: InspectorSubject) => void): InspectorContent => resolve(subject, navigate) ?? {
    name: subject.id, category: t("inspector.details"), description: t("inspector.unavailable"),
  };
  const show = sideBySide && current.key !== root.key ? [root, current] : [current];
  return <div className="pointer-events-none flex h-full min-h-0 max-w-full items-start gap-3" data-inspector-layout={sideBySide ? "wide" : "single"}>
    {show.map(entry => {
      const companion = sideBySide && entry.key !== root.key;
      const baseBack = entry.key === root.key && !!baseLabel;
      const hasBack = baseBack || entry.key === current.key && !!parent && (!sideBySide || parent.key !== root.key);
      return <InspectorPanel key={entry.key} entry={entry} controller={controller} content={content(entry.subject, target => controller.navigate(entry.key, target))}
        notice={entry.key === current.key && state.notice === "history-limit" ? t("inspector.historyLimit") : undefined}
        selected={entry.key === root.key && current.key !== root.key ? state.entries[1].subject : undefined}
        focusOnMount={entry.key === current.key} backLabel={baseBack ? baseLabel : parent ? content(parent.subject).name : undefined}
        onBack={hasBack ? baseBack ? () => controller.close() : () => controller.back() : undefined}
        onClose={companion ? () => controller.closeCompanion() : () => controller.close()} />;
    })}
  </div>;
};

export default InspectorPanels;
