import { MapPinOff, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { nrNightlordMeta } from "../../data/nightreign-data";
import { useMapExperience } from "../map-experience/map-experience";
import { NightlordDetail } from "./nightlord-detail";

/**
 * Standalone slide-in panel for the selected Nightlord (Night 3 boss). Mirrors the
 * detail-panel chrome so it docks into the same overlay column, but it carries no map
 * actions: the Nightlord never spawns on the map, so there is nothing to centre on or
 * navigate to. Opened manually or by the GEP boss_fight bridge (overwolf-utils/gep).
 */
const NightlordPanel = () => {
  const { t } = useTranslation();
  const { nightlordDetailOpen, closeNightlordDetail, nightlord } = useMapExperience();
  if (!nightlordDetailOpen) return null;

  const meta = nrNightlordMeta.get(nightlord);

  return (
    <div className="pointer-events-auto flex max-h-full w-90 flex-col overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface/90 backdrop-blur-xl animate-slide-in">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          {t("nightreign.finalNightBoss")}
        </span>
        <button
          onClick={closeNightlordDetail}
          aria-label={t("nightreign.close")}
          className="grid h-7 w-7 place-items-center rounded-[var(--radius-md)] text-zinc-400 transition-colors hover:bg-white/5 hover:text-white cursor-pointer"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        <NightlordDetail name={nightlord} m={meta} />
      </div>

      <footer className="flex items-center gap-2 border-t border-border px-4 py-2.5 text-[11px] text-zinc-500">
        <MapPinOff size={13} className="shrink-0" aria-hidden="true" />
        {t("nightreign.nightlordPanelFooter")}
      </footer>
    </div>
  );
};

export default NightlordPanel;
