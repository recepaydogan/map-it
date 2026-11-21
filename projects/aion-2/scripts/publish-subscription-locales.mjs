// Publishes only subscription UI translations; never uploads app/game assets.
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { loadEnv } from 'vite';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { SUBSCRIPTION_LOCALE_CONFIG as config } from '../src/game-config.ts';

const mode = process.argv[2];
if (!['--dry-run', '--upload'].includes(mode)) throw new Error('Use --dry-run or --upload');
const root = path.resolve(import.meta.dirname, '..');
const env = loadEnv('production', root, '');
const prefix = `locales/${config.slug}/subscriptions`;
const sections = ['premiumPlans', 'subscriptionSettings', 'ads'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const files = [];
const english = JSON.parse(await readFile(path.join(root, 'src/i18n/locales/en.json'), 'utf8'));
function validate(base, translated, key) {
  if (typeof base === 'string') {
    if (typeof translated !== 'string' || !translated.trim()) throw new Error(`Missing translation: ${key}`);
    const tokens = value => JSON.stringify((value.match(/{{\s*\w+\s*}}/g) ?? []).sort());
    if (tokens(base) !== tokens(translated)) throw new Error(`Invalid placeholders: ${key}`);
    return;
  }
  if (!translated || typeof translated !== 'object' || Array.isArray(translated)) throw new Error(`Missing section: ${key}`);
  for (const [child, value] of Object.entries(base)) validate(value, translated[child], `${key}.${child}`);
}
for (const language of config.languages) {
  const locale = JSON.parse(await readFile(path.join(root, 'src/i18n/locales', `${language}.json`), 'utf8'));
  const pack = Object.fromEntries(sections.map(section => {
    validate(english[section], locale[section], `${language}.${section}`);
    return [section, locale[section]];
  }));
  const body = JSON.stringify(pack);
  files.push({ language, body, sha256: hash(body), bytes: Buffer.byteLength(body) });
}
const fingerprint = hash(files.map(file => `${file.language}:${file.sha256}`).sort().join('\n')).slice(0, 24);
const manifest = { version: 1, slug: config.slug, fingerprint, sections,
  files: files.map(({ language, sha256, bytes }) => ({ key: `${prefix}/${fingerprint}/${language}.json`, sha256, bytes })) };
const artifactDir = path.join(root, 'artifacts/subscription-ui');
await mkdir(artifactDir, { recursive: true });
await writeFile(path.join(artifactDir, 'locale-publish-plan.json'), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ mode, slug: config.slug, fingerprint, files: files.length, bytes: files.reduce((sum, file) => sum + file.bytes, 0), prefix, sections }));
if (mode === '--upload') {
  for (const key of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET']) {
    if (!env[key]?.trim()) throw new Error(`Missing ${key}`);
  }
  const origin = new URL(config.origin).origin;
  const configuredOrigin = env.R2_PUBLIC_ORIGIN || env.ASSET_CDN_ORIGIN;
  if (new URL(configuredOrigin).origin !== origin) throw new Error('Locale origin does not match configured bucket origin');
  const pointerUrl = `${origin}/${prefix}/current.json`;
  const previous = await fetch(`${pointerUrl}?before=${Date.now()}`, { cache: 'no-store' });
  if (previous.ok) await writeFile(path.join(artifactDir, 'locale-channel-before.json'), await previous.text());
  else if (previous.status !== 404) throw new Error(`Cannot read current channel: HTTP ${previous.status}`);
  const client = new S3Client({ region: 'auto', endpoint: env.R2_ENDPOINT || `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY }, requestChecksumCalculation: 'WHEN_REQUIRED' });
  const put = (key, body, cache) => {
    if (!key.startsWith(`${prefix}/`) || !key.endsWith('.json')) throw new Error('Refusing upload outside subscription language prefix');
    return client.send(new PutObjectCommand({ Bucket: env.R2_BUCKET, Key: key, Body: body, ContentType: 'application/json; charset=utf-8', CacheControl: cache }));
  };
  try {
    for (const file of files) {
      const key = `${prefix}/${fingerprint}/${file.language}.json`;
      await put(key, file.body, 'public, max-age=31536000, immutable');
      const response = await fetch(`${origin}/${key}`, { headers: { Origin: 'http://127.0.0.1' } });
      const body = Buffer.from(await response.arrayBuffer());
      if (!response.ok || hash(body) !== file.sha256 || response.headers.get('access-control-allow-origin') !== '*') {
        throw new Error(`Locale CDN verification failed: ${file.language}`);
      }
    }
    await put(`${prefix}/current.json`, JSON.stringify({ version: 1, fingerprint }), 'no-store');
    const response = await fetch(`${pointerUrl}?verify=${Date.now()}`, { cache: 'no-store', headers: { Origin: 'http://127.0.0.1' } });
    if (!response.ok || (await response.json()).fingerprint !== fingerprint || response.headers.get('access-control-allow-origin') !== '*') throw new Error('Locale channel verification failed');
    await writeFile(path.join(artifactDir, 'locale-published.json'), JSON.stringify({ ...manifest, verifiedAt: new Date().toISOString(), channelUrl: pointerUrl }, null, 2));
    console.log(`Verified language-only channel: ${pointerUrl}`);
  } finally { client.destroy(); }
}
