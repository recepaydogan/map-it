// Local visual fixture: real UI components with an isolated subscription state.
// No checkout or account requests are made; this is never part of the app build.
import { build } from 'esbuild';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(process.argv[2] || '.');
const namedProfile = process.argv.includes('--named-profile');
const directory = path.join(root, 'artifacts/subscription-ui/preview');
await mkdir(directory, { recursive: true });
const buildHtml = await readFile(path.join(root, 'dist/index.html'), 'utf8');
const cssFiles = [...buildHtml.matchAll(/href="([^"]+\.css)"/g)].map(match => match[1].replace(/^\//, ''));
const fixture = `
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './src/i18n/locales/en.json';
import ${namedProfile ? '{ ProfileView }' : 'ProfileView'} from './src/features/account/profile-view';
${namedProfile ? '' : "import SettingsPage from './src/features/settings/settings-overlay';"}
import SubscriptionSettings from './src/features/subscriptions/subscription-settings';
import PremiumPlansPanel from './src/features/subscriptions/premium-plans-panel';
import ${namedProfile ? '{ OverwolfAdRail }' : 'OverwolfAdRail'} from './src/components/ads/overwolf-ad-rail';
await i18n.use(initReactI18next).init({ lng: 'en', fallbackLng: 'en', resources: { en: { translation: en } }, interpolation: { escapeValue: false } });
const user = { id:'preview', email:'explorer@example.com', displayName:'Explorer', createdAt:'2026-11-01T12:00:00Z' };
function Preview() {
  const [page, setPage] = useState('profile');
  const [plans, setPlans] = useState(false);
  const open = () => setPlans(true);
  return <main style={{height:'100vh',display:'flex',flexDirection:'column',background:'#0e0c0a',color:'#f1ebdd'}}>
    <nav style={{height:40,display:'flex',gap:20,padding:'0 24px',alignItems:'center'}}>
      {['profile','settings','ads'].map(value => <button key={value} onClick={() => {setPage(value);setPlans(false)}}>{value}</button>)}
      <span style={{marginLeft:'auto'}}>Component preview · no payments</span>
    </nav>
    <div style={{display:'flex',flex:1,minHeight:0}}>
      <section style={{position:'relative',flex:1,minWidth:0,overflow:'hidden',padding:page==='profile'?24:0}}>
        {page === 'profile' && <ProfileView user={user} onViewPlans={open} />}
        {page === 'settings' && ${namedProfile ? '<div style={{maxWidth:672,margin:"24px auto"}}><SubscriptionSettings onViewPlans={open} /></div>' : '<SettingsPage onNavigateMap={() => setPage("ads")} onViewPlans={open} />'}}
        {page === 'ads' && <div style={{padding:24}}>Map content area</div>}
        {plans && <PremiumPlansPanel preview onClose={() => setPlans(false)} />}
      </section>
      {page === 'ads' && <OverwolfAdRail preview onRemoveAds={open} />}
    </div>
  </main>;
}
createRoot(document.getElementById('root')).render(<Preview />);
`;
await build({
  absWorkingDir: root,
  stdin: { contents: fixture, loader: 'tsx', resolveDir: root },
  bundle: true, format: 'esm', jsx: 'automatic', outfile: path.join(directory, 'fixture.js'),
  loader: { '.webp':'dataurl', '.png':'dataurl', '.svg':'dataurl' },
  define: { 'import.meta.env':'{}', 'process.env.NODE_ENV':'"development"' },
  plugins: [{ name:'isolated-preview-state', setup(api) {
    api.onResolve({ filter:/subscription-runtime$/ }, () => ({path:'runtime',namespace:'fixture'}));
    api.onResolve({ filter:/\/(?:i18n|i18n\/index)$/ }, () => ({path:'i18n',namespace:'fixture'}));
    api.onLoad({ filter:/.*/, namespace:'fixture' }, args => ({
      resolveDir:root,
      contents:args.path==='i18n' ? "export { default } from 'i18next';" : `
        const state = { status:'ready',identity:{name:'Explorer',uuid:'preview',extensionId:'preview'}, packages:[],subscriptions:[],premium:false,activeSubscription:null,activeTier:null,checking:false,checkoutPending:false,checkedAt:null,error:null };
        export const SUBSCRIPTIONS_ENABLED = true;
        export const useSubscription = () => state;
        export const useSubscriptionLifecycle = () => {};
        export const subscriptions = { refresh:async()=>{},purchase:async()=>{},getSnapshot:()=>state,subscribe:()=>()=>{} };
      `,
    }));
  }}],
});
const links = cssFiles.map(name => `<link rel="stylesheet" href="/dist/${name}">`).join('');
await writeFile(path.join(directory,'index.html'),`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Subscription component preview</title>${links}<link rel="stylesheet" href="./fixture.css"></head><body><div id="root"></div><script type="module" src="./fixture.js"></script></body></html>`);
console.log('Preview written to artifacts/subscription-ui/preview/index.html');
