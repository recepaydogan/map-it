import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type PluginOption } from 'vite'

// NitroPay web ads. The Overwolf app monetises through its native ad rail, so
// the loader is injected only into web-build HTML — the OPK never ships it.
const nitropayAds = (): PluginOption => ({
  name: 'nitropay-ads',
  transformIndexHtml() {
    return [
      {
        tag: 'script',
        attrs: { 'data-cfasync': 'false' },
        children:
          'window.nitroAds=window.nitroAds||{createAd:function(){return new Promise(e=>{window.nitroAds.queue.push(["createAd",arguments,e])})},addUserToken:function(){window.nitroAds.queue.push(["addUserToken",arguments])},queue:[]};',
        injectTo: 'head',
      },
      {
        // data-spa="auto": the app is an SPA — Nitro refreshes ads on route changes.
        tag: 'script',
        attrs: {
          'data-cfasync': 'false',
          async: true,
          'data-spa': 'auto',
          src: 'https://s.nitropay.com/ads-2599.js',
        },
        injectTo: 'head',
      },
      {
        // Site-wide bottom anchor unit (Nitro panel placement "atlas-anchor").
        // Transparent container: the anchor is full-width but the creative often is
        // not (320x50 on a wide screen), and the default 80% black strip was a wide
        // dark bar framing a small ad. Transparent leaves only the ad itself.
        tag: 'script',
        children:
          `window['nitroAds'].createAd('atlas-anchor',{"format":"anchor-v2","anchor":"bottom",` +
          `"anchorBgColor":"transparent","anchorClose":true,"anchorPersistClose":true,` +
          `"anchorStickyOffset":0,"mediaQuery":"(min-width: 0px)",` +
          `"report":{"enabled":true,"icon":true,"wording":"Report Ad","position":"top-right"}});`,
        injectTo: 'head',
      },
      // No floating video unit. It was tried (placement "atlas-video") and cut:
      // Nitro pins it to the bottom-right, exactly where the map's zoom/locate
      // controls live, and on a phone it covered them and half the map. The rail
      // already takes video on desktop (outstream: auto); phones keep the anchor.
    ]
  },
})

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const isOverwolfBuild = mode === 'overwolf'
  const input: Record<string, string> = isOverwolfBuild
    ? {
        // The native app has no dependency on the public website shell.
        // All four visible Overwolf windows share this preserved entry.
        app: resolve(__dirname, 'app.html'),
        background: resolve(__dirname, 'background.html'),
        uninstall: resolve(__dirname, 'uninstall.html'),
      }
    : {
        // The website keeps the heavy interactive product behind /map;
        // the root shell is transformed into static SEO pages post-build.
        index: resolve(__dirname, 'index.html'),
        app: resolve(__dirname, 'app.html'),
      }

  return {
    build: {
      // On Windows, Overwolf can keep files in dist/ locked while the app is open.
      // Skipping the outDir wipe avoids EPERM errors during rebuilds. The OPK
      // builder performs its own verified clean before invoking this build.
      emptyOutDir: false,
      rollupOptions: {
        input,
      },
    },
    plugins: [react(), tailwindcss(), ...(isOverwolfBuild ? [] : [nitropayAds()])],
  }
})
