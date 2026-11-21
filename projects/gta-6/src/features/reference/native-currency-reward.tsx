import { useTranslation } from "react-i18next";
import { contentUrl } from "../../lib/content-url";
import nativeMapIcons from "../map/native-map-icons.json";

export default function NativeCurrencyReward({ amount }: {
  amount?: { min: number; max: number };
}) {
  const { t, i18n } = useTranslation();
  const number = (value: number) => value.toLocaleString(i18n.language);
  return <div className="native-currency-reward flex min-h-14 items-center gap-2.5 rounded-[var(--radius-md)] border border-border px-3 py-2.5">
    <span className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)] border border-border"><img src={contentUrl(nativeMapIcons.dust)} width={32} height={32} alt="" aria-hidden="true" className="object-contain" /></span>
    <p className="min-w-0 flex-1 text-[12px] font-medium leading-4 text-zinc-100">{t("wiki.creatureLoot.dust")}</p>
    <span className="shrink-0 text-[12px] tabular-nums text-zinc-200">{amount
      ? amount.min === amount.max ? number(amount.min) : `${number(amount.min)}–${number(amount.max)}`
      : t("wiki.marker.varies")}</span>
  </div>;
}
