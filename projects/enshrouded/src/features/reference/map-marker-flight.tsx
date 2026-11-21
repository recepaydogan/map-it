import { useTranslation } from "react-i18next";
import { MAP_FLIGHT_RING_EFFECTS } from "../map/map-config";

const MapMarkerFlight = ({ referenceId }: { referenceId?: string }) => {
  const { t } = useTranslation();
  const effect = referenceId ? MAP_FLIGHT_RING_EFFECTS[referenceId] : undefined;
  const facts = effect ? [
    { label: "map.flightRing.flightSpeed", value: t("map.flightRing.increasePercent", { value: effect.flightSpeedIncreasePercent }) },
    { label: "map.flightRing.flightPowerUse", value: t("map.flightRing.decreasePercent", { value: effect.flightPowerCostReductionPercent }) },
    { label: "map.flightRing.boostDuration", value: t("map.flightRing.seconds", { value: effect.durationSeconds }) },
    { label: "map.flightRing.flightPowerRestored", value: t("map.flightRing.percent", { value: effect.flightPowerRecoveryPercent }) },
  ] : [];

  return <section className="mt-4 space-y-3 border-t border-border pt-4">
    <p className="text-[13px] leading-relaxed text-zinc-300">{t("map.flightRing.description")}</p>
    {facts.length > 0 && <dl className="divide-y divide-border/50 rounded-[var(--radius-sm)] border border-border bg-surface px-3">
      {facts.map(({ label, value }) => <div key={label} className="flex items-center justify-between gap-4 py-2 text-[13px]">
        <dt className="text-zinc-400">{t(label)}</dt>
        <dd className="text-right font-medium tabular-nums text-zinc-100">{value}</dd>
      </div>)}
    </dl>}
  </section>;
};

export default MapMarkerFlight;
