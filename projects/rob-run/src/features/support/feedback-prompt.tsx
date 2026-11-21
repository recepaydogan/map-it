import { Check, CircleUserRound, LocateFixed, MessageSquare, Settings, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { shouldAutoStartOnboarding, useOnboardingActive } from "../onboarding/use-onboarding";
import type { StackNotification } from "../../components/notification-stack";
import NotificationDock from "../../components/notification-dock";
import { AddonSetupSteps } from "../character-sync/character-connection";
import { useCharacterSyncPrompt } from "../character-sync/use-character-sync-prompt";
import { track } from "../../services/optional-usage";

const DISMISSED_KEY = "wfm:feedback-prompt-dismissed:v1";
const TRACKING_DISMISSED_KEY = "wfm:tracking-announcement-dismissed:v1";
const AUTO_OPEN_DISMISSED_KEY = "wfm:auto-open-announcement-dismissed:v1";
const REMOVE_ADS_DISMISSED_KEY = "wfm:remove-ads-announcement-dismissed:v1";
// Preview all cards without resetting the user's saved dismissals.
const previewAnnouncements = import.meta.env.DEV
  && new URLSearchParams(window.location.search).get("preview-announcements") === "1";
const isDismissed = (key: string) => {
  try { return localStorage.getItem(key) === "1"; }
  catch { return false; }
};

export default function FeedbackPrompt({ onOpenFeedback, onOpenSettings, onOpenPackages }: {
  onOpenFeedback: () => void;
  onOpenSettings: () => void;
  onOpenPackages?: () => void;
}) {
  const { t } = useTranslation();
  const onboardingActive = useOnboardingActive();
  const addonPrompt = useCharacterSyncPrompt(previewAnnouncements);
  const [dismissed, setDismissed] = useState(() => !previewAnnouncements && isDismissed(DISMISSED_KEY));
  const [trackingDismissed, setTrackingDismissed] = useState(() => !previewAnnouncements && isDismissed(TRACKING_DISMISSED_KEY));
  const [autoOpenDismissed, setAutoOpenDismissed] = useState(() => !previewAnnouncements && isDismissed(AUTO_OPEN_DISMISSED_KEY));
  const [removeAdsDismissed, setRemoveAdsDismissed] = useState(() => !previewAnnouncements && isDismissed(REMOVE_ADS_DISMISSED_KEY));

  useEffect(() => {
    if (previewAnnouncements) return;
    const sync = (event: StorageEvent) => {
      if (event.key === DISMISSED_KEY || event.key === null) setDismissed(isDismissed(DISMISSED_KEY));
      if (event.key === TRACKING_DISMISSED_KEY || event.key === null) setTrackingDismissed(isDismissed(TRACKING_DISMISSED_KEY));
      if (event.key === AUTO_OPEN_DISMISSED_KEY || event.key === null) setAutoOpenDismissed(isDismissed(AUTO_OPEN_DISMISSED_KEY));
      if (event.key === REMOVE_ADS_DISMISSED_KEY || event.key === null) setRemoveAdsDismissed(isDismissed(REMOVE_ADS_DISMISSED_KEY));
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  const dismiss = () => {
    setDismissed(true);
    if (previewAnnouncements) return;
    try { localStorage.setItem(DISMISSED_KEY, "1"); }
    catch { /* Keep the dismissal for this session when storage is unavailable. */ }
  };
  const dismissTracking = () => {
    setTrackingDismissed(true);
    if (previewAnnouncements) return;
    try { localStorage.setItem(TRACKING_DISMISSED_KEY, "1"); }
    catch { /* Keep the dismissal for this session when storage is unavailable. */ }
  };
  const dismissAutoOpen = () => {
    setAutoOpenDismissed(true);
    if (previewAnnouncements) return;
    try { localStorage.setItem(AUTO_OPEN_DISMISSED_KEY, "1"); }
    catch { /* Keep the dismissal for this session when storage is unavailable. */ }
  };
  const dismissRemoveAds = () => {
    setRemoveAdsDismissed(true);
    if (previewAnnouncements) return;
    try { localStorage.setItem(REMOVE_ADS_DISMISSED_KEY, "1"); }
    catch { /* Keep the dismissal for this session when storage is unavailable. */ }
  };
  const notifications: StackNotification[] = [];
  if (!onboardingActive && !shouldAutoStartOnboarding()) {
    if (onOpenPackages && !removeAdsDismissed) notifications.push({
      id: "remove-ads", icon: ShieldCheck,
      title: t("announcements.removeAds.title"), body: t("announcements.removeAds.body"),
      content: <ul className="space-y-2 text-xs leading-5 text-zinc-200">
        {["adFree", "mapSpace", "supportFounder"].map(benefit => <li key={benefit} className="flex items-center gap-2">
          <Check size={14} className="shrink-0 text-forever-blue" aria-hidden="true" />
          <span>{t(`premiumPlans.${benefit}`)}</span>
        </li>)}
      </ul>,
      dismissLabel: t("announcements.removeAds.dismiss"), onDismiss: dismissRemoveAds,
      action: { label: t("announcements.removeAds.action"), onClick: () => {
        track("SEE_PACKAGES_CLICKED", { source: "remove_ads_announcement" });
        onOpenPackages();
      } },
    });
    if (addonPrompt.visible) notifications.push({
      id: "addon-setup", title: t("characterSync.title"), icon: CircleUserRound,
      dismissLabel: t("characterSync.dismiss"), onDismiss: addonPrompt.dismiss,
      content: <AddonSetupSteps />,
    });
    if (!trackingDismissed) notifications.push({
      id: "live-tracking", icon: LocateFixed,
      title: t("announcements.liveTracking.title"), body: t("announcements.liveTracking.body"),
      dismissLabel: t("announcements.liveTracking.dismiss"), onDismiss: dismissTracking,
      action: { label: t("announcements.liveTracking.action"), onClick: dismissTracking },
    });
    if (!autoOpenDismissed) notifications.push({
      id: "auto-open-settings", icon: Settings,
      title: t("announcements.autoOpen.title"), body: t("announcements.autoOpen.body"),
      dismissLabel: t("announcements.autoOpen.dismiss"), onDismiss: dismissAutoOpen,
      action: { label: t("announcements.autoOpen.action"), onClick: () => { dismissAutoOpen(); onOpenSettings(); } },
    });
    if (!dismissed) notifications.push({
      id: "feedback", icon: MessageSquare,
      title: t("support.feedbackPrompt.title"), body: t("support.feedbackPrompt.body"),
      dismissLabel: t("support.feedbackPrompt.dismiss"), onDismiss: dismiss,
      action: { label: t("support.feedbackPrompt.action"), onClick: () => { dismiss(); onOpenFeedback(); } },
    });
  }
  return <NotificationDock notifications={notifications} label={t("announcements.title")} />;
}
