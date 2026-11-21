import { MousePointer2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { subscribeToCurrentWindowState } from "../../overwolf-utils/window-manager";
import { useInteractionModeBinding } from "./use-interaction-mode-binding";

const KEY = "gm:minimap-cursor-hints";
export const MinimapCursorHint = () => {
  const { t } = useTranslation();
  const binding = useInteractionModeBinding();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    let timer = 0;
    let wasVisible = false;
    const show = () => {
      const count = Number(localStorage.getItem(KEY) ?? 0);
      if (count >= 5) return;
      localStorage.setItem(KEY, String(count + 1));
      setVisible(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setVisible(false), 7000);
    };
    const unsubscribe = subscribeToCurrentWindowState(state => {
      const next = state === "normal" || state === "maximized";
      if (next && !wasVisible) show();
      wasVisible = next;
    });
    if (typeof overwolf === "undefined") show();
    return () => { unsubscribe(); window.clearTimeout(timer); };
  }, []);
  return visible ? <button className="minimap-cursor-hint" type="button" onClick={() => setVisible(false)} aria-label={t("overlay.minimap.dismissHint")}>
    <MousePointer2 size={12} aria-hidden="true" /><span>{binding
      ? t("overlay.minimap.cursorHintWithHotkey", { hotkey: binding })
      : t("overlay.minimap.cursorHint")}</span>
  </button> : null;
};
