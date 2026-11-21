# Rob Run App

Rob Run App is a desktop and Overwolf map companion for ROB RUN. It uses the WoW Forever Map dashboard, tile renderer, filters, pin storage and overlay windows.

## Run locally

```powershell
npm ci
npm run dev
npm run build:opk
```

The Overwolf build is in `dist/`. Load that folder as an unpacked extension, or use the generated OPK. The overlay and game launch entries use Overwolf game class ID `283181`. The minimap shares the selected map. Player coordinates are currently unavailable through Overwolf Game Events.

## Game data

The local Steam build 26726105 contains native map-view meshes for Looty Bay, Prison, Lenny's Motel, Sales Center and two Settlement variants. The world map uses the client's realm-grid assets. The map views use the authored X/Z axes and include the English district labels from the client strings. The settlement maps are templates.

Looty Bay businesses use the scene's MapBuildingView references and the corresponding localized building descriptions. Loot, doors, cameras, alarms, ATMs and other points are classified by scene components and source actor IDs. Random loot markers show authored points. Actual loot and events depend on the current game session. The heist index summarizes mapped scene interactions and uses individual safe requirements where the scene supplies them.

The catalog combines client item localization with matching inventory sprites. It covers entries that can be verified locally. It does not include a verified current table of server prices, vendor unlocks, barters or random-loot odds.

Install Python dependencies UnityPy 1.25.3 and Pillow, then regenerate from the Steam directory.

    python scripts/extract-rob-run-content.py 'C:/Program Files (x86)/Steam/steamapps/common/Rob Run' --build 26726105

Game data © Kefir.
