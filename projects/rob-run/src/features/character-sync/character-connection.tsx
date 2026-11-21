import { useRelativeTime } from "../../lib/use-relative-time";
import { Check, CircleUserRound, Info } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useCharacterSync } from "./character-sync-store";
import { useAddonSync } from "./addon-sync-store";
import { AddonInstallAction } from "./addon-install-action";
import { useCharacterSyncPrompt } from "./use-character-sync-prompt";
import NotificationDock from "../../components/notification-dock";

export function AddonSetupSteps({ allowReinstall = false }: { allowReinstall?: boolean }) {
  const { t } = useTranslation();
  const addon = useAddonSync();
  const installed = addon.status === "ready";
  const synced = installed && Boolean(addon.savedAt) && !addon.needsReload;
  const rows = [
    { key: "install", ready: installed, text: installed && addon.addonVersion
      ? t("characterSync.addonReady", { version: addon.addonVersion }) : t("addonSync.installStep") },
    { key: "reload", ready: synced, text: t("addonSync.reloadStep") },
  ];
  return <ol className="space-y-3">
    {rows.map((row, index) => <li key={row.key} className="flex items-start gap-2.5 text-xs leading-5">
      <span className="mt-0.5 grid size-[22px] shrink-0 place-items-center rounded-full bg-white/[0.06] text-[11px] text-subtle">
        {row.ready ? <Check size={15} className="text-success-text" aria-hidden="true" /> : index + 1}
      </span>
      <div className="min-w-0 flex-1"><p className={row.ready ? "text-zinc-100" : "text-subtle"}>{row.text}</p>
        {index === 0 && (!installed || allowReinstall) && <div className="mt-2"><AddonInstallAction compact showInstalled={allowReinstall} /></div>}
      </div>
    </li>)}
  </ol>;
}

export function CharacterConnection() {
  const { t, i18n } = useTranslation();
  const relativeTime = useRelativeTime(i18n.language);
  const state = useCharacterSync();
  const addon = useAddonSync();
  const characters = Object.values(state.characters);
  const latest = (addon.savedAt ? addon.savedAt / 1000 : null) ?? (characters.length ? Math.max(...characters.map(character => character.savedAt ?? character.updatedAt)) : null);
  return <section className="rounded-[var(--radius-md)] border border-border bg-background px-6 py-5" aria-label={t("characterSync.connection")}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="font-[Georgia] text-xl text-white">{t("characterSync.connection")}</h2>
      <span role="status" className="rounded-[var(--radius-full)] border border-border px-2.5 py-1 text-[11px] text-subtle">
        {t(state.liveConnected ? "characterSync.liveData" : latest ? "characterSync.savedData" : "characterSync.waiting")}
      </span>
    </div>
    <div className="mt-5"><AddonSetupSteps allowReinstall /></div>
    {latest && <p className="mt-4 text-xs text-subtle">{t("characterSync.savedAt", { date: relativeTime(latest) })}</p>}
    <div className="mt-5 flex items-start gap-2.5 border-t border-border pt-4 text-[12px] leading-5 text-zinc-200">
      <Info size={18} className="mt-0.5 shrink-0 text-muted" aria-hidden="true" />
      <p>{t(state.phase === "browser" ? "characterSync.browserHint" : addon.status === "ready" ? "addonSync.reloadHint" : "addonSync.installDescription")}</p>
    </div>
  </section>;
}

/** The standalone setup prompt used outside the map announcement stack. */
export function CharacterSyncPrompt() {
  const { t } = useTranslation();
  const prompt = useCharacterSyncPrompt();
  return <NotificationDock label={t("announcements.title")} notifications={prompt.visible ? [{
    id: "addon-setup", title: t("characterSync.title"), icon: CircleUserRound,
    dismissLabel: t("characterSync.dismiss"), onDismiss: prompt.dismiss,
    content: <AddonSetupSteps />,
  }] : []} />;
}
