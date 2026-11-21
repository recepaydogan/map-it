import { useTranslation } from "react-i18next";
import manifest from "../../../public/manifest.json" with { type: "json" };

export default function AppVersionLabel() {
  const { t } = useTranslation();
  const { version } = manifest.meta;
  return <span className="mr-2 shrink-0 self-center whitespace-nowrap text-xs tabular-nums text-zinc-400"
    title={t("updates.version", { version })}>v{version}</span>;
}
