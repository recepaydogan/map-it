import { APP_LOCALE_RELEASE, GAME_CONFIG } from "../game-config";
import { CONTENT_BASE_URL, contentUrl } from "../lib/content-url";
import { APP_LOCALE_SOURCE_SHA256 } from "./app-locale-version";
import { fetchLocaleJson, validateAppLocalePack } from "./fetch-locale-json";

const requests = new Map<string, Promise<Record<string, unknown>>>();

export function loadAppLocale(language: string): Promise<Record<string, unknown>> | undefined {
  const directory = GAME_CONFIG.appLocaleDirectory;
  if (!directory || !GAME_CONFIG.supportedAppLanguages.includes(language)) return;
  let request = requests.get(language);
  if (!request) {
    const filename = `${language.toLowerCase()}.json`;
    const path = `${directory}/${filename}`;
    const bundled = `${import.meta.env?.BASE_URL ?? "/"}${path}`;
    const primary = CONTENT_BASE_URL === APP_LOCALE_RELEASE.contentBaseUrl
      ? `${APP_LOCALE_RELEASE.baseUrl}/${filename}`
      : contentUrl(path);
    request = fetchLocaleJson<unknown>(primary, bundled)
      .then(pack => validateAppLocalePack(pack, language, APP_LOCALE_SOURCE_SHA256))
      .catch((error: unknown) => { requests.delete(language); throw error; });
    requests.set(language, request);
  }
  return request;
}
