import { useTranslation } from "react-i18next";
import { nativeFieldLabel } from "./native-wiki-labels";
import NativeWikiValues from "./native-wiki-values";
import type { NativeWikiEntry } from "./use-native-wiki";

const NativeWikiAttributes = ({ attributes }: { attributes: NonNullable<NativeWikiEntry["attributes"]> }) => {
  const { t } = useTranslation();
  return <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr className="border-b border-border text-subtle"><th scope="col" className="py-2 font-medium">{t("wiki.attribute")}</th><th scope="col" className="px-3 py-2 font-medium">{t("wiki.nativeBase")}</th><th scope="col" className="py-2 font-medium">{t("wiki.scaling")}</th></tr></thead><tbody>{Object.entries(attributes).map(([key, attribute]) => {
    const base = attribute.fields?.Base ?? attribute.native_value;
    const scaling = attribute.fields ? Object.fromEntries(Object.entries(attribute.fields).filter(([key]) => key !== "Base")) : undefined;
    return <tr key={key} className="border-b border-border/60 align-top"><th scope="row" className="py-2 font-normal text-zinc-300">{nativeFieldLabel(key)}</th><td className="px-3 py-2 tabular-nums text-white">{typeof base === "number" || typeof base === "string" ? String(base) : "—"}</td><td className="min-w-32 py-2 text-subtle">{scaling && Object.keys(scaling).length > 0 ? <details><summary className="cursor-pointer hover:text-white">{t("wiki.scalingDetails")}</summary><NativeWikiValues value={scaling} /></details> : "—"}</td></tr>;
  })}</tbody></table></div>;
};
export default NativeWikiAttributes;
