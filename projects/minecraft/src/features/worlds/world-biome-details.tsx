import { useTranslation } from "react-i18next";
import type { BiomeCanvasSelection } from "../generation/biome-canvas";

const WorldBiomeDetails = ({ selection, registryId, color }: {
  selection: Readonly<BiomeCanvasSelection>; registryId: string | null; color: string;
}) => {
  const { t } = useTranslation();
  return <div data-biome-detail className="space-y-3">
    <div className="flex items-center gap-3 rounded-[var(--radius-md)] border border-border bg-white/5 p-3">
      <span className="h-9 w-9 shrink-0 rounded-[var(--radius-md)] border border-white/30" style={{ backgroundColor: color }} aria-hidden="true" />
      <div className="min-w-0 text-xs leading-5 text-zinc-200">
        <p className="tabular-nums">{t("biomeMap.sampleCoordinates", { x: selection.x, y: selection.y, z: selection.z })}</p>
        <p>{t("biomeMap.sampleScale", { scale: selection.scale })}</p>
      </div>
    </div>
    <dl className="rounded-[var(--radius-md)] border border-border bg-white/5 p-3 text-xs leading-5">
      <dt className="font-semibold text-zinc-100">{t("biomeMap.registryIdentity")}</dt>
      <dd className="break-all text-zinc-300">{registryId ?? t("biomeMap.unmappedIdentity")}</dd>
      <dt className="mt-2 font-semibold text-zinc-100">{t("biomeMap.engineIdentity")}</dt>
      <dd className="tabular-nums text-zinc-300">{selection.biomeId}</dd>
    </dl>
  </div>;
};

export default WorldBiomeDetails;
