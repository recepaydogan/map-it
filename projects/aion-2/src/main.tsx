import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import { App } from "./app";
import { GAME_CONFIG } from "./game-config";
import "./i18n";
import "./index.css";
import { installAssetExportBlockers } from "./utils/disableAssetExport";

installAssetExportBlockers();
document.title = GAME_CONFIG.appName;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
