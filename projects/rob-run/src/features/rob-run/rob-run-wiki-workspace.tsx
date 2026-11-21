import { BookOpen, ChevronLeft, X } from "lucide-react";
import { useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  openRobRunPreviewAsPage, RobRunPreviewContext, RobRunPreviewRendererContext, type RobRunPreviewTarget,
} from "./rob-run-catalog-navigation";
import "./rob-run-detail.css";

export default function RobRunWikiWorkspace({ title, children }: { title: string; children: ReactNode }) {
  const { t } = useTranslation();
  const renderPreview = useContext(RobRunPreviewRendererContext);
  const [history, setHistory] = useState<RobRunPreviewTarget[]>([]);
  const target = history.at(-1) ?? null;
  const trigger = useRef<HTMLElement | null>(null);
  const backButton = useRef<HTMLButtonElement>(null);
  const main = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (target) backButton.current?.focus({ preventScroll: true });
  }, [target]);

  if (!renderPreview) return children;
  const close = () => {
    setHistory([]);
    requestAnimationFrame(() => trigger.current?.focus({ preventScroll: true }));
  };
  const open = (next: RobRunPreviewTarget) => {
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && main.current?.contains(focused)) trigger.current = focused;
    setHistory((current) => {
      const previous = current.findIndex((entry) => entry.page === next.page && entry.id === next.id
        && entry.vendorItemId === next.vendorItemId && entry.realmVersion === next.realmVersion);
      return previous < 0 ? [...current, next] : current.slice(0, previous + 1);
    });
  };
  const back = () => history.length > 1 ? setHistory((current) => current.slice(0, -1)) : close();
  const backLabel = t("reference.backTo", { label: history.at(-2)?.name ?? title });

  return <RobRunPreviewContext.Provider value={{ target, open, close }}>
    <div className="rob-run-wiki-workspace" data-preview={Boolean(target)} onKeyDown={(event) => {
      if (target && event.key === "Escape" && !event.defaultPrevented) {
        event.stopPropagation();
        close();
      }
    }}>
      <div className="rob-run-wiki-main" ref={main}>{children}</div>
      {target && <aside className="rob-run-wiki-preview" aria-label={target.name}>
        <div className="rob-run-wiki-preview-toolbar">
          <button type="button" className="rob-run-wiki-preview-back" ref={backButton} onClick={back} title={backLabel}>
            <ChevronLeft size={15} aria-hidden="true" /><span>{backLabel}</span>
          </button>
          <button type="button" className="rob-run-wiki-preview-close" onClick={close} aria-label={t("chrome.close")}>
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <div className="rob-run-wiki-preview-content" key={JSON.stringify(target)}>{renderPreview(target)}</div>
        {target.page !== "items" && <footer className="rob-run-preview-footer">
          <button type="button" className="rob-run-detail-action" onClick={() => { close(); openRobRunPreviewAsPage(target); }}>
            <BookOpen size={15} aria-hidden="true" />{t("robRun.wiki.open")}
          </button>
        </footer>}
      </aside>}
    </div>
  </RobRunPreviewContext.Provider>;
}
