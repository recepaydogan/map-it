"""Extract faction enemies from wiki.gg and placed spawners from an installed Enshrouded 1.0 client.

This writes source snapshots under research/enshrouded-bestiary. It does not publish
inferred monster identities or claim that a spawn is guaranteed in live play.
"""

from __future__ import annotations

import json
import re
import struct
from collections import Counter
from functools import lru_cache
from pathlib import Path

import requests
import zstandard


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "research" / "enshrouded-bestiary"
GAME = Path(r"C:\Program Files (x86)\Steam\steamapps\common\Enshrouded")
API = "https://enshrouded.wiki.gg/api.php"
FACTIONS = {
    "Fell": [
        "Fell Footsoldier", "Fell Berserker", "Fell Ranger", "Fell Banshee",
        "Fell Sporehead", "Fell Knight", "Fell Commander", "Fell Critter",
        "Exploding Fell Critter", "Fell Boar", "Fell Vicious Vine",
        "Fell Mushroom Crab", "Shroud Gazer", "Shroud Flayer", "Shroud Stalker",
        "Shroud Depthdweller", "Fell Draconian Vulture", "Fell Crab",
        "Fell Thunderbrute", "Fell Critter Queen", "Fell Sicklescythe",
        "Fell Monstrosity", "Fell Wispwyvern", "Fell Cyclops",
        "Fell Dragon Youngling",
    ],
    "Scavengers": [
        "Scavenger Scalper", "Scavenger Scrapgun", "Scavenger Berserker",
        "Scavenger Miner", "Scavenger Pyreblade", "Scavenger Matron",
        "Scavenger Gorger", "Scavenger Tyrant",
    ],
    "Vukah": [
        "Vukah Warrior", "Vukah Ranger", "Vukah Shaman", "Vukah Berserker",
        "Vukah Brawler",
    ],
    "Hollow": [
        "Hollow Skeleton", "Hollow Soldier", "Hollow Mage", "Hollow Reaper",
        "Hollow Hound", "Hollow Cyclops",
    ],
    "Drak": [
        "Drak Warrior", "Drak Skirmisher", "Drak Priest", "Drak Chieftan",
        "Hydrak'Dal",
    ],
}


def wiki_sources() -> dict:
    titles = [title for group in FACTIONS.values() for title in group]
    response = requests.get(API, params={
        "action": "query", "prop": "revisions", "rvprop": "content|ids|timestamp",
        "rvslots": "main", "titles": "|".join(titles), "format": "json",
        "formatversion": 2,
    }, headers={"User-Agent": "EnshroudedMapResearch/1.0 (https://github.com/rastudio)"}, timeout=60)
    response.raise_for_status()
    result = response.json()
    if "error" in result:
        raise RuntimeError(result["error"])
    pages = {}
    for page in result["query"]["pages"]:
        if "missing" in page:
            pages[page["title"]] = {"missing": True}
        else:
            revision = page["revisions"][0]
            pages[page["title"]] = {
                "pageId": page["pageid"], "revision": revision["revid"],
                "updatedAt": revision["timestamp"],
                "wikitext": revision["slots"]["main"]["content"],
            }
    return {"source": API, "factions": FACTIONS, "pages": pages}


def native_spawns() -> dict:
    manifest = (GAME.parents[1] / "appmanifest_1203620.acf").read_text(encoding="utf-8")
    build_match = re.search(r'"buildid"\s+"(\d+)"', manifest)
    if not build_match:
        raise RuntimeError("Enshrouded Steam build ID is unavailable")
    index = (GAME / "enshrouded.kfc").read_bytes()
    if index[:4] != b"KFC4":
        raise RuntimeError("Expected KFC4 client resource index")
    resource_file = (GAME / "enshrouded.kfc_resources").open("rb")

    def table(number: int) -> tuple[int, int]:
        field = 16 + 8 * number
        relative, count = struct.unpack_from("<II", index, field)
        return field + relative, count

    keys_at, resource_count = table(10)
    values_at, value_count = table(11)
    chunks_at, chunk_count = table(15)
    if resource_count != value_count:
        raise RuntimeError("KFC key/value counts differ")
    chunks = [struct.unpack_from("<IIIII", index, chunks_at + i * 20)
              for i in range(chunk_count)]

    @lru_cache(maxsize=8)
    def decompress_chunk(i: int) -> bytes:
        offset, _, compressed_size, _, uncompressed_size = chunks[i]
        resource_file.seek(offset)
        return zstandard.ZstdDecompressor().decompress(
            resource_file.read(compressed_size), max_output_size=uncompressed_size)

    def resource(i: int) -> bytes:
        offset, size = struct.unpack_from("<II", index, values_at + i * 8)
        output = bytearray()
        while size:
            chunk_index = offset // 8_388_608
            part = decompress_chunk(chunk_index)
            start = offset - chunks[chunk_index][3]
            taken = min(size, len(part) - start)
            if taken <= 0:
                raise RuntimeError("Invalid KFC resource range")
            output.extend(part[start:start + taken])
            offset += taken
            size -= taken
        return bytes(output)

    names = {}
    scenes = []
    for i in range(resource_count):
        kind = struct.unpack_from("<I", index, keys_at + i * 32 + 16)[0]
        if kind not in (0x39768775, 0xDF08AA5A):
            continue
        data = resource(i)
        if kind == 0x39768775:  # keen::ecs::TemplateResource
            relative, length = struct.unpack_from("<II", data)
            names[index[keys_at + i * 32:keys_at + i * 32 + 16]] = (
                data[relative:relative + length].decode("utf-8", "replace"))
        else:  # keen::SceneEntityChunkResource
            scenes.append((i, data))

    placements = []
    family_counts = Counter()
    for resource_index, data in scenes:
        template_offset, template_count = struct.unpack_from("<II", data, 0)
        entity_offset, entity_count = struct.unpack_from("<II", data, 24)
        templates = [names.get(data[template_offset + j * 16:template_offset + j * 16 + 16])
                     for j in range(template_count)]
        for j in range(entity_count):
            position = 24 + entity_offset + j * 20
            template_index = struct.unpack_from("<H", data, position)[0]
            if template_index >= len(templates):
                raise RuntimeError("Invalid scene template index")
            name = templates[template_index]
            if not name or not (name.startswith((
                "Spawnpoint_POI_Enemy_", "Spawnpoint_Trigger_Enemy_",
                "Spawnpoint_Enemy_Boss_", "Spawnpoint_POI_Wildbeast_",
                "Spawnpoint_Trigger_Wildbeast_",
            )) or re.search(r"dragon|hydra|vorgoth|wyvern|boss", name, re.I)):
                continue
            x, elevation, z = (round(value / 65536, 3)
                               for value in struct.unpack_from("<iii", data, position + 2))
            if not (0 <= x <= 10240 and 0 <= z <= 10240):
                continue
            placements.append({
                "template": name, "x": x, "z": z, "elevation": elevation,
                "sceneResource": resource_index, "sceneEntity": j,
            })
            family_counts[name] += 1
    resource_file.close()
    return {
        "source": str(GAME / "enshrouded.kfc"),
        "gameBuild": build_match.group(1),
        "resourceCount": resource_count, "sceneChunkCount": len(scenes),
        "counts": dict(sorted(family_counts.items())), "placements": placements,
    }


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    wiki_path = OUTPUT / "wiki-source.json"
    sources = json.loads(wiki_path.read_text(encoding="utf-8")) if wiki_path.exists() else wiki_sources()
    wiki_path.write_text(
        json.dumps(sources, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    native = native_spawns()
    (OUTPUT / "native-spawns.json").write_text(
        json.dumps(native, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Wiki: {sum('wikitext' in page for page in sources['pages'].values())}/{sum(map(len, FACTIONS.values()))} pages")
    print(f"Native: {len(native['placements'])} placed enemy/wildbeast spawners")


if __name__ == "__main__":
    main()
