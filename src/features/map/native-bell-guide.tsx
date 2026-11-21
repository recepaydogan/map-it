import { useTranslation } from "react-i18next";
import DatabaseSectionTitle from "../database/database-section-title";
import NativeRichText from "../reference/native-rich-text";
import { useNativeJson } from "../reference/use-native-wiki";

type BellGuide = { paragraphs: { key:string; text:string }[]; craneParagraph: {text:string}; craneBellEvidence: Record<string,unknown[]> };
export default function NativeBellGuide({ bellId }: {bellId:string}) {
  const { t } = useTranslation();
  const state = useNativeJson<BellGuide>("data/wiki/bell-guide.json");
  if (state.status !== "ready") return <p className="text-xs text-subtle" role={state.status === "error" ? "alert" : "status"}>{t(state.status === "error" ? "reference.error" : "reference.loading")}</p>;
  return <section className="native-bell-guide">
    <DatabaseSectionTitle>{t("wiki.marker.bellUse")}</DatabaseSectionTitle>
    <div className="space-y-3 text-[13px] leading-relaxed text-zinc-200">
      {state.data.paragraphs.map(row => <p key={row.key}><NativeRichText value={row.text} /></p>)}
      {Object.keys(state.data.craneBellEvidence).some(id => id.toLowerCase() === bellId.toLowerCase()) && <p><NativeRichText value={state.data.craneParagraph.text} /></p>}
    </div>
  </section>;
}
