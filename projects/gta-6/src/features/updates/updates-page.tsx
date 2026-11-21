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
  useEffect(() => { if (active) headingRef.current?.focus({ preventScroll: true }); }, [active]);
  return <div className="flex h-full min-h-0 flex-col bg-background" data-updates-page>
    <header className="flex shrink-0 items-center gap-3 border-b border-border px-6 py-4">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius-md)] border border-accent/30 bg-accent-soft">
        <Bell size={18} className="text-accent" aria-hidden="true" />
      </div>
      <h1 ref={headingRef} tabIndex={-1} className="min-w-0 flex-1 text-[18px] font-semibold tracking-tight text-white outline-none">{t("updates.title")}</h1>
      <button type="button" onClick={onNavigateMap} aria-label={t("updates.back")} className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-md)] text-zinc-400 hover:bg-white/8 hover:text-white">
        <ArrowLeft size={17} aria-hidden="true" />
      </button>
    </header>
    <div className="scroll-slim min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-8">
      <h2 className="text-sm font-semibold text-zinc-100">{t("updates.version", { version: UPDATES_VERSION })}</h2>
      <p className="text-sm text-zinc-300">{t("updates.noNotes")}</p>
    </div>
  </div>;
}
