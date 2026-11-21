# Project Zomboid Map Bridge

This optional Build 42 client mod writes the local player's X, Y and Z
coordinates and opened-container snapshots under
`Zomboid/Lua/PZInteractiveMap`. The Overwolf app reads those small local files
and never requires a localhost server or gameplay automation.

## Install

1. Copy the `ProjectZomboidInteractiveMap` folder into `Zomboid/mods` in the
   current Windows user profile.
2. Enable **Project Zomboid Map Bridge** in the game's Mods menu.
3. Start or reload a save. The map switches from manual reference mode to live
   position automatically.

If the mod is disabled, unavailable on a multiplayer server or incompatible
with a future game build, every manual map feature continues to work.
