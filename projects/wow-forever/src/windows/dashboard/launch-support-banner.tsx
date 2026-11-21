import { X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";

const LaunchSupportBanner = ({ raised = false }: { raised?: boolean }) => {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div className={cn(
      "pointer-events-none absolute inset-x-4 z-[60] flex justify-center",
      raised ? "bottom-20" : "bottom-6",
    )}>
      <div className="pointer-events-auto relative max-w-[720px] rounded-[var(--radius-lg)] border border-border bg-surface/95 px-4 py-3 pr-12 text-center text-[13px] leading-5 text-white/90 shadow-lg backdrop-blur">
        <p>{t("chrome.launchSupportNotice")}</p>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label={t("chrome.close")}
          className="absolute right-2 top-2 grid h-7 w-7 cursor-pointer place-items-center rounded-[var(--radius-sm)] text-white/60 transition-colors hover:bg-white/8 hover:text-white focus-visible:outline-2 focus-visible:outline-accent"
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
};

export default LaunchSupportBanner;
