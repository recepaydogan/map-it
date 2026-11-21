# Elden Ring save position reader

Read-only .NET Framework x64 Overwolf plugin. It opens only the standard PC
`%APPDATA%/EldenRing/*/ER0000.sl2` files with read/write/delete sharing and never
writes saves or accesses game memory. Every nonempty character slot is MD5
validated; partial writes are retried. Parsing is bounded and rejects unknown
versions above the locally verified version 262.

Binary layout reference: https://github.com/Hapfel1/elden-ring-save-parser-lib
(MIT, copyright Hapfel). The minimal parser independently walks the documented
structures, skipping unrelated data. Dynamic array/block lengths are bounded.
Do not replace this walk with a fixed coordinate offset: inventory and world
state lengths differ between characters and saves.

Character selection is explicit when ambiguous. A single changed slot identifies
the active character after a subsequent save. File modification time is not a
per-character timestamp; the UI calls it the save-file update time.

Coordinates and header map IDs can disagree during a transition. The frontend
suppresses that sample until they agree. Unsupported interior transforms hide
the marker instead of projecting it using an assumed origin.

Build: `npm run build:save-reader`. The source hash in the DLL filename avoids
overwriting a plugin currently loaded by Overwolf. Reload the unpacked extension
after adding/updating a native plugin.
