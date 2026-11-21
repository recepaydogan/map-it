import { useTranslation } from "react-i18next";
import { AddonInstallAction } from "../character-sync/addon-install-action";
import { useAddonSync } from "../character-sync/addon-sync-store";
import { supportsStartTracker } from "../live-position/position-addon-version";
import positionCardImage from "./position-tracker-card.png";

export default function PositionTrackerReleaseNote({ title }: { title: string }) {
  const { t } = useTranslation();
  const addon = useAddonSync();
  const supportsTracker = supportsStartTracker(addon.addonVersion);

  return <div className="flex flex-wrap items-start gap-x-5 gap-y-3 rounded-[var(--radius-md)] border border-border bg-surface p-4">
    <div className="min-w-0 flex-1 basis-60 space-y-2 text-sm leading-6 text-zinc-200">
      <h3 className="font-semibold text-white">{title}</h3>
      <p>{t("updates.positionTracker.instructions", { command: "/start-tracker" })}</p>
      {supportsTracker
        ? addon.needsReload && <p role="status">{t("updates.positionTracker.reload", { command: "/reload" })}</p>
        : <AddonInstallAction compact showInstalled />}
    </div>
    <img src={positionCardImage} width={148} height={84} alt={t("updates.positionTracker.imageAlt")}
      className="max-w-full shrink-0 rounded-sm" />
  </div>;
}
