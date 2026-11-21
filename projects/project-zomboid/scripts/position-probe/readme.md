# Native position reader

Read-only Java attach reader for Build 42. The existing Bridge remains enabled.
App builds package the reader, launcher and a minimal Java runtime. No separate
Java installation, terminal command or server mod is needed by the app user.
The background controller launches it for an already-running game and new game
sessions. Stdin keepalives tie the launcher to the app; a 20-second lease stops
the in-game worker if the launcher disappears. Failures are logged and retried.
Only the manual probe commands below use the two-minute test limit.

Development builds require a JDK 17 with `java`, `javac`, `jar` and `jlink`.
The build uses `JAVA_HOME`, `.runtime-data/toolchains/jdk-17`, or PATH (in that order).

```powershell
./scripts/position-probe/build-probe.ps1
./scripts/position-probe/test-probe.ps1
# Enter a game world first, then:
./scripts/position-probe/run-probe.ps1
```

Output: `%USERPROFILE%/Zomboid/Lua/PZInteractiveMapNative/position.json`.
The app monitors both feeds and prefers this snapshot whenever it is fresh.
Bridge is used only while native data is unavailable or older than three seconds.
If neither feed is fresh, the live position is cleared until a feed recovers.
Run `watch-probe.ps1` for a 15-minute map test in the same game process.
Check `updatedAt` and the advancing `sequence` to distinguish current samples
from a previous run. `status.txt` reports the worker lifecycle; `error.txt`
records a failed worker. An attach error is returned to the calling shell.

The daemon samples local-player getters every 200 ms for at most 120 seconds.
Create `%USERPROFILE%/Zomboid/Lua/PZInteractiveMapNative/stop` to stop it early. Restarting
the game unloads the agent; stopping sampling does not unload its classes.
No class transformations, coordinate setters or other-player scans are used.
Reads happen on a worker thread, so a coordinate tuple is not a game-tick-atomic
snapshot. The fixture only validates the transport and sampling lifecycle.
Build 42.20.4 attachment, changing multiplayer coordinates and delivery to the
running Overwolf minimap were also observed in a manual test.
