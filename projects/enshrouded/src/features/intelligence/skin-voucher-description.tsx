import { useTranslation } from "react-i18next";
import { useIntelligenceData } from "../reference/use-reference-data";
import type { SkinData } from "./intelligence-types";

export default function SkinVoucherDescription({ itemId }: { itemId: string }) {
  const { t } = useTranslation();
  const state = useIntelligenceData<SkinData>("skins");
  const skins = state.status === "ready" ? state.data.skins.filter(s => s.items.some(i => i.id === itemId)) : [];
  return <section className="max-w-[760px] space-y-2 border-l-2 border-accent/40 pl-3">
    <p className="text-[13px] leading-relaxed text-zinc-200">{t("intel.skins.voucherExplanation")}</p>
    {skins.length > 0 && <p className="text-[13px] text-accent">{t("intel.skins.unlocksNamed", { name: skins.map(s => s.name).join(", ") })}</p>}
    {state.status === "error" && <p role="alert" className="text-xs text-danger-text">{t("reference.error")}</p>}
  </section>;
}
