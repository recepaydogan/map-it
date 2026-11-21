import type { i18n as I18n } from 'i18next';

export const SUBSCRIPTION_TRANSLATION_SECTIONS = ['premiumPlans', 'subscriptionSettings', 'ads'] as const;
export interface SubscriptionLocaleConfig { origin: string; slug: string; languages: readonly string[] }
type Dictionary = { [key: string]: string | Dictionary };

/** Only known text keys with compatible interpolation may override bundled copy. */
function compatible(base: Dictionary, candidate: unknown): Dictionary {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) throw new Error('Invalid subscription translations');
  const result: Dictionary = {};
  for (const [key, original] of Object.entries(base)) {
    if (!Object.hasOwn(candidate, key)) continue;
    const value = (candidate as Record<string, unknown>)[key];
    if (typeof original === 'string') {
      if (typeof value !== 'string' || !value.trim()) throw new Error('Invalid translated text');
      const tokens = (text: string) => JSON.stringify((text.match(/{{\s*\w+\s*}}/g) ?? []).sort());
      if (tokens(value) !== tokens(original)) throw new Error('Invalid translation placeholders');
      result[key] = value;
    } else result[key] = compatible(original, value);
  }
  return result;
}

async function download(url: string): Promise<unknown> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 8000);
  try {
    const response = await fetch(url, { signal: abort.signal, ...(url.endsWith('/current.json') ? { cache: 'no-store' as const } : {}) });
    if (!response.ok) throw new Error(`Subscription translations: HTTP ${response.status}`);
    return await response.json();
  } finally { clearTimeout(timer); }
}

export function createSubscriptionTranslationLoader(config: SubscriptionLocaleConfig, english: Dictionary,
  fetchJson: (url: string) => Promise<unknown> = download) {
  const prefix = `${config.origin}/locales/${config.slug}/subscriptions`;
  const baseline = Object.fromEntries(SUBSCRIPTION_TRANSLATION_SECTIONS.map(key => [key, english[key]])) as Dictionary;
  let release: Promise<string> | undefined;
  const requests = new Map<string, Promise<Dictionary>>();
  return (language: string): Promise<Dictionary> => {
    if (!config.languages.includes(language)) return Promise.reject(new Error('Unsupported subscription language'));
    let request = requests.get(language);
    if (!request) {
      release ??= fetchJson(`${prefix}/current.json`).then(channel => {
        if (!channel || typeof channel !== 'object' || !('version' in channel) || channel.version !== 1 ||
          !('fingerprint' in channel) || typeof channel.fingerprint !== 'string' || !/^[a-f0-9]{24}$/.test(channel.fingerprint)) {
          throw new Error('Invalid subscription locale channel');
        }
        return `${prefix}/${channel.fingerprint}`;
      });
      request = release.then(base => fetchJson(`${base}/${language}.json`)).then(pack => compatible(baseline, pack));
      requests.set(language, request);
    }
    return request;
  };
}

/** Bundled strings render immediately and remain usable if the CDN is unavailable. */
export function startSubscriptionTranslations(i18n: I18n, config: SubscriptionLocaleConfig) {
  const load = createSubscriptionTranslationLoader(config, i18n.getResourceBundle('en', 'translation') as Dictionary);
  const requested = new Set<string>();
  const refresh = (language: string) => {
    if (!config.languages.includes(language) || requested.has(language)) return;
    requested.add(language);
    void load(language).then(pack => {
      i18n.addResourceBundle(language, 'translation', pack, true, true);
      if (i18n.language === language) void i18n.changeLanguage(language);
    }).catch(() => {
      console.info('[Subscriptions] Using bundled translations; CDN refresh unavailable.');
    });
  };
  i18n.on('languageChanged', refresh);
  refresh('en');
  refresh(i18n.language);
}
