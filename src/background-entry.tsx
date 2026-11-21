import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import AppLibraryBackground from "./features/app-library/app-library-background";
import "./index.css";
import "./services/auth/shared-account-config";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppLibraryBackground />
  </StrictMode>,
);
