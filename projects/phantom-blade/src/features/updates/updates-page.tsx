import { ArrowLeft, Bell } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { UPDATES_VERSION } from "./updates-release";

interface UpdatesPageProps {
  onNavigateMap: () => void;
  onNavigateMapFilter: (categoryId: string) => void;
  onNavigateSettingsAppearance: () => void;
  onNavigateMapPoint: (markerId: string) => void;
  onNavigateTalentCalculator: (classId: string) => void;
  active: boolean;
}
export default function UpdatesPage({ onNavigateMap, active }: UpdatesPageProps) {
  const { t } = useTranslation();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const releaseKey = `v${UPDATES_VERSION.replaceAll(".", "")}`;
  const items: unknown = t(`updates.releases.${releaseKey}.items`, { returnObjects: true });
  const notes = Array.isArray(items) ? items.filter((item): item is string => typeof item === "string") : [];
  useEffect(() => { if (active) headingRef.current?.focus({ preventScroll: true }); }, [active]);
  return <div className="flex h-full min-h-0 flex-col bg-background" data-updates-page>
    <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-4">
      <div className="flex items-center gap-3">
        <Bell size={18} className="text-accent" aria-hidden="true" />
        <h1 ref={headingRef} tabIndex={-1} className="text-lg font-semibold text-white outline-none">{t("updates.title")}</h1>
      </div>
      <button type="button" onClick={onNavigateMap} aria-label={t("updates.back")} className="grid h-9 w-9 cursor-pointer place-items-center rounded text-subtle hover:bg-surface-hover hover:text-white">
        <ArrowLeft size={18} aria-hidden="true" />
      </button>
    </header>
    <div className="scroll-slim min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-8">
      <h2 className="font-mono text-sm text-zinc-100">{t("updates.version", { version: UPDATES_VERSION })}</h2>
      {notes.length ? (
        <ul className="list-disc space-y-2 pl-5 text-sm text-zinc-300">
          {notes.map((note) => <li key={note}>{note}</li>)}
        </ul>
      ) : <p className="text-sm text-zinc-300">{t("updates.noNotes")}</p>}
    </div>
  </div>;
}
