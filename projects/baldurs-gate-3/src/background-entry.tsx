import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BackgroundController } from "./background/background-controller";
import { GAME_CONFIG } from "./game-config";
import "./index.css";

document.title = `${GAME_CONFIG.appName} Background`;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BackgroundController />
  </StrictMode>,
);
