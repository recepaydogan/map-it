import { Download, LoaderCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { requestAddonInstall, updateAddonSync, useAddonSync } from "./addon-sync-store";

/** The shared, explicit install action for all character-sync entry points. */
export function AddonInstallAction({ showInstalled = false, compact = false }: { showInstalled?: boolean; compact?: boolean }) {
  const { t } = useTranslation();
  const addon = useAddonSync();
  const browser = typeof overwolf === "undefined";
  const installing = addon.status === "installing";
  if (addon.status === "ready" && !showInstalled) return null;
  return <div className="space-y-2">
    {!compact && <p className="text-xs leading-5 text-subtle">{t("addonSync.installDescription")}</p>}
    <button type="button" disabled={browser || installing} onClick={() => {
      try { requestAddonInstall(); } catch { updateAddonSync({ status: "error" }); }
    }}
      className="inline-flex min-h-9 cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-sm)] border border-border bg-white/[0.035] px-3 py-2 text-xs font-semibold text-zinc-100 hover:border-accent/60 hover:text-white focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50">
      {installing ? <LoaderCircle size={14} className="animate-spin" aria-hidden="true" /> : <Download size={14} aria-hidden="true" />}
      {t(installing ? "addonSync.installingButton" : addon.status === "error" || addon.status === "game-missing"
        ? "addonSync.retry" : addon.addonVersion ? "addonSync.reinstall" : "addonSync.install")}
    </button>
    <div role="status" aria-live="polite" className="text-[11px] leading-5 text-subtle">
      {browser ? t("characterSync.browserHint") : addon.status === "game-missing" ? t("addonSync.gameMissing")
        : addon.status === "error" ? t("addonSync.installError") : installing ? t("addonSync.installing") : null}
    </div>
  </div>;
}
