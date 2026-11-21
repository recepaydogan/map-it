import { useTranslation } from "react-i18next";
import CategoryDropdown from "../../components/category-dropdown";
import { setAppLanguage, useAppLanguage } from "../../i18n/app-language";
import { APP_LANGUAGES } from "../../i18n/language-order";

const LanguageSetting = () => {
  const { t } = useTranslation();
  const language = useAppLanguage();
  return <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-4 py-4">
    <label htmlFor="app-language" className="text-[13px] font-medium text-white">{t("settings.language")}</label>
    <div className="w-full min-w-0 sm:w-60"><CategoryDropdown id="app-language" ariaLabel={t("settings.language")} value={language} onChange={setAppLanguage}
      options={APP_LANGUAGES.map(option => ({ key: option.code, label: option.name }))} /></div>
  </div>;
};
export default LanguageSetting;
