import assert from 'node:assert/strict';
import test from 'node:test';
import { createSubscriptionTranslationLoader } from '../../i18n/subscription-translations.ts';

const config = { origin: 'https://example.com', slug: 'app', languages: ['en', 'de'] };
const english = { premiumPlans: { choosePlan: 'Choose {{plan}}' }, subscriptionSettings: { title: 'Subscription' }, ads: { removeAds: 'Remove ads' } };
const fingerprint = 'a'.repeat(24);

test('language-only CDN deduplicates requests and ignores unrelated keys', async () => {
  const requests = [];
  const load = createSubscriptionTranslationLoader(config, english, async url => {
    requests.push(url);
    return url.endsWith('current.json') ? { version: 1, fingerprint }
      : { premiumPlans: { choosePlan: '{{plan}} auswählen' }, map: { title: 'Unrelated' } };
  });
  const [first, second] = await Promise.all([load('de'), load('de')]);
  assert.equal(first, second);
  assert.deepEqual(first, { premiumPlans: { choosePlan: '{{plan}} auswählen' } });
  assert.deepEqual(requests, [`https://example.com/locales/app/subscriptions/current.json`, `https://example.com/locales/app/subscriptions/${fingerprint}/de.json`]);
  await assert.rejects(load('../unexpected'));
  assert.equal(requests.length, 2);
});

test('malformed channels and incompatible interpolation cannot replace bundled text', async () => {
  const badChannel = createSubscriptionTranslationLoader(config, english, async () => ({ version: 1, fingerprint: '../outside' }));
  await assert.rejects(badChannel('de'), /Invalid subscription locale channel/);
  const badText = createSubscriptionTranslationLoader(config, english, async url => url.endsWith('current.json')
    ? { version: 1, fingerprint } : { premiumPlans: { choosePlan: 'Choose {{other}}' } });
  await assert.rejects(badText('de'), /placeholders/);
});
