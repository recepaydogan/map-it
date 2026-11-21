import AppLibrary from "./features/app-library/app-library";
import AppModuleFrame from "./features/app-library/app-module-frame";
import { findMapGame } from "./features/app-library/app-selection";

export const App = () => {
  const params = new URLSearchParams(window.location.search);
  const app = findMapGame(params.get("app"));
  const surface = params.get("surface") || "main";
  return app && surface !== "main" ? <div className="h-full w-full"><AppModuleFrame app={app} surface={surface} /></div> : <AppLibrary />;
};

export default App;
