import { useTranslation } from "react-i18next";

/** Shared found/total presentation for category rows and group summaries. */
const MapCompletionCount = ({ found, total }: { found: number; total: number }) => {
  const { i18n } = useTranslation();
  return <>
    <span className={found > 0 ? "font-semibold text-success-text" : undefined}>{found.toLocaleString(i18n.language)}</span>
    <span className="text-subtle"> / </span>
    {total.toLocaleString(i18n.language)}
  </>;
};

export default MapCompletionCount;
