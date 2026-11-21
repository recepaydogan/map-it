import { ChevronDown, Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import Dropdown, { type DropdownOption } from "../../components/dropdown";
import FlagIcon from "../../components/flag-icon";
import { useLocale } from "../../i18n/use-locale";

/**
 * Language picker. Lists each language by its own endonym next to a real SVG flag
 * (flag emojis don't render on Windows/Overwolf). `compact` renders a flag-only
 * trigger for the title bar; the default full pill is used in Settings. Switching
 * is instant and persisted; the in-game overlay window follows via storage sync.
 */
const LanguageSwitcher = ({ compact = false }: { compact?: boolean }) => {
  const { t } = useTranslation();
  const { language, setLanguage, languages } = useLocale();
  const options: DropdownOption[] = languages.map((l) => ({
    value: l.code,
    label: l.endonym,
    icon: <FlagIcon region={l.region} />,
  }));
  const current = languages.find((l) => l.code === language) ?? languages[0];

  if (compact) {
    return (
      <Dropdown
        value={language}
        options={options}
        onChange={setLanguage}
        align="end"
        trigger={
          <button
            data-tour="language"
            aria-label={t("settings.language")}
            title={current.endonym}
            className="flex h-full items-center gap-1 px-1.5 text-zinc-300 transition-colors hover:bg-white/[0.06] hover:text-white cursor-pointer"
          >
            <FlagIcon region={current.region} className="w-[22px]" />
            <ChevronDown size={13} className="text-zinc-500" aria-hidden="true" />
          </button>
        }
      />
    );
  }

  return <Dropdown icon={Languages} value={language} options={options} onChange={setLanguage} align="end" />;
};

export default LanguageSwitcher;
