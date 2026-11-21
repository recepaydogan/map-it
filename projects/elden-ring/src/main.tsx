import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
// Self-hosted fonts (bundled by Vite) so the app renders identically offline —
// no CDN round-trip. Only the weights actually used: Inter 400/500/600/700 for
// body, Cinzel 600 for the Grand Archive masthead + item names, Cinzel 700 for
// the engraved region labels on the map.
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/cinzel/600.css";
import "@fontsource/cinzel/700.css";
import "./index.css";
// Initialise i18n before the first render so `useTranslation()` is ready on first
// paint (loads the active language's catalog; English is bundled as the fallback).
import "./i18n";
import { installAssetExportBlockers } from "./utils/disableAssetExport";

installAssetExportBlockers();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
