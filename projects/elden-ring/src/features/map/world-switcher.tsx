import { useMapExperience } from "../map-experience/map-experience";
import WorldSwitcherView from "./world-switcher-view";

const WorldSwitcher = () => {
  const { game, setGame, layer, setLayer, layers } = useMapExperience();

  return (
    <WorldSwitcherView
      game={game}
      layer={layer}
      layers={layers}
      onGameChange={setGame}
      onLayerChange={setLayer}
    />
  );
};

export default WorldSwitcher;
