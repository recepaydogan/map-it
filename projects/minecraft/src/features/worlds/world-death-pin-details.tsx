import { Copy, Crosshair } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { formatGameTeleportCommand } from "../../game-config";
import type { WorldPin } from "./world-types.ts";

/** Read-only coordinates and map actions inside the shared location inspector. */
const WorldDeathPinDetails = ({ pin, onCenter }: { pin: WorldPin; onCenter: () => void }) => {
  const { t } = useTranslation();
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(formatGameTeleportCommand(pin));
      setCopyState("copied");
    } catch (error) { console.error("Death location coordinate copy failed", error); setCopyState("failed"); }
  };
  return <div className="space-y-3">
    <div className="grid grid-cols-4 gap-2">
      {([ ["X", pin.x], ["Y", pin.y ?? "—"], ["Z", pin.z] ] as const).map(([axis, value]) => <div key={axis}
        className="flex min-h-11 min-w-0 flex-col items-center justify-center rounded-[var(--radius-md)] border border-border bg-white/5 px-1.5 py-1.5 text-center">
        <span className="text-[9px] font-semibold uppercase tracking-wider text-zinc-400">{axis}</span>
        <span className="max-w-full truncate font-mono text-[11px] font-semibold tabular-nums text-zinc-100">{value}</span>
      </div>)}
      <button type="button" data-inspector-focus="copy" onClick={() => { void copy(); }}
        title={t(pin.y === null ? "structureMap.copy" : "structureMap.copyXyz")}
        className="flex min-h-11 min-w-0 cursor-pointer items-center justify-center gap-1 rounded-[var(--radius-md)] border border-border bg-white/5 px-1.5 py-2 text-[11px] font-semibold text-zinc-200 hover:bg-white/10">
        <Copy size={13} className="shrink-0" aria-hidden="true" /><span className="truncate">{t(pin.y === null ? "structureMap.copy" : "structureMap.copyXyz")}</span>
      </button>
    </div>
    {copyState !== "idle" && <p role="status" className="text-xs text-zinc-100">{t(`structureMap.${copyState}`)}</p>}
    <button type="button" data-inspector-focus="center" onClick={onCenter}
      className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-md)] border border-border bg-white/5 px-3 py-2 text-xs font-semibold text-zinc-200 hover:bg-white/10">
      <Crosshair size={15} aria-hidden="true" />{t(pin.y === null ? "structureMap.center" : "structureMap.centerOccurrence")}
    </button>
  </div>;
};

export default WorldDeathPinDetails;
