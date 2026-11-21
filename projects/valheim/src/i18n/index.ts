import { SUBSCRIPTION_LOCALE_CONFIG } from "../features/subscriptions/subscription-config";
import { startSubscriptionTranslations } from "./subscription-translations";
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import ru from './locales/ru.json'
import zhHans from './locales/zh-Hans.json'
import ptBR from './locales/pt-BR.json'
import { PREFERENCES_CHANGED_EVENT, readPreferences } from '../store/preferences'

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ru: { translation: ru }, 'zh-Hans': { translation: zhHans }, 'pt-BR': { translation: ptBR } },
  lng: readPreferences().language,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

const syncLanguage = () => {
  const language = readPreferences().language
  if (i18n.language !== language) void i18n.changeLanguage(language)
  document.documentElement.lang = language
}

syncLanguage()
window.addEventListener('storage', syncLanguage)
window.addEventListener(PREFERENCES_CHANGED_EVENT, syncLanguage)

startSubscriptionTranslations(i18n, SUBSCRIPTION_LOCALE_CONFIG);

export default i18n

