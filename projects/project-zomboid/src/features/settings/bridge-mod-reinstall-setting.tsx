import { Check, LoaderCircle, RotateCcw, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { retryBundledBridgeModInstallation } from "../live-bridge/bridge-mod-installer";

type ReinstallState = "idle" | "installing" | "success" | "error";

const BridgeModReinstallSetting = ({ focusOnMount = false }: { focusOnMount?: boolean }) => {
  const { t } = useTranslation();
  const [state, setState] = useState<ReinstallState>("idle");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = rootRef.current;
    if (!node || !focusOnMount) return;
    node.scrollIntoView({ block: "center" });
    node.focus({ preventScroll: true });
  }, [focusOnMount]);

  const reinstall = async () => {
    setState("installing");
    try {
      const status = await retryBundledBridgeModInstallation();
      setState(status ? "success" : "error");
    } catch (error) {
      console.error("[LiveBridge] Manual Bridge mod reinstall failed.", error);
      setState("error");
    }
  };

  const statusText = state === "success"
    ? t("settings.bridgeReinstallSuccess")
    : state === "error"
      ? t("settings.bridgeReinstallError")
      : t("settings.bridgeReinstallDesc");

  return (
    <div
      id="bridge-mod-reinstall"
      ref={rootRef}
      tabIndex={-1}
      className="flex scroll-m-6 items-center justify-between gap-4 px-4 py-4 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
    >
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-white">{t("settings.bridgeReinstall")}</p>
        <p aria-live="polite" className="mt-0.5 flex items-center gap-1.5 text-[12px] leading-relaxed text-muted">
          {state === "success" && <Check size={13} className="shrink-0 text-success-text" aria-hidden="true" />}
          {state === "error" && <TriangleAlert size={13} className="shrink-0 text-danger-text" aria-hidden="true" />}
          {statusText}
        </p>
      </div>
      <button
        type="button"
        onClick={() => void reinstall()}
        disabled={state === "installing"}
        className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-[var(--radius-md)] border border-accent/30 bg-accent-soft px-3 py-2 text-[12.5px] font-semibold text-accent transition-colors hover:bg-accent/15 disabled:cursor-wait disabled:text-white/70"
      >
        {state === "installing"
          ? <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />
          : <RotateCcw size={14} aria-hidden="true" />}
        {state === "installing" ? t("settings.bridgeReinstalling") : t("settings.bridgeReinstallAction")}
      </button>
    </div>
  );
};

export default BridgeModReinstallSetting;
