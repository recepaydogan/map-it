import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ORDERED_LIBRARY_GAMES, selectApp } from "../../features/app-library/app-selection";
import { useSupportBadges } from "../../state/use-support";
import { openExternalUrl } from "../../utils/platform";
import DiscordIcon from "./discord-icon";
import NavigationSidebar from "./navigation-sidebar";
import { bindDragMoveElement } from "../../overwolf-utils/window-manager";

const libraryDiscordInviteUrl = "https://discord.gg/dgUS9PW9qm";

export default function MapItSidebar({ pane, onChange }: {
  pane: "account" | "support" | null;
  onChange: (pane: "account" | "support" | null) => void;
}) {
  const { t } = useTranslation();
  const { unreadReplies, inboxPending } = useSupportBadges();
  const panel = useRef<HTMLElement>(null);
  useEffect(() => bindDragMoveElement(panel.current), []);
  return (
    <NavigationSidebar
      label={t("hub.brand")}
      brandIcon={<img src="/icon.png" alt="" draggable={false} />}
      onBrandSelect={() => onChange(null)}
      panelRef={panel}
      pinLabel={t("hub.pinNavigation")}
      storageKey="map-it:navigation-pinned"
      items={ORDERED_LIBRARY_GAMES.map(app => ({
          id: app.id,
          label: app.name,
          icon: (
            <img
              src={app.icon}
              alt=""
              draggable={false}
            />
          ),
          onSelect: () => selectApp(app.id),
      }))}
      footer={[
        {
          id: "discord", icon: <DiscordIcon className="size-[18px]" />, label: t("chrome.discord"),
          onSelect: () => openExternalUrl(libraryDiscordInviteUrl),
        },
        { id: "support", label: t("support.title"), active: pane === "support",
          indicator: unreadReplies + inboxPending > 0 ? <span className="map-it-unread" aria-label={t("support.newReply")} /> : undefined,
          onSelect: () => onChange("support") },
        { id: "account", label: t("account.account"), active: pane === "account", onSelect: () => onChange("account") },
      ]}
    />
  );
}
