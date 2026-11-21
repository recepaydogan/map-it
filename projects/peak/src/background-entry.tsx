import { createRoot } from "react-dom/client";
import { BackgroundController } from "./background/background-controller";
import "./index.css";

createRoot(document.getElementById("root")!).render(<BackgroundController />);
