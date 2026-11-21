#!/usr/bin/env python3
"""Extract PEAK daily levels, deterministic markers, and real scene maps.

The script reads a locally installed Steam copy of PEAK. It never modifies the
game installation. The generated map images are top-down renders of the active
scene geometry; no game installation files are modified.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import struct
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

try:
    import UnityPy
    import numpy as np
    from PIL import Image, ImageChops, ImageDraw, ImageFilter
    from UnityPy.helpers.MeshHelper import MeshHandler
    from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator
except ImportError as error:
    raise SystemExit(
        "UnityPy is required. Run: py -3 -m pip install -r scripts/peak-data/requirements.txt"
    ) from error


STEAM_APP_ID = 3527290
OVERWOLF_GAME_ID = 26092
ROTATION_ANCHOR_UTC = "2025-06-14T17:00:00Z"
ROTATION_HOURS = 24
BIOME_NAMES = [
    "Shore",
    "Tropics",
    "Alpine",
    "Volcano",
    "Peak",
    "Mesa",
    "Roots",
    "Swamp",
    "Temple",
    "Grasslands",
    "Ocean",
    "Skyblock",
    "Hell",
    "Heaven",
    "Mars",
]

# MonoScript path IDs in globalgamemanagers.assets for PEAK 2.0.a.
# Names are checked at runtime before these IDs are used.
COMPONENT_CATEGORIES = {
    "Luggage": "luggage",
    "Campfire": "campfire",
    "RespawnChest": "scout",
    "Peak.ScoutStatue": "scout",
    "Antlion": "danger",
    "TombTrigger": "tomb",
    "TombCheck": "tomb",
}

# PEAK only ships dedicated 2D UI sprites for some of the scene components we
# expose as atlas markers. Resolve them by asset and sprite name so path ID
# changes between game builds do not leak into the generated catalog.
MARKER_ICON_SOURCES = {
    "campfire": ("sharedassets1.assets", "ScoutCampfire"),
    "scout": ("sharedassets3.assets", "ScoutIcon"),
}
MARKER_TEXTURE_ICON_SOURCES = {
    "nest": ("resources.assets", "NestEggRaven"),
}

UNITY_VERSION = "6000.3.15f1"
RARITY_NAMES = [
    "common",
    "uncommon",
    "rare",
    "epic",
    "legendary",
    "mythic",
    "ridiculously-rare",
]
RARITY_WEIGHTS = [100, 50, 35, 20, 15, 6, 3]
ITEM_TAGS = {
    1: "mystical",
    2: "packaged-food",
    4: "berry",
    8: "mushroom",
    16: "bing-bong",
    32: "gourmand-requirement",
    64: "golden-idol",
    128: "bird",
    256: "book-of-bones",
    512: "scout-amulet",
    1024: "throw-without-torque",
    2048: "non-cloneable",
    4096: "clone-with-offset",
}
LOOT_POOL_NAMES = {
    1024: "shore",
    2048: "tropics",
    4096: "alpine",
    8192: "caldera",
    16384: "climber",
    32768: "ancient",
    65536: "cursed",
    16777216: "mesa",
    67108864: "roots",
    268435456: "gloom",
    536870912: "citadel",
    1073741824: "clown",
}
SPAWN_BIOME_NAMES = {
    0: "Shore",
    1: "Tropics",
    2: "Alpine",
    3: "Volcano",
    4: "Summit",
    6: "Mesa",
    7: "Roots",
    8: "Swamp",
    9: "Temple",
}

MAP_PADDING_PERCENT = 4.0
MAP_SIZE = 8192
RELIEF_SIZE = 2048
EXTERNAL_SURFACE_NAMES = {
    "ground",
    "groundmesh",
    "peak bridge",
    "ramp in",
    "start ramp",
    "wallbottom",
    "wallmesh",
    "walltop",
}


@dataclass(frozen=True)
class TransformState:
    position: tuple[float, float, float]
    rotation: tuple[float, float, float, float]
    scale: tuple[float, float, float]
    active: bool
    hierarchy: tuple[str, ...]


@dataclass
class MaterialStyle:
    base: tuple[float, float, float]
    top: tuple[float, float, float]
    bottom: tuple[float, float, float]
    texture: np.ndarray | None = None
    texture_scale: tuple[float, float] = (1.0, 1.0)
    texture_offset: tuple[float, float] = (0.0, 0.0)


@dataclass
class MapSurface:
    vertices: np.ndarray
    triangles: np.ndarray
    uvs: np.ndarray | None
    material: MaterialStyle


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--game-dir",
        type=Path,
        help="PEAK installation directory. Auto-detected from Steam when omitted.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("artifacts/peak-data/catalog.json"),
        help="Output JSON path.",
    )
    parser.add_argument(
        "--content-only",
        action="store_true",
        help="Reuse existing projections and map images without rendering them again.",
    )
    parser.add_argument(
        "--icons-only",
        action="store_true",
        help="Refresh extracted marker icons without rebuilding the catalog content.",
    )
    parser.add_argument(
        "--item-icons-only",
        action="store_true",
        help="Extract item icons and update only their URLs in an existing catalog.",
    )
    return parser.parse_args()


def parse_vdf_value(text: str, key: str) -> str | None:
    match = re.search(rf'"{re.escape(key)}"\s+"([^"]*)"', text, re.IGNORECASE)
    return match.group(1) if match else None


def steam_roots() -> list[Path]:
    candidates = [
        Path("C:/Program Files (x86)/Steam"),
        Path("C:/Program Files/Steam"),
    ]
    discovered: list[Path] = []
    for steam_root in candidates:
        library_file = steam_root / "steamapps/libraryfolders.vdf"
        if not library_file.is_file():
            continue
        discovered.append(steam_root)
        text = library_file.read_text(encoding="utf-8", errors="replace")
        for raw_path in re.findall(r'"path"\s+"([^"]+)"', text, re.IGNORECASE):
            discovered.append(Path(raw_path.replace("\\\\", "\\")))
    return list(dict.fromkeys(discovered))


def locate_game_dir(explicit: Path | None) -> tuple[Path, Path]:
    if explicit:
        game_dir = explicit.resolve()
        manifest = game_dir.parent.parent / f"appmanifest_{STEAM_APP_ID}.acf"
        if not (game_dir / "PEAK_Data").is_dir():
            raise SystemExit(f"Not a PEAK installation: {game_dir}")
        return game_dir, manifest

    for steam_root in steam_roots():
        manifest = steam_root / "steamapps" / f"appmanifest_{STEAM_APP_ID}.acf"
        if not manifest.is_file():
            continue
        text = manifest.read_text(encoding="utf-8", errors="replace")
        install_dir = parse_vdf_value(text, "installdir") or "PEAK"
        game_dir = steam_root / "steamapps/common" / install_dir
        if (game_dir / "PEAK_Data").is_dir():
            return game_dir.resolve(), manifest.resolve()
    raise SystemExit("PEAK was not found in the configured Steam libraries.")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def align4(offset: int) -> int:
    return (offset + 3) & ~3


def read_int(data: bytes, offset: int) -> tuple[int, int]:
    return struct.unpack_from("<i", data, offset)[0], offset + 4


def read_string(data: bytes, offset: int) -> tuple[str, int]:
    length, offset = read_int(data, offset)
    if length < 0 or offset + length > len(data):
        raise ValueError("Invalid Unity string length")
    value = data[offset : offset + length].decode("utf-8", errors="replace")
    return value, align4(offset + length)


def mono_header(data: bytes) -> tuple[int, int, int, int, str, int] | None:
    if len(data) < 32:
        return None
    game_file_id, game_path_id = struct.unpack_from("<iq", data, 0)
    script_file_id, script_path_id = struct.unpack_from("<iq", data, 16)
    try:
        name, payload_offset = read_string(data, 28)
    except (ValueError, struct.error):
        return None
    return (
        game_file_id,
        game_path_id,
        script_file_id,
        script_path_id,
        name,
        payload_offset,
    )


def load_script_names(game_data: Path) -> dict[int, str]:
    environment = UnityPy.load(str(game_data / "globalgamemanagers.assets"))
    names: dict[int, str] = {}
    for obj in environment.objects:
        if obj.type.name != "MonoScript":
            continue
        script = obj.read()
        namespace = f"{script.m_Namespace}." if script.m_Namespace else ""
        names[obj.path_id] = f"{namespace}{script.m_ClassName}"
    required = set(COMPONENT_CATEGORIES) | {"MapBaker", "LevelGeneration", "BerryBush"}
    missing = sorted(required - set(names.values()))
    if missing:
        raise SystemExit(f"Unsupported PEAK build; missing scripts: {', '.join(missing)}")
    return names


def extract_marker_icons(game_data: Path, output_dir: Path) -> dict[str, str]:
    output_dir.mkdir(parents=True, exist_ok=True)
    icon_paths: dict[str, str] = {}

    for category, (asset_name, sprite_name) in MARKER_ICON_SOURCES.items():
        environment = UnityPy.load(str(game_data / asset_name))
        sprite = None
        for assets_file in list(environment.files.values()):
            for obj in list(assets_file.objects.values()):
                if obj.type.name != "Sprite":
                    continue
                candidate = obj.read()
                if str(candidate.m_Name) == sprite_name:
                    sprite = candidate
                    break
            if sprite is not None:
                break
        if sprite is None:
            raise SystemExit(f"Marker sprite {sprite_name} was not found in {asset_name}")

        icon_output = output_dir / f"{category}.png"
        sprite.image.save(icon_output, "PNG", optimize=True)
        icon_paths[category] = f"./data/peak/icons/{icon_output.name}"

    for category, (asset_name, texture_name) in MARKER_TEXTURE_ICON_SOURCES.items():
        environment = UnityPy.load(str(game_data / asset_name))
        texture = None
        for obj in environment.objects:
            if obj.type.name == "Texture2D" and str(obj.peek_name()) == texture_name:
                texture = obj.read()
                break
        if texture is None:
            raise SystemExit(f"Marker texture {texture_name} was not found in {asset_name}")
        icon_output = output_dir / f"{category}.png"
        texture.image.save(icon_output, "PNG", optimize=True)
        icon_paths[category] = f"./data/peak/icons/{icon_output.name}"

    luggage_output = output_dir / "luggage.png"
    render_prefab_icon(game_data / "resources.assets", "LuggageSmall", luggage_output)
    icon_paths["luggage"] = f"./data/peak/icons/{luggage_output.name}"

    return icon_paths


def load_english_terms(resources_file: Path) -> dict[str, str]:
    environment = UnityPy.load(str(resources_file))
    for obj in environment.objects:
        if obj.type.name != "TextAsset":
            continue
        text_asset = obj.read()
        if str(text_asset.m_Name) != "SerializedTermsData":
            continue
        raw = text_asset.m_Script
        if isinstance(raw, bytes):
            raw = raw.decode("utf-8")
        terms = json.loads(raw)
        return {
            key: str(values[0])
            for key, values in terms.items()
            if values and values[0] is not None
        }
    raise SystemExit("SerializedTermsData was not found in resources.assets")


def localize_term(terms: dict[str, str], key: str, *, item_name: bool = False) -> str:
    candidates = [f"NAME_{key}", key] if item_name else [key, f"NAME_{key}"]
    for candidate in candidates:
        value = terms.get(candidate)
        if value:
            return value
    words = split_camel_case(key).split()
    return " ".join(word[:1].upper() + word[1:] for word in words)


def parse_component(
    obj: Any,
    class_name: str,
    type_tree_generator: Any,
) -> dict[str, Any]:
    node = type_tree_generator.get_nodes_up("Assembly-CSharp.dll", class_name)
    return obj.read_typetree(nodes=node)


def component_classes(
    assets_file: Any,
    game_object_path_id: int,
    script_names: dict[int, str],
) -> dict[str, Any]:
    game_object = assets_file.objects[game_object_path_id].read()
    result: dict[str, Any] = {}
    for component_pair in game_object.m_Component:
        pointer = component_pair.component
        if pointer.file_id != 0:
            continue
        component = assets_file.objects.get(pointer.path_id)
        if not component or component.type.name != "MonoBehaviour":
            continue
        header = mono_header(component.get_raw_data())
        if not header or header[2] != 1:
            continue
        class_name = script_names.get(header[3])
        if class_name:
            result[class_name] = component
    return result


def extract_item_catalog(
    game_dir: Path,
    script_names: dict[int, str],
    type_tree_generator: Any,
    output_dir: Path,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[int, int]]:
    resources_file = game_dir / "PEAK_Data/resources.assets"
    terms = load_english_terms(resources_file)
    environment = UnityPy.load(str(resources_file))
    environment.typetree_generator = type_tree_generator
    assets_file = next(iter(environment.files.values()))

    database_object = None
    for obj in assets_file.objects.values():
        if obj.type.name != "MonoBehaviour":
            continue
        header = mono_header(obj.get_raw_data())
        if header and header[2] == 1 and script_names.get(header[3]) == "ItemDatabase":
            database_object = obj
            break
    if database_object is None:
        raise SystemExit("ItemDatabase was not found in resources.assets")

    database = parse_component(database_object, "ItemDatabase", type_tree_generator)
    item_component_ids = {
        int(pointer["m_PathID"])
        for pointer in database.get("Objects", [])
        if pointer.get("m_FileID") == 0 and pointer.get("m_PathID")
    }
    output_dir.mkdir(parents=True, exist_ok=True)
    prefab_item_ids: dict[int, int] = {}
    items: list[dict[str, Any]] = []

    for component_path_id in sorted(item_component_ids):
        component = assets_file.objects.get(component_path_id)
        if component is None:
            continue
        component_header = mono_header(component.get_raw_data())
        component_class = (
            script_names.get(component_header[3])
            if component_header and component_header[2] == 1
            else None
        )
        if not component_class:
            continue
        item_data = parse_component(component, component_class, type_tree_generator)
        game_object_path_id = int(item_data["m_GameObject"]["m_PathID"])
        components = component_classes(assets_file, game_object_path_id, script_names)
        loot_component = components.get("LootData")
        loot_data = (
            parse_component(loot_component, "LootData", type_tree_generator)
            if loot_component is not None
            else None
        )
        ui_data = item_data["UIData"]
        item_id = int(item_data["itemID"])
        prefab_item_ids[game_object_path_id] = item_id

        icon_path: str | None = None
        icon_pointer = ui_data.get("icon", {})
        if icon_pointer.get("m_FileID") == 0 and icon_pointer.get("m_PathID"):
            texture_object = assets_file.objects.get(int(icon_pointer["m_PathID"]))
            if texture_object is not None:
                try:
                    icon_output = output_dir / f"{item_id}.png"
                    texture_object.read().image.save(icon_output, "PNG", optimize=True)
                    icon_path = f"./data/peak/items/{icon_output.name}"
                except (AttributeError, NotImplementedError, ValueError):
                    icon_path = None

        rarity = int(loot_data["Rarity"]) if loot_data else None
        spawn_locations = int(loot_data["spawnLocations"]) if loot_data else 0
        rarity_overrides = {
            str(int(override["spawnPool"])): RARITY_NAMES[int(override["Rarity"])]
            for override in (loot_data.get("rarityOverrides", []) if loot_data else [])
            if 0 <= int(override["Rarity"]) < len(RARITY_NAMES)
        }
        raw_tags = int(item_data.get("itemTags", 0))
        total_uses = int(item_data.get("totalUses", -1))
        name_key = str(ui_data["itemName"])
        items.append(
            {
                "id": item_id,
                "name": localize_term(terms, name_key, item_name=True),
                "nameKey": name_key,
                "icon": icon_path,
                "weight": int(item_data.get("carryWeight", 0)),
                "mass": round(float(item_data.get("mass", 0)), 2),
                "uses": None if total_uses < 0 else total_uses,
                "tags": [name for flag, name in ITEM_TAGS.items() if raw_tags & flag],
                "primaryAction": localize_term(terms, str(ui_data.get("mainInteractPrompt", "")))
                if ui_data.get("hasMainInteract") and ui_data.get("mainInteractPrompt")
                else None,
                "secondaryAction": localize_term(terms, str(ui_data.get("secondaryInteractPrompt", "")))
                if ui_data.get("hasSecondInteract") and ui_data.get("secondaryInteractPrompt")
                else None,
                "canPocket": bool(ui_data.get("canPocket")),
                "canBackpack": bool(ui_data.get("canBackpack")),
                "canThrow": bool(ui_data.get("canThrow")),
                "baseRarity": RARITY_NAMES[rarity]
                if rarity is not None and 0 <= rarity < len(RARITY_NAMES)
                else None,
                "spawnPools": [
                    str(pool_id)
                    for pool_id in LOOT_POOL_NAMES
                    if spawn_locations & pool_id
                ],
                "rarityOverrides": rarity_overrides,
                "banInSolo": bool(loot_data.get("banInSolo")) if loot_data else False,
            }
        )

    items.sort(key=lambda item: (item["name"].casefold(), item["id"]))
    item_by_id = {int(item["id"]): item for item in items}
    loot_pools: list[dict[str, Any]] = []
    for pool_id, pool_name in LOOT_POOL_NAMES.items():
        pool_items: list[dict[str, Any]] = []
        for item in items:
            if str(pool_id) not in item["spawnPools"]:
                continue
            rarity_name = item["rarityOverrides"].get(str(pool_id), item["baseRarity"])
            if rarity_name not in RARITY_NAMES:
                continue
            weight = RARITY_WEIGHTS[RARITY_NAMES.index(rarity_name)]
            pool_items.append(
                {
                    "itemId": int(item["id"]),
                    "rarity": rarity_name,
                    "weight": weight,
                }
            )
        total_weight = sum(entry["weight"] for entry in pool_items)
        for entry in pool_items:
            raw_percentage = entry["weight"] / total_weight * 100 if total_weight else 0
            entry["chance"] = int(raw_percentage * 10 + 0.5) / 10
        pool_items.sort(
            key=lambda entry: (
                RARITY_NAMES.index(entry["rarity"]),
                item_by_id[entry["itemId"]]["name"].casefold(),
            )
        )
        loot_pools.append(
            {
                "id": str(pool_id),
                "name": pool_name,
                "items": pool_items,
            }
        )

    for obj in assets_file.objects.values():
        if obj.type.name != "MonoBehaviour":
            continue
        header = mono_header(obj.get_raw_data())
        if not header or header[2] != 1 or script_names.get(header[3]) != "SpawnList":
            continue
        spawn_list = parse_component(obj, "SpawnList", type_tree_generator)
        pool_items: list[dict[str, Any]] = []
        for entry in spawn_list.get("items", []):
            item_id = pointer_item_id(entry.get("prefab", {}), prefab_item_ids)
            chance = round(float(entry.get("percentageOdds", 0)), 1)
            if item_id is None or chance <= 0:
                continue
            item = item_by_id[item_id]
            rarity = item["baseRarity"] or "common"
            pool_items.append(
                {
                    "itemId": item_id,
                    "rarity": rarity,
                    "weight": int(entry.get("weight", 0)),
                    "chance": chance,
                }
            )
        if pool_items:
            loot_pools.append(
                {
                    "id": f"spawn-list-{obj.path_id}",
                    "name": "trick",
                    "items": pool_items,
                }
            )
    return items, loot_pools, prefab_item_ids


def find_named_monobehaviour(
    asset_path: Path,
    script_names: dict[int, str],
    class_name: str,
    object_name: str,
) -> bytes:
    environment = UnityPy.load(str(asset_path))
    for obj in environment.objects:
        if obj.type.name != "MonoBehaviour":
            continue
        raw = obj.get_raw_data()
        header = mono_header(raw)
        if not header:
            continue
        _, _, script_file_id, script_path_id, name, _ = header
        if script_file_id == 1 and script_names.get(script_path_id) == class_name and name == object_name:
            return raw
    raise SystemExit(f"{class_name}/{object_name} was not found in {asset_path.name}")


def parse_map_baker(raw: bytes) -> list[dict[str, Any]]:
    header = mono_header(raw)
    if not header:
        raise ValueError("Invalid MapBaker object")
    offset = header[-1] + 40  # SingletonAsset serialized base fields.

    scene_count, offset = read_int(raw, offset)
    scene_paths: list[str] = []
    for _ in range(scene_count):
        value, offset = read_string(raw, offset)
        scene_paths.append(value)

    biome_id_count, offset = read_int(raw, offset)
    biome_ids: list[str] = []
    for _ in range(biome_id_count):
        value, offset = read_string(raw, offset)
        biome_ids.append(value)

    result_count, offset = read_int(raw, offset)
    levels: list[dict[str, Any]] = []
    for level_index in range(result_count):
        biome_count, offset = read_int(raw, offset)
        biome_values: list[int] = []
        for _ in range(biome_count):
            value, offset = read_int(raw, offset)
            biome_values.append(value)

        variant_count, offset = read_int(raw, offset)
        variants: list[str] = []
        for _ in range(variant_count):
            value, offset = read_string(raw, offset)
            variants.append(value)

        notable_variants = [
            split_camel_case(value)
            for value in variants
            if value.casefold() not in {"default", "none", "novariant"}
        ]
        levels.append(
            {
                "index": level_index,
                "number": level_index + 1,
                "scene": Path(scene_paths[level_index]).stem,
                "biomeId": biome_ids[level_index],
                "biomes": [BIOME_NAMES[value] for value in biome_values],
                "variants": variants,
                "title": " · ".join(notable_variants) or "Standard Route",
            }
        )

    if offset != len(raw):
        raise ValueError(f"MapBaker parser left {len(raw) - offset} unread bytes")
    return levels


def split_camel_case(value: str) -> str:
    spaced = re.sub(r"(?<=[a-z])(?=[A-Z])", " ", value)
    return " ".join(spaced.replace("_", " ").split())


def quaternion_multiply(
    left: tuple[float, float, float, float],
    right: tuple[float, float, float, float],
) -> tuple[float, float, float, float]:
    lx, ly, lz, lw = left
    rx, ry, rz, rw = right
    return (
        lw * rx + lx * rw + ly * rz - lz * ry,
        lw * ry - lx * rz + ly * rw + lz * rx,
        lw * rz + lx * ry - ly * rx + lz * rw,
        lw * rw - lx * rx - ly * ry - lz * rz,
    )


def rotate_vector(
    rotation: tuple[float, float, float, float],
    vector: tuple[float, float, float],
) -> tuple[float, float, float]:
    x, y, z, w = rotation
    vx, vy, vz = vector
    tx = 2 * (y * vz - z * vy)
    ty = 2 * (z * vx - x * vz)
    tz = 2 * (x * vy - y * vx)
    return (
        vx + w * tx + (y * tz - z * ty),
        vy + w * ty + (z * tx - x * tz),
        vz + w * tz + (x * ty - y * tx),
    )


def resolve_transform(
    assets_file: Any,
    transform_path_id: int,
    cache: dict[int, TransformState],
) -> TransformState:
    cached = cache.get(transform_path_id)
    if cached:
        return cached

    transform = assets_file.objects[transform_path_id].read()
    local_position = (
        float(transform.m_LocalPosition.x),
        float(transform.m_LocalPosition.y),
        float(transform.m_LocalPosition.z),
    )
    local_rotation = (
        float(transform.m_LocalRotation.x),
        float(transform.m_LocalRotation.y),
        float(transform.m_LocalRotation.z),
        float(transform.m_LocalRotation.w),
    )
    local_scale = (
        float(transform.m_LocalScale.x),
        float(transform.m_LocalScale.y),
        float(transform.m_LocalScale.z),
    )
    game_object = assets_file.objects[transform.m_GameObject.path_id].read()
    hierarchy = (str(game_object.m_Name),)
    active = bool(game_object.m_IsActive)

    father_path_id = transform.m_Father.path_id
    if not father_path_id:
        state = TransformState(local_position, local_rotation, local_scale, active, hierarchy)
        cache[transform_path_id] = state
        return state

    parent = resolve_transform(assets_file, father_path_id, cache)
    scaled_position = tuple(
        local_position[index] * parent.scale[index] for index in range(3)
    )
    rotated_position = rotate_vector(parent.rotation, scaled_position)
    state = TransformState(
        tuple(parent.position[index] + rotated_position[index] for index in range(3)),
        quaternion_multiply(parent.rotation, local_rotation),
        tuple(parent.scale[index] * local_scale[index] for index in range(3)),
        active and parent.active,
        parent.hierarchy + hierarchy,
    )
    cache[transform_path_id] = state
    return state


def find_transform_path_id(assets_file: Any, game_object_path_id: int) -> int | None:
    game_object = assets_file.objects[game_object_path_id].read()
    for component_pair in game_object.m_Component:
        pointer = component_pair.component
        if pointer.file_id != 0:
            continue
        component = assets_file.objects.get(pointer.path_id)
        if component and component.type.name in {"Transform", "RectTransform"}:
            return pointer.path_id
    return None


def region_from_hierarchy(hierarchy: Iterable[str], z: float, biomes: list[str]) -> str:
    path = " / ".join(hierarchy).casefold()
    checks = [
        (("peak", "summit"), "Summit"),
        (("temple",), "Temple"),
        (("swamp", "gloom"), "Swamp"),
        (("roots",), "Roots"),
        (("snow", "alpine", "tundra"), "Alpine"),
        (("jungle", "tropics"), "Tropics"),
        (("beach", "shore"), "Shore"),
    ]
    for needles, region in checks:
        if any(needle in path for needle in needles):
            return region

    if z < 120:
        return biomes[0]
    if z < 600:
        return biomes[min(1, len(biomes) - 1)]
    if z < 1250:
        return biomes[min(2, len(biomes) - 1)]
    return biomes[-1]


def square_projection(bounds: tuple[float, float, float, float]) -> dict[str, float]:
    min_x, min_z, max_x, max_z = bounds
    width = max_x - min_x
    depth = max_z - min_z
    span = max(width, depth) * 1.04
    center_x = (min_x + max_x) / 2
    center_z = (min_z + max_z) / 2
    return {
        "worldXMin": round(center_x - span / 2, 3),
        "worldXMax": round(center_x + span / 2, 3),
        "worldZMin": round(center_z - span / 2, 3),
        "worldZMax": round(center_z + span / 2, 3),
        "mapXMin": MAP_PADDING_PERCENT,
        "mapXMax": 100.0 - MAP_PADDING_PERCENT,
        "mapYMin": MAP_PADDING_PERCENT,
        "mapYMax": 100.0 - MAP_PADDING_PERCENT,
    }


def project_position(
    x: float,
    z: float,
    projection: dict[str, float],
) -> tuple[float, float]:
    x_ratio = (x - projection["worldXMin"]) / (
        projection["worldXMax"] - projection["worldXMin"]
    )
    z_ratio = (z - projection["worldZMin"]) / (
        projection["worldZMax"] - projection["worldZMin"]
    )
    map_x = projection["mapXMin"] + x_ratio * (
        projection["mapXMax"] - projection["mapXMin"]
    )
    map_y = projection["mapYMax"] - z_ratio * (
        projection["mapYMax"] - projection["mapYMin"]
    )
    return (
        round(max(0.0, min(100.0, map_x)), 3),
        round(max(0.0, min(100.0, map_y)), 3),
    )


def transform_vertices(
    vertices: list[tuple[float, float, float]],
    transform: TransformState,
) -> np.ndarray:
    points = np.asarray(vertices, dtype=np.float32)
    points *= np.asarray(transform.scale, dtype=np.float32)
    x, y, z, w = transform.rotation
    quaternion = np.asarray([x, y, z], dtype=np.float32)
    cross = np.cross(np.broadcast_to(quaternion, points.shape), points)
    points += 2.0 * (w * cross + np.cross(np.broadcast_to(quaternion, points.shape), cross))
    points += np.asarray(transform.position, dtype=np.float32)
    return points


def find_mesh_renderer(assets_file: Any, game_object_path_id: int) -> Any | None:
    game_object = assets_file.objects[game_object_path_id].read()
    for component_pair in game_object.m_Component:
        pointer = component_pair.component
        if pointer.file_id != 0:
            continue
        component = assets_file.objects.get(pointer.path_id)
        if component and component.type.name == "MeshRenderer":
            return component.read()
    return None


def render_prefab_icon(asset_path: Path, root_name: str, output: Path) -> None:
    environment = UnityPy.load(str(asset_path))
    assets_file = next(iter(environment.files.values()))
    transform_cache: dict[int, TransformState] = {}
    surfaces: list[tuple[np.ndarray, np.ndarray, np.ndarray]] = []

    for obj in assets_file.objects.values():
        if obj.type.name != "MeshFilter":
            continue
        mesh_filter = obj.read()
        transform_path_id = find_transform_path_id(
            assets_file,
            mesh_filter.m_GameObject.path_id,
        )
        if not transform_path_id:
            continue
        transform = resolve_transform(assets_file, transform_path_id, transform_cache)
        if not transform.active or not transform.hierarchy or transform.hierarchy[0] != root_name:
            continue

        try:
            mesh = mesh_filter.m_Mesh.read()
            handler = MeshHandler(mesh)
            handler.process()
            vertices = transform_vertices(handler.m_Vertices or [], transform)
            triangle_groups = handler.get_triangles()
        except (AssertionError, ValueError, struct.error):
            continue
        renderer = find_mesh_renderer(assets_file, mesh_filter.m_GameObject.path_id)
        material_pointers = renderer.m_Materials if renderer else []

        for submesh_index, triangle_group in enumerate(triangle_groups):
            triangles = np.asarray(triangle_group, dtype=np.int32)
            if not len(triangles):
                continue
            color = np.asarray((0.64, 0.36, 0.2), dtype=np.float32)
            if material_pointers:
                try:
                    material = material_pointers[
                        min(submesh_index, len(material_pointers) - 1)
                    ].read()
                    colors = dict(material.m_SavedProperties.m_Colors)
                    material_color = (
                        colors.get("_Color1")
                        or colors.get("_BaseColor")
                        or colors.get("_Color")
                    )
                    if material_color is not None:
                        color = np.asarray(
                            (material_color.r, material_color.g, material_color.b),
                            dtype=np.float32,
                        )
                except (AttributeError, KeyError, TypeError, ValueError):
                    pass
            surfaces.append((vertices, triangles, np.clip(color, 0.0, 1.0)))

    if not surfaces:
        raise SystemExit(f"Prefab geometry was not found for marker icon {root_name}")

    all_vertices = np.concatenate([vertices for vertices, _, _ in surfaces])
    center = (all_vertices.min(axis=0) + all_vertices.max(axis=0)) / 2
    view = np.asarray((1.0, 0.55, 1.2), dtype=np.float32)
    view /= np.linalg.norm(view)
    right = np.cross(np.asarray((0.0, 1.0, 0.0), dtype=np.float32), view)
    right /= np.linalg.norm(right)
    up = np.cross(view, right)
    up /= np.linalg.norm(up)
    light = np.asarray((-0.4, 0.9, 0.2), dtype=np.float32)
    light /= np.linalg.norm(light)

    projected: list[tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray]] = []
    minimum = np.asarray((float("inf"), float("inf")), dtype=np.float32)
    maximum = np.asarray((float("-inf"), float("-inf")), dtype=np.float32)
    for vertices, triangles, color in surfaces:
        local_vertices = vertices - center
        screen = np.stack((local_vertices @ right, local_vertices @ up), axis=1)
        depth = local_vertices @ view
        minimum = np.minimum(minimum, screen.min(axis=0))
        maximum = np.maximum(maximum, screen.max(axis=0))
        projected.append((local_vertices, screen, depth, triangles, color))

    size = 512
    padding = 34
    span = np.maximum(maximum - minimum, 0.0001)
    scale = min((size - padding * 2) / span[0], (size - padding * 2) / span[1])
    offset = np.asarray((size / 2, size / 2)) - (minimum + maximum) / 2 * scale
    faces: list[tuple[float, tuple[tuple[float, float], ...], tuple[int, int, int, int]]] = []

    for local_vertices, screen, depth, triangles, color in projected:
        for triangle in triangles:
            points_3d = local_vertices[triangle]
            normal = np.cross(points_3d[1] - points_3d[0], points_3d[2] - points_3d[0])
            normal_length = float(np.linalg.norm(normal))
            if normal_length < 0.0001:
                continue
            normal /= normal_length
            shade = 0.6 + 0.4 * abs(float(normal @ light))
            rendered_color = tuple(
                int(round(channel * shade * 255)) for channel in color
            ) + (255,)
            polygon = screen[triangle] * scale + offset
            polygon[:, 1] = size - polygon[:, 1]
            faces.append(
                (
                    float(depth[triangle].mean()),
                    tuple(tuple(float(value) for value in point) for point in polygon),
                    rendered_color,
                )
            )

    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image, "RGBA")
    for _, polygon, color in sorted(faces, key=lambda face: face[0]):
        draw.polygon(polygon, fill=color)

    alpha = image.getchannel("A")
    outline_alpha = alpha.filter(ImageFilter.MaxFilter(9))
    outline = Image.new("RGBA", image.size, (36, 29, 22, 0))
    outline.putalpha(outline_alpha.point(lambda value: round(value * 0.82)))
    outline.alpha_composite(image)
    output.parent.mkdir(parents=True, exist_ok=True)
    outline.resize((256, 256), Image.Resampling.LANCZOS).save(output, "PNG", optimize=True)


def hierarchy_material(hierarchy: tuple[str, ...]) -> MaterialStyle:
    path = "/".join(hierarchy).casefold()
    palettes = [
        (("snow", "alpine", "ice"), ((0.18, 0.34, 0.42), (0.78, 0.9, 0.93), (0.12, 0.2, 0.27))),
        (("jungle", "tropics"), ((0.12, 0.27, 0.18), (0.35, 0.61, 0.3), (0.08, 0.16, 0.14))),
        (("beach", "shore"), ((0.38, 0.27, 0.18), (0.78, 0.57, 0.32), (0.18, 0.2, 0.27))),
        (("desert", "mesa"), ((0.42, 0.2, 0.12), (0.74, 0.4, 0.2), (0.2, 0.14, 0.16))),
        (("roots",), ((0.2, 0.17, 0.12), (0.39, 0.46, 0.24), (0.12, 0.12, 0.15))),
        (("swamp", "gloom"), ((0.19, 0.12, 0.31), (0.3, 0.35, 0.68), (0.1, 0.11, 0.22))),
        (("temple",), ((0.16, 0.25, 0.34), (0.52, 0.42, 0.28), (0.09, 0.12, 0.18))),
    ]
    for needles, colors in palettes:
        if any(needle in path for needle in needles):
            return MaterialStyle(*colors)
    return MaterialStyle((0.25, 0.23, 0.2), (0.46, 0.43, 0.35), (0.12, 0.14, 0.18))


def read_material_style(material_pointer: Any, fallback: MaterialStyle) -> MaterialStyle:
    if not material_pointer or not material_pointer.path_id:
        return fallback
    try:
        material = material_pointer.read()
        properties = material.m_SavedProperties
        colors = dict(properties.m_Colors)
        textures = dict(properties.m_TexEnvs)
    except (AttributeError, KeyError, TypeError, ValueError):
        return fallback

    def read_color(names: tuple[str, ...], default: tuple[float, float, float]) -> tuple[float, float, float]:
        for name in names:
            color = colors.get(name)
            if color is not None:
                return (
                    float(max(0.0, min(1.0, color.r))),
                    float(max(0.0, min(1.0, color.g))),
                    float(max(0.0, min(1.0, color.b))),
                )
        return default

    base = read_color(("_BaseColor", "_Color", "_Color1"), fallback.base)
    top = read_color(("_TopColor", "_Tint", "_Color3"), fallback.top)
    bottom = read_color(("_BottomColor", "_Color2"), fallback.bottom)
    texture = None
    texture_scale = (1.0, 1.0)
    texture_offset = (0.0, 0.0)
    for name in ("_BaseTexture", "_BaseMap", "_MainTex", "_Texture1"):
        texture_env = textures.get(name)
        if texture_env is None or not texture_env.m_Texture.path_id:
            continue
        try:
            image = texture_env.m_Texture.read().image.convert("L").resize((256, 256))
            texture = np.asarray(image, dtype=np.float32) / 255.0
            texture_scale = (float(texture_env.m_Scale.x), float(texture_env.m_Scale.y))
            texture_offset = (float(texture_env.m_Offset.x), float(texture_env.m_Offset.y))
            break
        except (AttributeError, NotImplementedError, ValueError):
            continue
    return MaterialStyle(base, top, bottom, texture, texture_scale, texture_offset)


def extract_map_geometry(
    assets_file: Any,
    transform_cache: dict[int, TransformState],
) -> tuple[list[MapSurface], tuple[float, float, float, float]]:
    surfaces: list[MapSurface] = []
    bounds = [float("inf"), float("inf"), float("-inf"), float("-inf")]

    mesh_cache: dict[
        tuple[int, int],
        tuple[list[tuple[float, float, float]], list[list[Any]], list[tuple[float, float]] | None] | None,
    ] = {}
    material_cache: dict[tuple[int, int, int], MaterialStyle] = {}
    for obj in assets_file.objects.values():
        if obj.type.name != "MeshFilter":
            continue
        mesh_filter = obj.read()
        mesh_pointer = mesh_filter.m_Mesh
        if not mesh_pointer.path_id:
            continue
        transform_path_id = find_transform_path_id(
            assets_file,
            mesh_filter.m_GameObject.path_id,
        )
        if not transform_path_id:
            continue
        transform = resolve_transform(assets_file, transform_path_id, transform_cache)
        if not transform.active or "Map" not in transform.hierarchy:
            continue
        if (
            mesh_pointer.file_id != 0
            and transform.hierarchy[-1].casefold() not in EXTERNAL_SURFACE_NAMES
        ):
            continue

        mesh_key = (mesh_pointer.file_id, mesh_pointer.path_id)
        cached_mesh = mesh_cache.get(mesh_key)
        if mesh_key not in mesh_cache:
            try:
                mesh = mesh_pointer.read()
                handler = MeshHandler(mesh)
                handler.process()
                triangle_groups = handler.get_triangles()
                cached_mesh = (
                    handler.m_Vertices or [],
                    triangle_groups,
                    handler.m_UV0,
                )
            except (AssertionError, ValueError, struct.error):
                cached_mesh = None
            mesh_cache[mesh_key] = cached_mesh
        if not cached_mesh:
            continue
        mesh_vertices, triangle_groups, mesh_uvs = cached_mesh
        if not mesh_vertices or not triangle_groups:
            continue

        vertices = transform_vertices(mesh_vertices, transform)
        uvs = (
            np.asarray(mesh_uvs, dtype=np.float32)
            if mesh_uvs and len(mesh_uvs) == len(mesh_vertices)
            else None
        )
        renderer = find_mesh_renderer(assets_file, mesh_filter.m_GameObject.path_id)
        material_pointers = renderer.m_Materials if renderer else []
        fallback_style = hierarchy_material(transform.hierarchy)
        for submesh_index, triangle_group in enumerate(triangle_groups):
            triangles = np.asarray(triangle_group, dtype=np.int32)
            if not len(triangles):
                continue
            material_pointer = (
                material_pointers[min(submesh_index, len(material_pointers) - 1)]
                if material_pointers
                else None
            )
            if material_pointer:
                material_key = (
                    id(material_pointer.assetsfile),
                    material_pointer.file_id,
                    material_pointer.path_id,
                )
                if material_key not in material_cache:
                    material_cache[material_key] = read_material_style(
                        material_pointer,
                        fallback_style,
                    )
                material_style = material_cache[material_key]
            else:
                material_style = fallback_style
            surfaces.append(
                MapSurface(
                    vertices=vertices,
                    triangles=triangles,
                    uvs=uvs,
                    material=material_style,
                )
            )
        bounds[0] = min(bounds[0], float(vertices[:, 0].min()))
        bounds[1] = min(bounds[1], float(vertices[:, 2].min()))
        bounds[2] = max(bounds[2], float(vertices[:, 0].max()))
        bounds[3] = max(bounds[3], float(vertices[:, 2].max()))

    if not surfaces:
        raise SystemExit("No active local map geometry was found in the scene.")
    return surfaces, tuple(bounds)


def render_map(
    surfaces: list[MapSurface],
    projection: dict[str, float],
    output: Path,
) -> None:
    render_triangles: list[
        tuple[
            float,
            float,
            float,
            tuple[float, float, float],
            tuple[float, float, float],
            tuple[float, float, float],
            float,
            tuple[tuple[int, int], ...],
        ]
    ] = []
    min_height = float("inf")
    max_height = float("-inf")

    for surface in surfaces:
        points = surface.vertices[surface.triangles]
        edges_a = points[:, 1] - points[:, 0]
        edges_b = points[:, 2] - points[:, 0]
        normals = np.cross(edges_a, edges_b)
        lengths = np.linalg.norm(normals, axis=1)
        upward = np.abs(normals[:, 1]) / np.maximum(lengths, 0.0001)
        valid = (lengths > 0.001) & (upward > 0.12)
        points = points[valid]
        upward = upward[valid]
        normals = normals[valid] / np.maximum(lengths[valid, None], 0.0001)
        normals[normals[:, 1] < 0] *= -1
        light_direction = np.asarray((-0.48, 0.78, -0.4), dtype=np.float32)
        light_direction /= np.linalg.norm(light_direction)
        lighting = np.clip(normals @ light_direction, -1.0, 1.0)
        triangles = surface.triangles[valid]
        if not len(points):
            continue
        heights = points[:, :, 1].mean(axis=1)
        min_height = min(min_height, float(heights.min()))
        max_height = max(max_height, float(heights.max()))

        x_ratio = (points[:, :, 0] - projection["worldXMin"]) / (
            projection["worldXMax"] - projection["worldXMin"]
        )
        z_ratio = (points[:, :, 2] - projection["worldZMin"]) / (
            projection["worldZMax"] - projection["worldZMin"]
        )
        pixels_x = np.rint(
            (projection["mapXMin"] + x_ratio * (projection["mapXMax"] - projection["mapXMin"]))
            * (MAP_SIZE - 1)
            / 100.0
        ).astype(np.int32)
        pixels_y = np.rint(
            (projection["mapYMax"] - z_ratio * (projection["mapYMax"] - projection["mapYMin"]))
            * (MAP_SIZE - 1)
            / 100.0
        ).astype(np.int32)
        texture_values = np.ones(len(points), dtype=np.float32)
        material = surface.material
        if material.texture is not None and surface.uvs is not None:
            triangle_uvs = surface.uvs[triangles].mean(axis=1)
            texture_u = np.mod(
                triangle_uvs[:, 0] * material.texture_scale[0] + material.texture_offset[0],
                1.0,
            )
            texture_v = np.mod(
                triangle_uvs[:, 1] * material.texture_scale[1] + material.texture_offset[1],
                1.0,
            )
            texture_x = np.rint(texture_u * (material.texture.shape[1] - 1)).astype(np.int32)
            texture_y = np.rint((1.0 - texture_v) * (material.texture.shape[0] - 1)).astype(np.int32)
            texture_values = material.texture[texture_y, texture_x]
        for height, slope, texture_value, light_value, px, py in zip(
            heights,
            upward,
            texture_values,
            lighting,
            pixels_x,
            pixels_y,
        ):
            polygon = tuple((int(px[index]), int(py[index])) for index in range(3))
            render_triangles.append(
                (
                    float(height),
                    float(slope),
                    float(texture_value),
                    material.base,
                    material.top,
                    material.bottom,
                    float(light_value),
                    polygon,
                )
            )

    height_span = max(1.0, max_height - min_height)
    render_triangles.sort(key=lambda item: item[0])
    terrain = Image.new("RGBA", (MAP_SIZE, MAP_SIZE), (0, 0, 0, 0))
    terrain_draw = ImageDraw.Draw(terrain, "RGBA")
    terrain_mask = Image.new("L", (MAP_SIZE, MAP_SIZE), 0)
    terrain_mask_draw = ImageDraw.Draw(terrain_mask)
    relief_height = Image.new("F", (RELIEF_SIZE, RELIEF_SIZE), min_height)
    relief_height_draw = ImageDraw.Draw(relief_height)
    relief_mask = Image.new("L", (RELIEF_SIZE, RELIEF_SIZE), 0)
    relief_mask_draw = ImageDraw.Draw(relief_mask)
    relief_ratio = (RELIEF_SIZE - 1) / (MAP_SIZE - 1)

    for height, slope, texture_value, base, top, bottom, light_value, polygon in render_triangles:
        elevation = (height - min_height) / height_span
        surface_mix = max(0.0, min(1.0, (slope - 0.12) / 0.88))
        base_color = np.asarray(base, dtype=np.float32)
        top_color = np.asarray(top, dtype=np.float32)
        bottom_color = np.asarray(bottom, dtype=np.float32)
        horizontal_color = base_color * 0.32 + top_color * 0.68
        linear_color = bottom_color * (1.0 - surface_mix) + horizontal_color * surface_mix
        directional_light = 0.8 + (light_value + 1.0) * 0.12
        linear_color = linear_color * (0.72 + slope * 0.14 + elevation * 0.14)
        linear_color = linear_color * directional_light
        linear_color = linear_color * (0.78 + texture_value * 0.38)
        srgb = np.power(np.clip(linear_color, 0.0, 1.0), 1.0 / 2.2)
        color = tuple(int(round(channel * 255)) for channel in srgb) + (255,)
        terrain_draw.polygon(polygon, fill=color)
        terrain_mask_draw.polygon(polygon, fill=255)
        relief_polygon = tuple(
            (round(point[0] * relief_ratio), round(point[1] * relief_ratio))
            for point in polygon
        )
        relief_height_draw.polygon(relief_polygon, fill=float(height))
        relief_mask_draw.polygon(relief_polygon, fill=255)

    height_data = np.asarray(relief_height, dtype=np.float32)
    relief_mask_data = np.asarray(relief_mask, dtype=np.uint8) > 0
    interior_mask_data = np.asarray(
        relief_mask.filter(ImageFilter.MinFilter(5)),
        dtype=np.uint8,
    ) > 0
    gradient_y, gradient_x = np.gradient(height_data)
    relief = -gradient_x * 0.65 - gradient_y
    relief_values = np.abs(relief[interior_mask_data])
    relief_scale = float(np.percentile(relief_values, 94)) if relief_values.size else 1.0
    relief_scale = max(relief_scale, 0.0001)
    normalized_relief = np.clip(relief / relief_scale, -1.0, 1.0)
    shade_data = np.where(
        relief_mask_data,
        np.rint(229 + normalized_relief * 26),
        255,
    ).astype(np.uint8)
    shade = Image.fromarray(shade_data, mode="L").resize(
        (MAP_SIZE, MAP_SIZE),
        Image.Resampling.BILINEAR,
    )
    shade_rgb = Image.merge("RGB", (shade, shade, shade))
    terrain_rgb = ImageChops.multiply(terrain.convert("RGB"), shade_rgb)
    terrain = terrain_rgb.convert("RGBA")
    terrain.putalpha(terrain_mask)

    contour_interval = 80.0
    contour_bands = np.floor((height_data - min_height) / contour_interval).astype(np.int32)
    contour_data = np.zeros_like(relief_mask_data)
    contour_data[1:, :] |= contour_bands[1:, :] != contour_bands[:-1, :]
    contour_data[:, 1:] |= contour_bands[:, 1:] != contour_bands[:, :-1]
    contour_data &= interior_mask_data
    contour_mask = Image.fromarray((contour_data * 72).astype(np.uint8), mode="L").resize(
        (MAP_SIZE, MAP_SIZE),
        Image.Resampling.NEAREST,
    ).filter(ImageFilter.MaxFilter(3))

    paper = Image.new("RGB", (MAP_SIZE, MAP_SIZE), (181, 169, 139))
    grain = Image.effect_noise((1024, 1024), 12).resize(
        (MAP_SIZE, MAP_SIZE),
        Image.Resampling.BILINEAR,
    )
    paper_grain = Image.merge("RGB", (grain, grain, grain))
    paper = Image.blend(paper, paper_grain, 0.055)
    paper_draw = ImageDraw.Draw(paper, "RGBA")
    grid_spacing = MAP_SIZE // 16
    for coordinate in range(grid_spacing, MAP_SIZE, grid_spacing):
        paper_draw.line((coordinate, 0, coordinate, MAP_SIZE), fill=(74, 64, 50, 13), width=1)
        paper_draw.line((0, coordinate, MAP_SIZE, coordinate), fill=(74, 64, 50, 13), width=1)

    outer_mask = terrain_mask.filter(ImageFilter.MaxFilter(31))
    shadow_mask = outer_mask.filter(ImageFilter.GaussianBlur(22))
    paper.paste((55, 48, 37), mask=shadow_mask.point(lambda value: round(value * 0.48)))
    paper.paste((72, 61, 45), mask=outer_mask)
    paper.paste(terrain.convert("RGB"), mask=terrain_mask)
    paper.paste((52, 44, 34), mask=contour_mask)

    inner_edge = ImageChops.subtract(
        terrain_mask,
        terrain_mask.filter(ImageFilter.MinFilter(7)),
    )
    paper.paste((43, 36, 28), mask=inner_edge.point(lambda value: round(value * 0.78)))

    output.parent.mkdir(parents=True, exist_ok=True)
    paper.save(output, "WEBP", quality=92, method=6)


def pointer_item_id(pointer: dict[str, Any], prefab_item_ids: dict[int, int]) -> int | None:
    path_id = int(pointer.get("m_PathID", 0))
    return prefab_item_ids.get(path_id)


def resolve_luggage_pool(
    component: dict[str, Any],
    world_z: float,
    region: str,
) -> int | str | None:
    spawn_mode = int(component.get("spawnMode", -1))
    if spawn_mode == 0:
        spawn_list_id = int(component.get("spawns", {}).get("m_PathID", 0))
        return f"spawn-list-{spawn_list_id}" if spawn_list_id else None
    if spawn_mode == 1:
        pool_id = int(component.get("spawnPool", 0))
        return pool_id if pool_id in LOOT_POOL_NAMES else None
    if spawn_mode != 2:
        return None

    entries = component.get("heightBasedSpawnPools", [])
    for entry in reversed(entries):
        if world_z <= float(entry.get("minimumZ", float("inf"))):
            continue
        if entry.get("hasBiomeRequirement"):
            required_region = SPAWN_BIOME_NAMES.get(int(entry.get("biomeRequirement", -1)))
            if required_region != region:
                continue
        pool_id = int(entry.get("spawnPool", 0))
        return pool_id if pool_id in LOOT_POOL_NAMES else None

    pool_id = int(component.get("spawnPool", 0))
    return pool_id if pool_id in LOOT_POOL_NAMES else None


def build_marker_content(
    category: str,
    component_name: str,
    component: dict[str, Any],
    transform: TransformState,
    region: str,
    terms: dict[str, str],
    prefab_item_ids: dict[int, int],
) -> dict[str, Any]:
    if category == "luggage":
        display_name = str(component.get("displayName") or "Luggage")
        pool_id = resolve_luggage_pool(component, transform.position[2], region)
        is_trick = any("luggagetrick" in part.casefold() for part in transform.hierarchy)
        return {
            "variant": "luggage",
            "name": "Trick Luggage" if is_trick else localize_term(terms, display_name),
            "lootPoolId": str(pool_id) if pool_id is not None else None,
            "openSeconds": round(float(component.get("timeToOpen", 0)), 1),
        }

    if category == "campfire":
        name_override = str(component.get("nameOverride") or "")
        return {
            "variant": "campfire",
            "name": localize_term(terms, name_override) if name_override else "Campfire",
            "burnSeconds": round(float(component.get("burnsFor", 0))),
            "cookSeconds": round(float(component.get("cookTime", 0)), 1),
            "moraleRadius": round(float(component.get("moraleBoostRadius", 0)), 1),
            "moraleBoost": round(float(component.get("moraleBoostBaseline", 0)) * 100),
            "injuryReduction": round(float(component.get("injuryReduction", 0)) * 100),
        }

    if category == "scout" and component_name == "Peak.ScoutStatue":
        reward_id = pointer_item_id(component.get("scoutsHonorPrefab", {}), prefab_item_ids)
        return {
            "variant": "scout-statue",
            "name": localize_term(terms, str(component.get("nameIndex") or "NAME_SCOUTSTATUE")),
            "interactSeconds": round(float(component.get("interactTime", 0)), 1),
            "items": ([{"itemId": reward_id, "kind": "reward"}] if reward_id is not None else []),
        }

    if category == "scout":
        display_name = str(component.get("displayName") or "Ancient Statue")
        return {
            "variant": "ancient-statue",
            "name": localize_term(terms, display_name),
            "openSeconds": round(float(component.get("timeToOpen", 0)), 1),
        }

    if category == "nest":
        item_id = pointer_item_id(component.get("spawnedObjectPrefab", {}), prefab_item_ids)
        quantity = component.get("possibleBerries", {})
        return {
            "variant": "egg-nest",
            "name": "Egg Nest",
            "items": (
                [
                    {
                        "itemId": item_id,
                        "kind": "contains",
                        "quantityMin": round(float(quantity.get("x", 0))),
                        "quantityMax": round(float(quantity.get("y", 0))),
                    }
                ]
                if item_id is not None
                else []
            ),
        }

    if category == "danger":
        reward_pointer = component.get("luggage", {})
        reward_name = None
        if reward_pointer.get("m_FileID") == 0 and reward_pointer.get("m_PathID"):
            reward_name = "Epic Luggage"
        return {
            "variant": "antlion",
            "name": "Antlion",
            "escapeRadius": round(float(component.get("escapeRadiusForAchievement", 0))),
            "reward": reward_name,
        }

    return {
        "variant": "tomb",
        "name": "Mesa Tomb",
    }


def extract_level(
    level: dict[str, Any],
    scene_file: Path,
    script_names: dict[int, str],
    map_output: Path,
    type_tree_generator: Any,
    terms: dict[str, str],
    prefab_item_ids: dict[int, int],
    projection_override: dict[str, float] | None = None,
) -> dict[str, Any]:
    environment = UnityPy.load(str(scene_file))
    environment.typetree_generator = type_tree_generator
    assets_file = next(iter(environment.files.values()))
    candidates: dict[int, tuple[str, str, dict[str, Any]]] = {}
    seed: int | None = None

    for obj in assets_file.objects.values():
        if obj.type.name != "MonoBehaviour":
            continue
        raw = obj.get_raw_data()
        header = mono_header(raw)
        if not header:
            continue
        game_file_id, game_path_id, script_file_id, script_path_id, _, payload_offset = header
        if script_file_id != 1:
            continue
        script_name = script_names.get(script_path_id)
        if script_name == "LevelGeneration" and payload_offset + 4 <= len(raw):
            seed = struct.unpack_from("<i", raw, payload_offset)[0]
        category = COMPONENT_CATEGORIES.get(script_name or "")
        if category and game_file_id == 0:
            candidates[game_path_id] = (
                category,
                script_name or "",
                parse_component(obj, script_name or "", type_tree_generator),
            )
        if script_name == "BerryBush" and game_file_id == 0:
            game_object = assets_file.objects[game_path_id].read()
            if str(game_object.m_Name).casefold() == "eggnestraven":
                candidates[game_path_id] = (
                    "nest",
                    script_name,
                    parse_component(obj, script_name, type_tree_generator),
                )

    transform_cache: dict[int, TransformState] = {}
    if projection_override is None:
        surfaces, geometry_bounds = extract_map_geometry(assets_file, transform_cache)
        projection = square_projection(geometry_bounds)
        render_map(surfaces, projection, map_output)
    else:
        projection = projection_override
    extracted: list[dict[str, Any]] = []
    dedupe: set[tuple[str, int, int, int]] = set()
    for game_object_path_id, (category, component_name, component) in candidates.items():
        transform_path_id = find_transform_path_id(assets_file, game_object_path_id)
        if not transform_path_id:
            continue
        transform = resolve_transform(assets_file, transform_path_id, transform_cache)
        folded_hierarchy = {part.casefold() for part in transform.hierarchy}
        if not transform.active or "void" in folded_hierarchy:
            continue
        world_x, world_y, world_z = transform.position
        dedupe_key = (category, round(world_x), round(world_y), round(world_z))
        if dedupe_key in dedupe:
            continue
        dedupe.add(dedupe_key)
        map_x, map_y = project_position(world_x, world_z, projection)
        region = region_from_hierarchy(transform.hierarchy, world_z, level["biomes"])
        content = build_marker_content(
            category,
            component_name,
            component,
            transform,
            region,
            terms,
            prefab_item_ids,
        )
        extracted.append(
            {
                "category": category,
                "map": {"x": map_x, "y": map_y},
                "world": {
                    "x": round(world_x, 3),
                    "y": round(world_y, 3),
                    "z": round(world_z, 3),
                },
                "elevation": round(world_y),
                "region": region,
                "source": component_name,
                "content": content,
            }
        )

    category_order = {name: index for index, name in enumerate(COMPONENT_CATEGORIES.values())}
    category_order["nest"] = len(category_order)
    extracted.sort(
        key=lambda marker: (
            category_order.get(marker["category"], 99),
            -marker["world"]["z"],
            marker["world"]["x"],
        )
    )
    counters: Counter[str] = Counter()
    markers: list[dict[str, Any]] = []
    for marker in extracted:
        category = marker["category"]
        counters[category] += 1
        sequence = counters[category]
        region_slug = re.sub(r"[^a-z0-9]+", "-", marker["region"].casefold()).strip("-")
        marker.update(
            {
                "id": f"level-{level['index']}-{category}-{sequence:03d}",
                "sequence": sequence,
                "group": f"{region_slug}-{round(marker['world']['z'] / 180)}",
                "exact": True,
                "runtimeContents": category == "luggage",
            }
        )
        markers.append(marker)

    return {
        **level,
        "seed": seed,
        "sourceFile": scene_file.name,
        "mapImage": f"./data/peak/maps/{map_output.name}",
        "projection": projection,
        "markerCounts": dict(sorted(counters.items())),
        "markers": markers,
    }


def main() -> None:
    args = parse_args()
    game_dir, steam_manifest = locate_game_dir(args.game_dir)
    game_data = game_dir / "PEAK_Data"
    output = args.output.resolve()
    if args.icons_only:
        if not output.is_file():
            raise SystemExit("Icon-only extraction requires an existing catalog.json")
        dataset = json.loads(output.read_text(encoding="utf-8"))
        dataset["markerIcons"] = extract_marker_icons(game_data, output.parent / "icons")
        output.write_text(
            json.dumps(dataset, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        print(f"Refreshed {len(dataset['markerIcons'])} marker icons in {output}.")
        return
    script_names = load_script_names(game_data)
    type_tree_generator = TypeTreeGenerator(UNITY_VERSION)
    type_tree_generator.load_local_game(str(game_dir))
    if args.item_icons_only:
        if not output.is_file():
            raise SystemExit("Item-icon-only extraction requires an existing catalog.json")
        dataset = json.loads(output.read_text(encoding="utf-8"))
        catalog_items = dataset.get("items", [])
        if not catalog_items or any("displayId" not in item for item in catalog_items):
            raise SystemExit("Existing catalog has no scanner displayId values")
        extracted_items, _, _ = extract_item_catalog(
            game_dir,
            script_names,
            type_tree_generator,
            output.parent / "items",
        )
        icons_by_display_id = {
            int(item["id"]): item["icon"]
            for item in extracted_items
            if item.get("icon")
        }
        expected_display_ids = {int(item["displayId"]) for item in catalog_items}
        extracted_display_ids = {int(item["id"]) for item in extracted_items}
        missing_display_ids = sorted(expected_display_ids - extracted_display_ids)
        unexpected_display_ids = sorted(extracted_display_ids - expected_display_ids)
        if missing_display_ids or unexpected_display_ids:
            raise SystemExit(
                "Item icon IDs do not match the scanner catalog: "
                f"missing={missing_display_ids}, unexpected={unexpected_display_ids}"
            )
        for item in catalog_items:
            item["icon"] = icons_by_display_id.get(int(item["displayId"]))
        dataset["itemIconCoverage"] = {
            "withSprites": len(icons_by_display_id),
            "withoutSprites": sorted(expected_display_ids - icons_by_display_id.keys()),
        }
        output.write_text(
            json.dumps(dataset, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        print(
            f"Refreshed {len(icons_by_display_id)} item icons in {output}; "
            f"{len(catalog_items) - len(icons_by_display_id)} items have no game UI sprite."
        )
        return
    map_baker_raw = find_named_monobehaviour(
        game_data / "resources.assets", script_names, "MapBaker", "MapBaker"
    )
    level_catalog = parse_map_baker(map_baker_raw)
    previous_dataset: dict[str, Any] | None = None
    if args.content_only:
        if not output.is_file():
            raise SystemExit("Content-only extraction requires an existing catalog.json")
        previous_dataset = json.loads(output.read_text(encoding="utf-8"))
        if len(previous_dataset.get("levels", [])) != len(level_catalog):
            raise SystemExit("Existing catalog level count does not match the installed game")
    marker_icons = (
        previous_dataset.get("markerIcons", {})
        if previous_dataset is not None
        else extract_marker_icons(game_data, output.parent / "icons")
    )
    terms = load_english_terms(game_data / "resources.assets")
    items, loot_pools, prefab_item_ids = extract_item_catalog(
        game_dir,
        script_names,
        type_tree_generator,
        output.parent / "items",
    )

    levels: list[dict[str, Any]] = []
    for level in level_catalog:
        build_scene_index = 5 + int(level["index"])
        scene_file = game_data / f"level{build_scene_index}"
        if not scene_file.is_file():
            raise SystemExit(f"Missing scene data: {scene_file}")
        print(f"Extracting {level['scene']} from {scene_file.name}...", flush=True)
        map_output = args.output.resolve().parent / "maps" / f"level-{level['index']}.webp"
        previous_level = (
            previous_dataset["levels"][int(level["index"])]
            if previous_dataset is not None
            else None
        )
        projection_override = previous_level.get("projection") if previous_level else None
        if previous_dataset is not None and not projection_override:
            raise SystemExit(f"Existing projection is missing for {level['scene']}")
        levels.append(
            extract_level(
                level,
                scene_file,
                script_names,
                map_output,
                type_tree_generator,
                terms,
                prefab_item_ids,
                projection_override,
            )
        )

    manifest_text = (
        steam_manifest.read_text(encoding="utf-8", errors="replace")
        if steam_manifest.is_file()
        else ""
    )
    game_version_file = game_dir / "version.txt"
    game_version_lines = (
        game_version_file.read_text(encoding="utf-8", errors="replace").splitlines()
        if game_version_file.is_file()
        else []
    )
    assembly_path = game_data / "Managed/Assembly-CSharp.dll"
    referenced_spawn_lists = {
        marker["content"]["lootPoolId"]
        for level in levels
        for marker in level["markers"]
        if str(marker["content"].get("lootPoolId", "")).startswith("spawn-list-")
    }
    loot_pools = [
        pool
        for pool in loot_pools
        if not pool["id"].startswith("spawn-list-") or pool["id"] in referenced_spawn_lists
    ]
    dataset = {
        "schemaVersion": 2,
        "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "source": {
            "steamAppId": STEAM_APP_ID,
            "overwolfGameId": OVERWOLF_GAME_ID,
            "buildId": parse_vdf_value(manifest_text, "buildid"),
            "gameVersion": game_version_lines[0] if game_version_lines else None,
            "revision": game_version_lines[1] if len(game_version_lines) > 1 else None,
            "assemblySha256": sha256_file(assembly_path),
        },
        "rotation": {
            "anchorUtc": ROTATION_ANCHOR_UTC,
            "durationHours": ROTATION_HOURS,
            "levelCount": len(levels),
        },
        "markerIcons": marker_icons,
        "items": items,
        "lootPools": loot_pools,
        "limitations": {
            "luggageContents": "Each container uses the extracted biome pool and the game's rarity weights; the host performs the final roll at runtime.",
            "gepLocation": "PEAK publishes no documented location payload keys.",
            "coordinates": "Deterministic baked-scene positions projected against the same scene geometry used by each map image.",
        },
        "levels": levels,
    }

    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(dataset, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    marker_total = sum(len(level["markers"]) for level in levels)
    print(f"Wrote {output} ({len(levels)} levels, {marker_total} markers).")


if __name__ == "__main__":
    main()
