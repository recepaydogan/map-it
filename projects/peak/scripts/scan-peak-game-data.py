from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import struct
from urllib.request import urlopen
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from types import SimpleNamespace

import numpy as np
import dnfile
import UnityPy
from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator
from UnityPy.helpers import TypeTreeHelper
from UnityPy.streams import EndianBinaryReader


DEFAULT_GAME_ROOT = Path(r"C:\Program Files (x86)\Steam\steamapps\common\PEAK")
PROJECT_ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = Path(__file__).resolve().parent / "peak-data" / "map-config.json"
OUTPUT_PATH = PROJECT_ROOT / "artifacts" / "peak-data" / "catalog.json"
APP_MANIFEST = Path(r"C:\Program Files (x86)\Steam\steamapps\appmanifest_3527290.acf")

RARITY_NAMES = {
    0: "common",
    1: "uncommon",
    2: "rare",
    3: "epic",
    4: "legendary",
    5: "mythic",
    6: "ridiculously-rare",
}
RARITY_WEIGHTS = {
    "common": 100,
    "uncommon": 50,
    "rare": 35,
    "epic": 20,
    "legendary": 15,
    "mythic": 6,
    "ridiculously-rare": 3,
}
SPAWN_POOLS = {
    4: "mushroom-cluster",
    8: "berry-beach",
    16: "berry-jungle",
    32: "spiky-vine",
    64: "coconut-tree",
    128: "willow-tree",
    256: "jungle-vine",
    512: "winterberry-tree",
    1024: "shore",
    2048: "tropics",
    4096: "alpine",
    8192: "caldera",
    16384: "climber",
    32768: "ancient",
    65536: "cursed",
    131072: "respawn",
    262144: "nest",
    524288: "guidebook-shore",
    1048576: "guidebook-tropics",
    2097152: "guidebook-alpine",
    4194304: "cactus",
    8388608: "redwood",
    16777216: "mesa",
    33554432: "campfire",
    67108864: "roots",
    268435456: "gloom",
    536870912: "citadel",
    1073741824: "clown",
}
LUGGAGE_POOL_NAMES = {
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
STATUS_NAMES = {
    0: "injury",
    1: "hunger",
    2: "cold",
    3: "poison",
    4: "crab",
    5: "curse",
    6: "drowsy",
    7: "weight",
    8: "heat",
    9: "thorns",
    10: "spores",
    11: "web",
    12: "arrow",
    13: "petrify",
    14: "fly-trap",
}

MARKER_ICONS = {
    "luggage": "./data/peak/icons/luggage.png",
    "campfire": "./data/peak/icons/campfire.png",
    "scout": "./data/peak/icons/scout.png",
    "nest": "./data/peak/icons/nest.png",
}

DIRECT_RULES: dict[str, dict[str, Any]] = {
    "Luggage": {"category": "luggage", "variant": "luggage", "name": "Luggage"},
    "Campfire": {"category": "campfire", "variant": "campfire", "name": "Campfire"},
    "Peak.ScoutStatue": {"category": "scout", "variant": "scout-statue", "name": "Scout Statue"},
    "RespawnChest": {"category": "respawn", "variant": "respawn-statue", "name": "Revival Statue"},
    "GhostFire": {"category": "belltower", "variant": "belltower", "name": "Belltower"},
    "Peak.PeakGatePortal": {"category": "portal", "variant": "peak-gate", "name": "Peak Gate"},
    "Peak.ScoutmasterSoulPillar": {"category": "secret", "variant": "soul-pillar", "name": "Scoutmaster Soul Pillar"},
    "TombTrigger": {"category": "secret", "variant": "tomb", "name": "Tomb"},
    "Capybara": {"category": "secret", "variant": "capybara", "name": "Capybara"},
    "GiantTreeAchievementZone": {"category": "secret", "variant": "giant-tree", "name": "Giant Tree"},
    "ScoutCannonAchievementZone": {"category": "secret", "variant": "scout-cannon", "name": "Scout Cannon Jump"},
    "Spider": {"category": "creature", "variant": "spider", "name": "Spider"},
    "Beetle": {"category": "creature", "variant": "beetle", "name": "Beetle"},
    "Antlion": {"category": "creature", "variant": "antlion", "name": "Antlion"},
    "VenusFlyTrap": {"category": "creature", "variant": "flytrap", "name": "Venus Flytrap"},
    "SlipperyJellyfish": {"category": "environment", "variant": "jellyfish", "name": "Slippery Jellyfish"},
    "MushroomZombieSpawner": {"category": "creature", "variant": "mushroom-zombie", "name": "Mushroom Zombie"},
    "Peak.GhostBallSpawner": {"category": "creature", "variant": "big-ghost", "name": "Big Ghost"},
    "TornadoSpawner": {"category": "environment", "variant": "tornado", "name": "Tornado Zone"},
    "ScoutmasterSpawner": {"category": "creature", "variant": "scoutmaster", "name": "Scoutmaster"},
    "Peak.SpikeTrap": {"category": "trap", "variant": "spike-trap", "name": "Spike Trap", "aggregate": True},
    "ArrowShooter": {"category": "trap", "variant": "arrow-trap", "name": "Arrow Trap", "aggregate": True},
    "Peak.MovingSawBlade": {"category": "trap", "variant": "sawblade", "name": "Moving Sawblade"},
    "SwingingAxe": {"category": "trap", "variant": "swinging-axe", "name": "Swinging Spikeball"},
    "Peak.SpikeRoller": {"category": "trap", "variant": "spike-roller", "name": "Spinny Spikes"},
    "BreakableBridge": {"category": "bridge", "variant": "breakable-bridge", "name": "Breakable Bridge"},
    "SpawnConnectingBridge": {"category": "bridge", "variant": "connecting-bridge", "name": "Connecting Bridge"},
    "RopeAnchorWithRope": {"category": "rope", "variant": "fixed-rope", "name": "Fixed Rope"},
    "TempleEntranceRope": {"category": "rope", "variant": "temple-rope", "name": "Temple Entrance Rope"},
    "Peak.Island.RavenPerch": {"category": "creature", "variant": "raven-perch", "name": "Raven Perch", "aggregate": True},
    "Lava": {"category": "environment", "variant": "lava", "name": "Lava"},
    "Peak.LavaSphere": {"category": "environment", "variant": "lava", "name": "Lava"},
    "LavaRising": {"category": "environment", "variant": "rising-lava", "name": "Rising Lava"},
    "WaterZone": {"category": "environment", "variant": "deep-water", "name": "Deep Water"},
    "WindChillZone": {"category": "environment", "variant": "storm-zone", "name": "Storm Zone"},
    "TiedBalloon": {"category": "bridge", "variant": "tied-balloon", "name": "Tied Balloon"},
    "Peak.PropSpawner_AmuletStatues": {"category": "secret", "variant": "amulet-statue", "name": "Amulet Statue"},
    "Peak.FinalCutsceneTrigger": {"category": "portal", "variant": "final-ascent", "name": "The Final Ascent"},
    "LuggageCursed": {"category": "luggage", "variant": "cursed-luggage", "name": "Ancient Luggage"},
    "ShakyIcicleIce2": {"category": "trap", "variant": "icicle", "name": "Shaky Icicle"},
    "OrbThatMakesYouSleepy": {"category": "trap", "variant": "nap-berry", "name": "Nap Berry Trap"},
    "HotSun": {"category": "environment", "variant": "scorching-sun", "name": "Scorching Sun"},
}

# Luggage subclasses share the base class's loot pool and display-name logic.
LUGGAGE_CLASSES = {"Luggage", "LuggageCursed"}

# Subclasses that should be handled exactly like their base class when the
# base class name never appears in the scene itself.
CLASS_ALIASES = {
    "Peak.EndgameFlareSpawner": "SingleItemSpawner",
}

FACT_FIELDS: dict[str, list[tuple[str, str, str | None, float]]] = {
    "Campfire": [
        ("burn-time", "burnsFor", "seconds", 1),
        ("cook-time", "cookTime", "seconds", 1),
        ("morale-radius", "moraleBoostRadius", "meters", 1),
        ("injury-reduction", "injuryReduction", "percent", 100),
    ],
    "Spider": [
        ("poison-per-tick", "poisonDamage", "percent", 100),
        ("poison-frequency", "poisonFrequency", "seconds", 1),
        ("web-damage", "webDamage", "percent", 100),
        ("escape-radius", "escapeRadiusForAchievement", "meters", 1),
    ],
    "Beetle": [
        ("aggro-distance", "aggroDistance", "meters", 1),
        ("attack-cooldown", "attackCooldown", "seconds", 1),
        ("bonk-force", "bonkForce", None, 1),
    ],
    "Antlion": [("escape-radius", "escapeRadiusForAchievement", "meters", 1)],
    "VenusFlyTrap": [
        ("initial-damage", "damage", "percent", 100),
        ("poison-per-tick", "poisonDamage", "percent", 100),
        ("poison-frequency", "poisonFrequency", "seconds", 1),
        ("cooldown", "cooldownTime", "seconds", 1),
    ],
    "TornadoSpawner": [
        ("first-spawn", "minSpawnTimeFirst", "seconds", 1),
        ("first-spawn-max", "maxSpawnTimeFirst", "seconds", 1),
        ("respawn-min", "minSpawnTime", "seconds", 1),
        ("respawn-max", "maxSpawnTime", "seconds", 1),
    ],
    "Peak.SpikeTrap": [
        ("warning-time", "spikeWaitTime", "seconds", 1),
        ("attack-delay", "spikeAttackWaitTime", "seconds", 1),
    ],
    "ArrowShooter": [
        ("range", "range", "meters", 1),
        ("reload-time", "reloadTime", "seconds", 1),
        ("knockback", "knockback", None, 1),
    ],
    "Peak.MovingSawBlade": [
        ("initial-damage", "initialInjury", "percent", 100),
        ("continuous-damage", "constantInjury", "percent", 100),
    ],
    "SwingingAxe": [
        ("max-damage", "maxInjury", "percent", 100),
        ("knockback", "knockback", None, 1),
    ],
    "Peak.SpikeRoller": [("damage", "injury", "percent", 100)],
    "BreakableBridge": [("person-limit", "maxPeople", "count", 1), ("break-chance", "breakChance", "percent", 100)],
    "Capybara": [("serenade-distance", "serenadeDistance", "meters", 1)],
    "GhostFire": [("light-time", "timeToLight", "seconds", 1)],
    "Lava": [("heat-per-second", "heatRate", "percent", 100)],
    "Peak.LavaSphere": [("heat-per-second", "heatRate", "percent", 100)],
    "LavaRising": [
        ("initial-wait", "initialWaitTime", "seconds", 1),
        ("travel-time", "travelTime", "seconds", 1),
    ],
    "WaterZone": [("water-depth", "waterDepth", "meters", 1)],
    "WindChillZone": [
        ("wind-force", "windForce", None, 1),
        ("chill-per-second", "statusApplicationPerSecond", "percent", 100),
    ],
    "TiedBalloon": [("pop-height", "popHeight", "meters", 1)],
    "BerryBush": [
        ("yield-min", "_berryMin", "count", 1),
        ("yield-max", "_berryMax", "count", 1),
    ],
    "LuggageCursed": [
        ("injury", "injuryAmt", "percent", 100),
    ],
    "OrbThatMakesYouSleepy": [
        ("drowsy-per-second", "maxDrowsyPerSecond", "percent", 100),
        ("range", "maxDistance", "meters", 1),
    ],
    "HotSun": [("heat-amount", "amount", "percent", 100)],
}

AGGREGATE_CLASSES = {name for name, rule in DIRECT_RULES.items() if rule.get("aggregate")}
SPAWNER_CLASSES = {"MushroomZombieSpawner", "Peak.GhostBallSpawner", "TornadoSpawner", "ScoutmasterSpawner"}
VINE_NAMES = re.compile(r"^(JungleVine|Moss Vine|SwampVine|IceVine|LavaVine)", re.IGNORECASE)
BERRY_NAMES = re.compile(r"^(berrybush|Honeycomb Spawner)", re.IGNORECASE)
RELATED_BADGES = {
    "luggage": ["Badge_Plunderer"],
    "campfire": ["Badge_HappyCamper", "Badge_Cooking"],
    "egg-nest": ["Badge_Gourmand"],
    "mushroom-patch": ["Badge_Mycology", "Badge_47_AdvancedMycology", "Badge_52_Mycoacrobatics"],
    "spider": ["Badge_45_WebSecurity"],
    "mushroom-zombie": ["Badge_46_UndeadEncounter"],
    "antlion": ["Badge_40_Megaentomology"],
    "capybara": ["Badge_AnimalSerenading"],
    "giant-tree": ["Badge_Arborist"],
    "scout-cannon": ["Badge_39_Daredevil"],
    "belltower": ["Badge_55_Bellringer"],
    "big-ghost": ["Badge_61_Exorcist"],
    "soul-pillar": ["Badge_63_RuleZero"],
    "arrow-trap": ["Badge_59_MedievalHistory", "Badge_62_Archery"],
    "spike-trap": ["Badge_59_MedievalHistory"],
    "sawblade": ["Badge_59_MedievalHistory"],
    "swinging-axe": ["Badge_59_MedievalHistory"],
    "spike-roller": ["Badge_59_MedievalHistory"],
    "early-worm": ["Badge_56_WellRested"],
}
GUIDEBOOK_BY_VARIANT = {
    "campfire": "GuidebookPage_2_Campfire",
    "mushroom-patch": "GuidebookPage_1_Mushrooms",
    "mushroom-zombie": "GuidebookPage_5_Zombies",
    "flytrap": "GuidebookPage_4_Poison",
    "belltower": "GuidebookPage_9_Gloom",
    "big-ghost": "GuidebookPage_9_Gloom",
    "respawn-statue": "GuidebookPage_3_Revival",
    "scorpion": "GuidebookPage_4_Poison",
    "spider": "GuidebookPage_4_Poison",
    "lava": "GuidebookPage_8_Magma",
    "rising-lava": "GuidebookPage_8_Magma",
    "deep-water": "GuidebookPage_6_BodyHeat",
    "storm-zone": "GuidebookPage_6_BodyHeat",
    "scorching-sun": "GuidebookPage_7_BurningSun",
    "nap-berry": "GuidebookPage_10_Sleepy",
}
def read_biome_type_names(assembly_path: Path) -> dict[int, str]:
    # Enum values are not necessarily consecutive and can change between builds.
    assembly = dnfile.dnPE(str(assembly_path))
    try:
        definitions = [row for row in assembly.net.mdtables.TypeDef if str(row.TypeName) == "BiomeType"]
        if len(definitions) != 1:
            raise ValueError("Expected exactly one BiomeType enum in the installed game assembly")
        constants = {id(row.Parent.row): row for row in assembly.net.mdtables.Constant}
        names = {}
        for field in definitions[0].FieldList:
            constant = constants.get(id(field.row))
            if constant is not None:
                value = int.from_bytes(constant.Value.value, "little", signed=True)
                names[value] = str(field.row.Name)
        if names.get(0) != "Shore":
            raise ValueError("Could not decode the installed game's biome enum")
        return names
    finally:
        assembly.close()


OFFICIAL_BIOME_NAMES = {
    "Shore": "Shore",
    "Tropics": "Tropics",
    "Alpine": "Alpine",
    "Mesa": "Mesa",
    "Roots": "Roots",
}
PAIRED_BIOME_NAMES = {
    "Volcano": ("Caldera", "The Kiln"),
    "Swamp": ("Gloom", "The Citadel"),
}
EXPECTED_ROUTE_SLOTS = (
    {"Shore"},
    {"Tropics", "Roots"},
    {"Alpine", "Mesa"},
    {"Caldera", "Gloom"},
    {"The Kiln", "The Citadel"},
)


def official_biome_name(internal_name: str, slot: int) -> str:
    """Translate game-internal biome names without leaking scene codenames."""
    if internal_name in PAIRED_BIOME_NAMES:
        if slot not in (4, 5):
            raise ValueError(f"Internal biome {internal_name} appeared in route slot {slot}")
        return PAIRED_BIOME_NAMES[internal_name][slot - 4]
    if internal_name not in OFFICIAL_BIOME_NAMES:
        raise ValueError(f"No verified official name for internal biome {internal_name}")
    return OFFICIAL_BIOME_NAMES[internal_name]


def derive_official_biome_route(
    data: dict[str, Any],
    biome_type_names: dict[int, str],
) -> list[str]:
    """Resolve the five effective map segments and return their official names."""
    selected_biomes = {int(value) for value in data.get("biomes", [])}
    for value in selected_biomes:
        if value not in biome_type_names:
            raise ValueError(f"Unknown biome enum value {value}")

    segments = list(data.get("segments", []))
    variants = list(data.get("variantSegments", []))
    if len(segments) != len(EXPECTED_ROUTE_SLOTS):
        raise ValueError(f"Expected five route segments, found {len(segments)}")

    route: list[str] = []
    for offset, segment in enumerate(segments):
        effective_segment = segment
        if segment.get("hasVariant"):
            variant_index = int(segment.get("variantBiomeIndex", -1))
            if not 0 <= variant_index < len(variants):
                raise ValueError(f"Invalid variant biome index {variant_index} in route slot {offset + 1}")
            variant = variants[variant_index]
            if int(variant.get("_biome", -1)) in selected_biomes:
                effective_segment = variant

        biome_value = int(effective_segment.get("_biome", -1))
        internal_name = biome_type_names.get(biome_value)
        if internal_name is None:
            raise ValueError(f"Unknown biome enum value {biome_value} in route slot {offset + 1}")
        official_name = official_biome_name(internal_name, offset + 1)
        if official_name not in EXPECTED_ROUTE_SLOTS[offset]:
            raise ValueError(f"Unexpected biome {official_name} in route slot {offset + 1}")
        route.append(official_name)

    expected_final = "The Kiln" if route[3] == "Caldera" else "The Citadel"
    if route[4] != expected_final:
        raise ValueError(f"Invalid final biome pairing: {route[3]} cannot lead to {route[4]}")
    return route


GUIDEBOOK_TEXT_KEYS = {
    "GuidebookPage_1_Mushrooms": ("TITLE_BONUSRULE1", "BODY_BONUSRULE1"),
    "GuidebookPage_2_Campfire": ("TITLE_BONUSRULE2", "BODY_BONUSRULE2"),
    "GuidebookPage_3_Revival": ("TITLE_BONUSRULE3", "BODY_BONUSRULE3"),
    "GuidebookPage_4_Poison": ("TITLE_BONUSRULE8", "BODY_BONUSRULE8"),
    "GuidebookPage_5_Zombies": ("TITLE_BONUSRULE7", "BODY_BONUSRULE7"),
    "GuidebookPage_6_BodyHeat": ("TITLE_BONUSRULE4", "BODY_BONUSRULE4"),
    "GuidebookPage_7_BurningSun": ("TITLE_BONUSRULE6", "BODY_BONUSRULE6"),
    "GuidebookPage_8_Magma": ("TITLE_BONUSRULE9", "BODY_BONUSRULE9"),
    "GuidebookPage_9_Gloom": ("TITLE_BONUSRULE10", "BODY_BONUSRULE10"),
    "GuidebookPage_10_Sleepy": ("TITLE_BONUSRULE5", "BODY_BONUSRULE5"),
}


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def compact_number(value: float) -> int | float:
    rounded = round(float(value), 3)
    return int(rounded) if rounded.is_integer() else rounded


def quaternion_matrix(rotation: Any) -> np.ndarray:
    x, y, z, w = float(rotation.x), float(rotation.y), float(rotation.z), float(rotation.w)
    length = x * x + y * y + z * z + w * w
    if length < 1e-12:
        return np.identity(4)
    scale = 2.0 / length
    xx, yy, zz = x * x * scale, y * y * scale, z * z * scale
    xy, xz, yz = x * y * scale, x * z * scale, y * z * scale
    wx, wy, wz = w * x * scale, w * y * scale, w * z * scale
    return np.array(
        [
            [1 - yy - zz, xy - wz, xz + wy, 0],
            [xy + wz, 1 - xx - zz, yz - wx, 0],
            [xz - wy, yz + wx, 1 - xx - yy, 0],
            [0, 0, 0, 1],
        ],
        dtype=float,
    )


def local_matrix(transform: Any) -> np.ndarray:
    position = transform.m_LocalPosition
    scale = transform.m_LocalScale
    translation = np.identity(4)
    translation[:3, 3] = [float(position.x), float(position.y), float(position.z)]
    scaling = np.diag([float(scale.x), float(scale.y), float(scale.z), 1.0])
    return translation @ quaternion_matrix(transform.m_LocalRotation) @ scaling


def script_name(script: Any) -> str:
    namespace = str(getattr(script, "m_Namespace", "") or "")
    class_name = str(getattr(script, "m_ClassName", "") or "")
    return f"{namespace}.{class_name}" if namespace else class_name


def mono_header(raw: bytes) -> tuple[int, int] | None:
    if len(raw) < 28:
        return None
    return struct.unpack_from("<q", raw, 4)[0], struct.unpack_from("<q", raw, 20)[0]


def build_id() -> str:
    if not APP_MANIFEST.exists():
        return "unknown"
    match = re.search(r'"buildid"\s+"(\d+)"', APP_MANIFEST.read_text(encoding="utf-8", errors="ignore"))
    return match.group(1) if match else "unknown"


def pointer(data: dict[str, Any] | None) -> tuple[int, int]:
    if not data:
        return 0, 0
    return int(data.get("m_FileID", 0)), int(data.get("m_PathID", 0))


def item_can_be_cooked(component: Any | None, nodes: Any = None) -> bool:
    # Item.Awake adds ItemCooking when absent; canBeCooked is !disableCooking.
    if component is None:
        return True
    reader = EndianBinaryReader(component.get_raw_data(), endian="<")
    config = TypeTreeHelper.TypeTreeConfig(True, component.assets_file, False)
    # Stop before the unrelated managed-reference cooking behaviors, which may
    # not have generated type trees for every concrete behavior class.
    for field in nodes.m_Children:
        value = TypeTreeHelper.read_value(field, reader, config)
        if field.m_Name == "disableCooking":
            return not bool(value)
    raise ValueError("ItemCooking is missing disableCooking")


@dataclass
class AssetContext:
    name: str
    environment: Any

    @property
    def file(self) -> Any:
        return self.environment.objects[0].assets_file


class GameDataScanner:
    def __init__(self, game_root: Path, output_path: Path) -> None:
        self.game_root = game_root
        self.data_root = game_root / "PEAK_Data"
        self.output_path = output_path
        self.config = read_json(CONFIG_PATH)
        self.biome_type_names = read_biome_type_names(self.data_root / "Managed" / "Assembly-CSharp.dll")
        version_lines = (game_root / "version.txt").read_text(encoding="utf-8").splitlines()
        self.game_version = version_lines[0].strip()
        self.revision = version_lines[1].strip() if len(version_lines) > 1 else "unknown"
        self.generator = TypeTreeGenerator("6000.3.15f1")
        self.generator.load_local_game(str(game_root))
        self.bundle_environment = None
        self.bundle_files = {}
        bundle_path = self.data_root / "data.unity3d"
        if bundle_path.is_file():
            self.bundle_environment = UnityPy.load(str(bundle_path))
            for asset in self.bundle_environment.assets:
                name = str(asset.name).replace("\\", "/").rsplit("/", 1)[-1]
                if name in self.bundle_files:
                    raise ValueError(f"Duplicate bundled asset: {name}")
                self.bundle_files[name] = asset
        self.global_environment = self.load_asset("globalgamemanagers.assets")
        self.script_ids: dict[int, str] = {}
        for obj in self.global_environment.objects:
            if obj.type.name == "MonoScript":
                self.script_ids[obj.path_id] = script_name(obj.read())
        self.node_cache: dict[str, Any] = {}
        self.asset_contexts: dict[str, AssetContext] = {}
        for filename in ("resources.assets", "sharedassets1.assets", "sharedassets3.assets", "sharedassets4.assets"):
            self.asset_contexts[filename] = AssetContext(filename, self.load_asset(filename))
        self.resources = self.asset_contexts["resources.assets"].file
        self.item_by_game_object: dict[tuple[str, int], int] = {}
        self.item_by_id: dict[int, dict[str, Any]] = {}
        self.localization = self.extract_localization()

    def load_asset(self, name: str) -> Any:
        if getattr(self, "bundle_environment", None) is not None:
            asset = self.bundle_files.get(name)
            if asset is None:
                raise ValueError(f"Required asset is missing from data.unity3d: {name}")
            return SimpleNamespace(objects=list(asset.objects.values()))
        return UnityPy.load(str(self.data_root / name))

    def nodes(self, class_name: str) -> Any:
        if class_name not in self.node_cache:
            self.node_cache[class_name] = self.generator.get_nodes_up("Assembly-CSharp.dll", class_name)
        return self.node_cache[class_name]

    def class_for_object(self, obj: Any) -> str | None:
        if obj.type.name != "MonoBehaviour":
            return None
        header = mono_header(obj.get_raw_data())
        return self.script_ids.get(header[1]) if header else None

    def external_name(self, asset_file: Any, file_id: int) -> str | None:
        if file_id == 0:
            return None
        try:
            path = str(asset_file.externals[file_id - 1].path).replace("\\", "/")
            return path.rsplit("/", 1)[-1]
        except (IndexError, AttributeError):
            return None

    def resolve_reader(self, current: AssetContext, ptr: dict[str, Any] | None) -> tuple[str, Any] | None:
        file_id, path_id = pointer(ptr)
        if not path_id:
            return None
        if file_id == 0:
            target = current
        else:
            target_name = self.external_name(current.file, file_id)
            target = self.asset_contexts.get(target_name or "")
            if target is None:
                return None
        reader = target.file.objects.get(path_id)
        return (target.name, reader) if reader else None

    def game_object_name(self, context: AssetContext, ptr: dict[str, Any] | None) -> str | None:
        resolved = self.resolve_reader(context, ptr)
        if not resolved:
            return None
        try:
            return str(resolved[1].read().m_Name)
        except Exception:
            return None

    def extract_items(self) -> list[dict[str, Any]]:
        context = self.asset_contexts["resources.assets"]
        component_map: dict[int, list[Any]] = defaultdict(list)
        game_objects: dict[int, Any] = {}
        for obj in context.environment.objects:
            if obj.type.name == "GameObject":
                game_objects[obj.path_id] = obj.read()
            elif obj.type.name == "MonoBehaviour":
                header = mono_header(obj.get_raw_data())
                if header:
                    component_map[header[0]].append(obj)

        database_component = next(
            (
                obj
                for obj in context.environment.objects
                if obj.type.name == "MonoBehaviour" and self.class_for_object(obj) == "ItemDatabase"
            ),
            None,
        )
        if database_component is None:
            raise RuntimeError("ItemDatabase was not found in resources.assets")
        database = database_component.read_typetree(nodes=self.nodes("ItemDatabase"))
        registered_item_ids = {
            int(entry.get("m_PathID", 0))
            for entry in database.get("Objects", [])
            if int(entry.get("m_FileID", 0)) == 0 and int(entry.get("m_PathID", 0))
        }

        effect_classes = {
            "Action_RestoreHunger",
            "Action_ModifyStatus",
            "Action_GiveExtraStamina",
            "Action_InflictPoison",
            "Action_ClearAllStatus",
            "Action_Numb",
            "Action_ApplyInfiniteStamina",
            "RopeSpool",
            "RopeShooter",
            "Lantern",
            "Peak.WarpOnThrow",
            "Action_CallScoutmaster",
            "Action_LaunchPlayer",
        }
        items: list[dict[str, Any]] = []
        display_ids: set[int] = set()
        for item_component_id in sorted(registered_item_ids):
            item_component = context.file.objects.get(item_component_id)
            item_class = self.class_for_object(item_component) if item_component else None
            if item_component is None or item_class is None:
                continue
            data = item_component.read_typetree(nodes=self.nodes(item_class))
            display_id = int(data.get("itemID", -1))
            if display_id < 0:
                continue
            if display_id in display_ids:
                raise RuntimeError(f"Duplicate registered itemID {display_id}")
            display_ids.add(display_id)
            game_object_id = int(data.get("m_GameObject", {}).get("m_PathID", 0))
            components = component_map.get(game_object_id, [])
            item_id = int(item_component.path_id)
            ui = data.get("UIData", {})
            prefab_name = str(game_objects.get(game_object_id).m_Name) if game_object_id in game_objects else f"Item {item_id}"
            display_name = str(ui.get("itemName") or prefab_name)
            loot_component = next((obj for obj in components if self.class_for_object(obj) == "LootData"), None)
            loot = loot_component.read_typetree(nodes=self.nodes("LootData")) if loot_component else None
            effects: list[dict[str, Any]] = []
            cooking_component = next((obj for obj in components if self.class_for_object(obj) == "ItemCooking"), None)
            cookable = item_can_be_cooked(cooking_component, self.nodes("ItemCooking") if cooking_component else None)
            for component in components:
                class_name = self.class_for_object(component)
                if class_name not in effect_classes:
                    continue
                try:
                    effect_data = component.read_typetree(nodes=self.nodes(class_name))
                except Exception:
                    continue
                effect: dict[str, Any] = {"type": self.effect_type(class_name)}
                if class_name == "Action_RestoreHunger":
                    effect["amount"] = compact_number(float(effect_data.get("restorationAmount", 0)) * 100)
                    effect["status"] = "hunger"
                elif class_name == "Action_ModifyStatus":
                    effect["amount"] = compact_number(float(effect_data.get("changeAmount", 0)) * 100)
                    effect["status"] = STATUS_NAMES.get(int(effect_data.get("statusType", -1)), "unknown")
                elif class_name == "Action_GiveExtraStamina":
                    effect["amount"] = compact_number(float(effect_data.get("amount", 0)) * 100)
                elif class_name == "Action_InflictPoison":
                    effect.update(
                        amount=compact_number(float(effect_data.get("poisonPerSecond", 0)) * 100),
                        duration=compact_number(float(effect_data.get("inflictionTime", 0))),
                        delay=compact_number(float(effect_data.get("delay", 0))),
                    )
                else:
                    for key in ("amount", "buffTime", "numbAmount", "length", "maxLength", "startingFuel", "forcedChaseTime", "force"):
                        if key in effect_data:
                            effect[key] = compact_number(effect_data[key])
                effects.append(effect)

            tags = self.item_tags(int(data.get("itemTags", 0)))
            icon_path = self.output_path.parent / "items" / f"{display_id}.png"
            item = {
                "id": item_id,
                "displayId": display_id,
                "name": display_name,
                "prefab": prefab_name,
                "icon": f"./data/peak/items/{display_id}.png" if icon_path.exists() else None,
                "weight": int(data.get("carryWeight", 0)),
                "mass": compact_number(data.get("mass", 0)),
                "uses": None if int(data.get("totalUses", -1)) < 0 else int(data.get("totalUses", 0)),
                "tags": tags,
                "primaryAction": ui.get("mainInteractPrompt") or None,
                "secondaryAction": ui.get("secondaryInteractPrompt") or None,
                "canPocket": bool(ui.get("canPocket", 0)),
                "canBackpack": bool(ui.get("canBackpack", 0)),
                "canThrow": bool(ui.get("canThrow", 0)),
                "cookable": cookable,
                "effects": effects,
                "baseRarity": RARITY_NAMES.get(int(loot.get("Rarity", -1))) if loot else None,
                "spawnPools": self.mask_names(int(loot.get("spawnLocations", 0))) if loot else [],
                "rarityOverrides": {
                    str(override.get("spawnPool")): RARITY_NAMES.get(int(override.get("Rarity", -1)), "common")
                    for override in (loot.get("rarityOverrides", []) if loot else [])
                },
                "banInSolo": bool(loot.get("banInSolo", 0)) if loot else False,
            }
            items.append(item)
            self.item_by_game_object[(context.name, game_object_id)] = item_id
            self.item_by_id[item_id] = item
        items.sort(key=lambda item: item["id"])
        return items

    def extract_localization(self) -> dict[str, list[Any]]:
        for obj in self.asset_contexts["resources.assets"].environment.objects:
            if obj.type.name != "TextAsset":
                continue
            asset = obj.read()
            if str(asset.m_Name) != "SerializedTermsData":
                continue
            script = asset.m_Script
            text = bytes(script).decode("utf-8") if not isinstance(script, str) else script
            return json.loads(text)
        return {}

    def extract_badges(self) -> list[dict[str, Any]]:
        context = self.asset_contexts["sharedassets3.assets"]
        badges: list[dict[str, Any]] = []
        for obj in context.environment.objects:
            if self.class_for_object(obj) != "BadgeData":
                continue
            try:
                data = obj.read_typetree(nodes=self.nodes("BadgeData"))
            except Exception:
                continue
            badge_id = str(data.get("m_Name") or f"badge-{obj.path_id}")
            badges.append(
                {
                    "id": badge_id,
                    "name": str(data.get("displayName") or badge_id),
                    "description": str(data.get("description") or ""),
                    "secret": bool(data.get("secret", 0)),
                    "visualId": int(data.get("visualID", -1)),
                }
            )
        badges.sort(key=lambda badge: badge["visualId"])
        return badges

    def extract_guidebook(self) -> list[dict[str, Any]]:
        context = self.asset_contexts["resources.assets"]
        pages: list[dict[str, Any]] = []
        for obj in context.environment.objects:
            if self.class_for_object(obj) != "Guidebook":
                continue
            try:
                data = obj.read_typetree(nodes=self.nodes("Guidebook"))
            except Exception:
                continue
            game_object_id = pointer(data.get("m_GameObject"))[1]
            game_object = context.file.objects.get(game_object_id)
            if game_object is None:
                continue
            name = str(game_object.read().m_Name)
            if name not in GUIDEBOOK_TEXT_KEYS:
                continue
            title_key, body_key = GUIDEBOOK_TEXT_KEYS[name]
            title = str((self.localization.get(title_key) or [name])[0])
            body = str((self.localization.get(body_key) or [""])[0])
            pages.append(
                {
                    "id": name,
                    "title": title,
                    "body": body,
                    "pageFlag": int(data.get("pageFlag", 0)),
                    "minimumSegment": int(data.get("minimumSegment", 0)),
                    "minimumHeight": compact_number(data.get("minSpawnHeight", 0)),
                    "requiredBiome": int(data.get("requiredBiome", 0)) if data.get("requireBiomeType") else None,
                }
            )
        pages.sort(key=lambda page: page["pageFlag"])
        return pages

    @staticmethod
    def effect_type(class_name: str) -> str:
        return {
            "Action_RestoreHunger": "restore-status",
            "Action_ModifyStatus": "modify-status",
            "Action_GiveExtraStamina": "bonus-stamina",
            "Action_InflictPoison": "poison-over-time",
            "Action_ClearAllStatus": "clear-statuses",
            "Action_Numb": "numb",
            "Action_ApplyInfiniteStamina": "infinite-stamina",
            "RopeSpool": "rope",
            "RopeShooter": "rope-cannon",
            "Lantern": "light",
            "Peak.WarpOnThrow": "warp",
            "Action_CallScoutmaster": "call-scoutmaster",
            "Action_LaunchPlayer": "launch-player",
        }.get(class_name, class_name)

    @staticmethod
    def item_tags(mask: int) -> list[str]:
        values = {
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
        return [name for value, name in values.items() if mask & value]

    @staticmethod
    def mask_names(mask: int) -> list[str]:
        return [name for value, name in SPAWN_POOLS.items() if mask & value]

    def extract_loot_pools(self) -> list[dict[str, Any]]:
        pools: list[dict[str, Any]] = []
        for pool_id, name in LUGGAGE_POOL_NAMES.items():
            entries = []
            for item in self.item_by_id.values():
                if name not in item["spawnPools"]:
                    continue
                rarity = item["rarityOverrides"].get(str(pool_id), item["baseRarity"])
                if rarity is None:
                    continue
                entries.append({"itemId": item["id"], "rarity": rarity, "weight": RARITY_WEIGHTS[rarity]})
            total = sum(entry["weight"] for entry in entries)
            for entry in entries:
                entry["chance"] = round(entry["weight"] / total * 100, 1) if total else 0
            entries.sort(key=lambda entry: (-entry["weight"], self.item_by_id[entry["itemId"]]["name"]))
            if entries:
                pools.append({"id": str(pool_id), "name": name, "items": entries})
        return pools

    def load_spawn_list(self, context: AssetContext, ptr: dict[str, Any] | None) -> list[int]:
        resolved = self.resolve_reader(context, ptr)
        if not resolved or resolved[1].type.name != "MonoBehaviour":
            return []
        target_context = self.asset_contexts.get(resolved[0])
        if target_context is None or self.class_for_object(resolved[1]) != "SpawnList":
            return []
        try:
            data = resolved[1].read_typetree(nodes=self.nodes("SpawnList"))
        except Exception:
            return []
        result: list[int] = []
        for entry in data.get("items", []):
            prefab = self.resolve_reader(target_context, entry.get("prefab"))
            if prefab:
                item_id = self.item_by_game_object.get((prefab[0], prefab[1].path_id))
                if item_id is not None:
                    result.append(item_id)
        return sorted(set(result))

    def derive_levels(self) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        # The build settings scene list is the authoritative source for the
        # daily rotation (Level_N scenes) and for each scene's levelN asset
        # file, which is named after the scene's build index.
        boot = self.load_asset("globalgamemanagers")
        scenes: list[str] = []
        for obj in boot.objects:
            if obj.type.name == "BuildSettings":
                scenes = [str(scene) for scene in obj.read().scenes]
        daily: list[dict[str, Any]] = []
        special: list[dict[str, Any]] = []
        for build_index, path in enumerate(scenes):
            scene_name = path.rsplit("/", 1)[-1].removesuffix(".unity")
            asset_file = f"level{build_index}"
            match = re.fullmatch(r"Level_(\d+)", scene_name)
            if match:
                index = int(match.group(1))
                daily.append(
                    {
                        "index": index,
                        "number": index + 1,
                        "scene": scene_name,
                        "assetFile": asset_file,
                        "kind": "daily",
                    }
                )
            elif scene_name == "WilIsland":
                # The final island is the VoidBiome subtree, not this entire
                # fallback daily scene. Require the component before exporting.
                candidate = self.load_asset(asset_file)
                has_final_biome = False
                for obj in candidate.objects:
                    if obj.type.name != "MonoBehaviour":
                        continue
                    header = mono_header(obj.get_raw_data())
                    if header and self.script_ids.get(header[1]) == "Peak.VoidBiome":
                        has_final_biome = True
                        break
                if not has_final_biome:
                    raise ValueError("Final island component is missing; refusing an incomplete release")
                special.append(
                    {
                        "index": None,
                        "number": None,
                        "scene": scene_name,
                        "assetFile": asset_file,
                        "kind": "final",
                        "captureRootComponent": "Peak.VoidBiome",
                        "title": "The Final Ascent",
                    }
                )
        daily.sort(key=lambda level: level["index"])
        if len(special) != 1:
            raise ValueError("Final island source is missing; refusing an incomplete release")
        special = [{**level, "index": None, "number": None, "kind": "final",
                    "title": "The Final Ascent", "captureRootComponent": "Peak.VoidBiome"}
                   for level in daily] + special
        return daily, special

    @staticmethod
    def clean_segment_name(name: str) -> str:
        value = re.sub(r"^(Seg(ment)?[_ ]?|Biome[_ ]?|Map[_ ]?)", "", name, flags=re.IGNORECASE)
        value = value.replace("_", " ").strip()
        return value or name

    def derive_scene_metadata(
        self,
        level: dict[str, Any],
        components: list[tuple[Any, str, int]],
        game_objects: dict[int, Any],
    ) -> dict[str, Any]:
        # Seed, biome list, and segment variants all live in the baked scene,
        # so nothing about the level list needs to be maintained by hand.
        metadata: dict[str, Any] = {}
        for obj, class_name, _ in components:
            if class_name != "LevelGeneration":
                continue
            try:
                metadata["seed"] = int(obj.read_typetree(nodes=self.nodes("LevelGeneration")).get("seed", 0))
            except Exception:
                pass
            break

        biomes: list[str] = []
        variants: list[str] = []
        for obj, class_name, _ in components:
            if class_name != "MapHandler":
                continue
            try:
                data = obj.read_typetree(nodes=self.nodes("MapHandler"))
            except Exception:
                break
            try:
                biomes = derive_official_biome_route(data, self.biome_type_names)
            except ValueError as error:
                raise ValueError(f"Could not resolve the official biome route for {level['scene']}: {error}") from error
            for segment in list(data.get("segments", [])) + list(data.get("variantSegments", [])):
                parent_id = pointer(segment.get("_segmentParent"))[1]
                parent = game_objects.get(parent_id)
                if parent is not None:
                    variants.append(self.clean_segment_name(str(parent.m_Name)))
            break

        if biomes:
            metadata["biomes"] = biomes
        metadata["variants"] = variants
        if not level.get("title"):
            # Segment objects carry only generic names in the current build,
            # so the biome route is the most descriptive stable title.
            metadata["title"] = " · ".join(biomes) if biomes else "Standard Route"
        return metadata

    def scan_level(self, level: dict[str, Any]) -> dict[str, Any]:
        environment = self.load_asset(level["assetFile"])
        context = AssetContext(level["assetFile"], environment)
        self.asset_contexts[context.name] = context
        asset_file = context.file
        game_objects: dict[int, Any] = {}
        transforms: dict[int, Any] = {}
        transform_for_game_object: dict[int, int] = {}
        components: list[tuple[Any, str, int]] = []
        components_by_game_object: dict[int, dict[str, Any]] = defaultdict(dict)

        renderer_game_objects: set[int] = set()
        is_final = level.get("kind") == "final"

        for obj in environment.objects:
            if obj.type.name == "GameObject":
                game_objects[obj.path_id] = obj.read()
            elif obj.type.name in ("Transform", "RectTransform"):
                transform = obj.read()
                transforms[obj.path_id] = transform
                transform_for_game_object[transform.m_GameObject.path_id] = obj.path_id
            elif obj.type.name == "MonoBehaviour":
                header = mono_header(obj.get_raw_data())
                if not header:
                    continue
                class_name = self.class_for_object(obj)
                if class_name:
                    components.append((obj, class_name, header[0]))
                    components_by_game_object[header[0]][class_name] = obj
            elif is_final and obj.type.name == "MeshRenderer":
                # Only the special scene needs renderer positions: its world
                # bounds are not covered by the shared daily projection.
                try:
                    renderer_game_objects.add(obj.read().m_GameObject.path_id)
                except Exception:
                    continue

        level = {**level, **self.derive_scene_metadata(level, components, game_objects)}
        final_roots = {game_object_id for _, class_name, game_object_id in components
                       if class_name == "Peak.VoidBiome"}
        if is_final and len(final_roots) != 1:
            raise ValueError(f"Expected one final island in {level['scene']}, found {len(final_roots)}")
        if is_final:
            level = {**level, "biomes": ["Void"], "variants": [], "captureRootComponent": "Peak.VoidBiome"}

        world_cache: dict[int, np.ndarray] = {}
        hierarchy_cache: dict[int, list[tuple[int, str]]] = {}
        active_cache: dict[int, bool] = {}

        def world_matrix(transform_id: int) -> np.ndarray:
            if transform_id in world_cache:
                return world_cache[transform_id]
            transform = transforms[transform_id]
            matrix = local_matrix(transform)
            parent_id = transform.m_Father.path_id
            if parent_id and parent_id in transforms:
                matrix = world_matrix(parent_id) @ matrix
            world_cache[transform_id] = matrix
            return matrix

        def hierarchy(game_object_id: int) -> list[tuple[int, str]]:
            if game_object_id in hierarchy_cache:
                return hierarchy_cache[game_object_id]
            result: list[tuple[int, str]] = []
            transform_id = transform_for_game_object.get(game_object_id)
            while transform_id and transform_id in transforms:
                transform = transforms[transform_id]
                parent_id = transform.m_Father.path_id
                if not parent_id or parent_id not in transforms:
                    break
                parent = transforms[parent_id]
                parent_game_object_id = parent.m_GameObject.path_id
                parent_game_object = game_objects.get(parent_game_object_id)
                if parent_game_object is None:
                    break
                result.append((parent_game_object_id, str(parent_game_object.m_Name)))
                transform_id = parent_id
            hierarchy_cache[game_object_id] = result
            return result

        def is_active(game_object_id: int) -> bool:
            if game_object_id in active_cache:
                return active_cache[game_object_id]
            game_object = game_objects.get(game_object_id)
            chain = hierarchy(game_object_id)
            inside_final = game_object_id in final_roots or any(parent_id in final_roots for parent_id, _ in chain)
            if inside_final != is_final:
                active_cache[game_object_id] = False
                return False
            if game_object is None or not bool(game_object.m_IsActive):
                active_cache[game_object_id] = False
                return False
            value = all(bool(game_objects[parent_id].m_IsActive) for parent_id, _ in chain if parent_id in game_objects)
            active_cache[game_object_id] = value
            return value

        projection = self.config["projection"]

        def position(game_object_id: int) -> tuple[float, float, float] | None:
            transform_id = transform_for_game_object.get(game_object_id)
            if not transform_id:
                return None
            point = world_matrix(transform_id) @ np.array([0, 0, 0, 1], dtype=float)
            return float(point[0]), float(point[1]), float(point[2])

        def region_for(game_object_id: int, y: float) -> tuple[str, int | None]:
            if is_final:
                return "Void", None
            biomes = level.get("biomes") or []
            for _, name in hierarchy(game_object_id):
                match = re.fullmatch(r"Biome_(\d+)", name)
                if match:
                    slot = int(match.group(1))
                    if 1 <= slot <= len(biomes):
                        return biomes[slot - 1], slot
            thresholds = ((250, 1), (600, 2), (850, 3), (float("inf"), 4))
            slot = next(slot for maximum, slot in thresholds if y < maximum)
            if not biomes:
                return "Unknown", slot
            return biomes[min(slot - 1, len(biomes) - 1)], slot

        if is_final and renderer_game_objects:
            # The special scene lies outside the shared daily bounds, so its
            # projection comes from the island's own renderer positions. The
            # square-ified span keeps captures and markers pixel-consistent.
            xs: list[float] = []
            zs: list[float] = []
            for renderer_game_object_id in renderer_game_objects:
                if not is_active(renderer_game_object_id):
                    continue
                world = position(renderer_game_object_id)
                if world is not None:
                    xs.append(world[0])
                    zs.append(world[2])
            if xs:
                x_min, x_max = (float(value) for value in np.percentile(xs, [0.5, 99.5]))
                z_min, z_max = (float(value) for value in np.percentile(zs, [0.5, 99.5]))
                span = max(x_max - x_min, z_max - z_min) * 1.05
                center_x = (x_min + x_max) / 2
                center_z = (z_min + z_max) / 2
                projection = {
                    **projection,
                    "worldXMin": round(center_x - span / 2, 3),
                    "worldXMax": round(center_x + span / 2, 3),
                    "worldZMin": round(center_z - span / 2, 3),
                    "worldZMax": round(center_z + span / 2, 3),
                }

        def map_position(x: float, z: float) -> dict[str, float]:
            map_x = projection["mapXMin"] + (x - projection["worldXMin"]) / (projection["worldXMax"] - projection["worldXMin"]) * (projection["mapXMax"] - projection["mapXMin"])
            map_y = projection["mapYMin"] + (projection["worldZMax"] - z) / (projection["worldZMax"] - projection["worldZMin"]) * (projection["mapYMax"] - projection["mapYMin"])
            return {"x": round(map_x, 3), "y": round(map_y, 3)}

        candidates: list[dict[str, Any]] = []

        def append_marker(
            obj: Any,
            class_name: str,
            game_object_id: int,
            category: str,
            variant: str,
            name: str,
            confidence: str = "exact",
            data: dict[str, Any] | None = None,
            items: list[dict[str, Any]] | None = None,
            aggregate_key: str | None = None,
        ) -> None:
            if not is_active(game_object_id):
                return
            world = position(game_object_id)
            if world is None:
                return
            x, y, z = world
            # The void's off-island fall-water volume has no visible point on
            # the island. Do not turn its distant volume origin into a marker.
            projected = map_position(x, z)
            if is_final and class_name == "WaterZone" and not all(0 <= value <= 100 for value in projected.values()):
                return
            region, biome_slot = region_for(game_object_id, y)
            game_object_name = str(game_objects[game_object_id].m_Name)
            facts = self.facts_for(class_name, data or {})
            content: dict[str, Any] = {
                "variant": variant,
                "name": name,
                "facts": facts,
            }
            if variant in RELATED_BADGES:
                content["relatedAchievementIds"] = list(RELATED_BADGES[variant])
            if variant == "luggage" and data and data.get("_lootPoolId") == "1073741824":
                content.setdefault("relatedAchievementIds", []).append("Badge_57_Jester")
            if variant in GUIDEBOOK_BY_VARIANT:
                content["guidebookPageId"] = GUIDEBOOK_BY_VARIANT[variant]
            if items:
                content["items"] = items
            candidates.append(
                {
                    "category": category,
                    "map": projected,
                    "world": {"x": round(x, 3), "y": round(y, 3), "z": round(z, 3)},
                    "elevation": round(y),
                    "region": region,
                    "biomeSlot": biome_slot,
                    "source": {
                        "kind": confidence,
                        "component": class_name,
                        "gameObject": game_object_name,
                        "sceneAsset": level["assetFile"],
                        "pathId": obj.path_id,
                    },
                    "content": content,
                    "exact": confidence == "exact",
                    "aggregateKey": aggregate_key,
                }
            )

        for obj, class_name, game_object_id in components:
            game_object = game_objects.get(game_object_id)
            if game_object is None or not is_active(game_object_id):
                continue
            game_object_name = str(game_object.m_Name)

            if class_name in DIRECT_RULES:
                rule = DIRECT_RULES[class_name]
                if is_final and class_name == "LavaRising":
                    rule = {**rule, "variant": "rising-ghosts", "name": "Rising Ghosts"}
                try:
                    data = obj.read_typetree(nodes=self.nodes(class_name))
                except Exception:
                    data = {}
                name = self.marker_name(class_name, game_object_name, data, rule["name"])
                content_items: list[dict[str, Any]] | None = None
                if class_name in LUGGAGE_CLASSES:
                    pool_id = self.luggage_pool(data)
                    if pool_id:
                        data["_lootPoolId"] = str(pool_id)
                confidence = "spawn-point" if class_name in SPAWNER_CLASSES else "exact"
                aggregate_key = None
                if class_name == "Peak.Island.RavenPerch":
                    # Perches have no shared parent, so they cluster spatially:
                    # one zone marker per 40-meter cell instead of thousands of
                    # individual dots.
                    world = position(game_object_id)
                    if world is not None:
                        aggregate_key = f"{class_name}:{round(world[0] / 40)}:{round(world[2] / 40)}"
                elif class_name in AGGREGATE_CLASSES:
                    parent_id = hierarchy(game_object_id)[0][0] if hierarchy(game_object_id) else game_object_id
                    aggregate_key = f"{class_name}:{parent_id}"
                append_marker(
                    obj,
                    class_name,
                    game_object_id,
                    rule["category"],
                    rule["variant"],
                    name,
                    confidence,
                    data,
                    content_items,
                    aggregate_key,
                )
                continue

            if class_name == "BerryBush" and (game_object_name == "EggNestRaven" or BERRY_NAMES.match(game_object_name)):
                try:
                    data = obj.read_typetree(nodes=self.nodes(class_name))
                except Exception:
                    continue
                # The current build no longer serializes the spawned prefab,
                # but the possible yield range is still available.
                amount = data.get("possibleBerries", {})
                minimum = int(round(float(amount.get("x", 0))))
                maximum = int(round(float(amount.get("y", amount.get("x", 0)))))
                if maximum > 0:
                    data["_berryMin"] = minimum
                    data["_berryMax"] = maximum
                is_nest = game_object_name == "EggNestRaven"
                append_marker(
                    obj,
                    class_name,
                    game_object_id,
                    "nest" if is_nest else "forage",
                    "egg-nest" if is_nest else "berry-bush",
                    "Egg Nest" if is_nest else "Berry Bush",
                    "exact",
                    data,
                    None,
                )
                continue

            if class_name == "GroundPlaceSpawner":
                try:
                    data = obj.read_typetree(nodes=self.nodes(class_name))
                except Exception:
                    continue
                item_ids = self.load_spawn_list(context, data.get("possibleItems"))
                entries = [{"itemId": item_id, "kind": "possible"} for item_id in item_ids]
                append_marker(
                    obj,
                    class_name,
                    game_object_id,
                    "forage",
                    "mushroom-patch",
                    "Mushroom Patch",
                    "spawn-point",
                    data,
                    entries,
                )
                continue

            if CLASS_ALIASES.get(class_name, class_name) == "SingleItemSpawner":
                try:
                    data = obj.read_typetree(nodes=self.nodes(class_name))
                except Exception:
                    continue
                prefab = self.resolve_reader(context, data.get("prefab"))
                item_id = self.item_by_game_object.get((prefab[0], prefab[1].path_id)) if prefab else None
                lowered = game_object_name.lower()
                is_secret = any(token in lowered for token in ("earlyworm", "ancientidol", "bingbong"))
                category = "creature" if "scorpion" in lowered or "frog" in lowered else "environment" if "dynamite" in lowered else "guidebook" if "guidebook" in lowered else "secret" if is_secret else "forage"
                variant = "scorpion" if "scorpion" in lowered else "frog" if "frog" in lowered else "dynamite" if "dynamite" in lowered else "guidebook" if "guidebook" in lowered else "early-worm" if "earlyworm" in lowered else "ancient-idol" if "ancientidol" in lowered else "bing-bong" if "bingbong" in lowered else "item-spawn"
                if class_name == "Peak.EndgameFlareSpawner":
                    category = "respawn"
                    variant = "endgame-flare"
                label = self.item_by_id[item_id]["name"] if item_id in self.item_by_id else self.clean_spawner_name(game_object_name)
                entries = [{"itemId": item_id, "kind": "possible"}] if item_id is not None else None
                append_marker(obj, class_name, game_object_id, category, variant, label, "spawn-point", data, entries)
                continue

            if class_name == "JungleVine" and VINE_NAMES.match(game_object_name):
                try:
                    data = obj.read_typetree(nodes=self.nodes(class_name))
                except Exception:
                    data = {}
                append_marker(obj, class_name, game_object_id, "vine", "climbable-vine", game_object_name, "exact", data)

        map_slug = ("final-ascent-void" if level["scene"] == "WilIsland"
                    else f"final-ascent-{level['scene'].lower().replace('_', '-')}") if is_final else f"level-{level['index']}"
        markers = self.aggregate_markers(candidates, map_slug)
        counts = Counter(marker["category"] for marker in markers)
        hazard_summary = [
            {"variant": variant, "count": count}
            for variant, count in sorted(
                Counter(
                    marker["content"]["variant"]
                    for marker in markers
                    if marker["category"] in {"creature", "environment", "trap"}
                ).items(),
                key=lambda item: (-item[1], item[0]),
            )
        ]
        del self.asset_contexts[context.name]
        return {
            **level,
            "mapImage": f"./data/peak/maps/{map_slug}.webp",
            "projection": projection,
            "markerCounts": dict(sorted(counts.items())),
            "hazardSummary": hazard_summary,
            "markers": markers,
        }

    @staticmethod
    def clean_spawner_name(name: str) -> str:
        value = re.sub(r"[ _]*(\(spawner\)|spawner)$", "", name, flags=re.IGNORECASE)
        return value.replace("_", " ").strip().title()

    @staticmethod
    def marker_name(class_name: str, game_object_name: str, data: dict[str, Any], fallback: str) -> str:
        if class_name in LUGGAGE_CLASSES:
            return str(data.get("displayName") or fallback)
        if class_name == "Peak.MovingSawBlade" and game_object_name == "Blade":
            return "Sawblade Array"
        return fallback

    @staticmethod
    def luggage_pool(data: dict[str, Any]) -> int | None:
        pool = int(data.get("spawnPool", 0))
        if pool in LUGGAGE_POOL_NAMES:
            return pool
        for entry in data.get("heightBasedSpawnPools", []):
            candidate = int(entry.get("spawnPool", 0))
            if candidate in LUGGAGE_POOL_NAMES:
                return candidate
        return None

    @staticmethod
    def facts_for(class_name: str, data: dict[str, Any]) -> list[dict[str, Any]]:
        facts: list[dict[str, Any]] = []
        if class_name in LUGGAGE_CLASSES and data.get("_lootPoolId"):
            facts.append({"key": "loot-pool", "value": data["_lootPoolId"], "unit": "loot-pool"})
        for key, field, unit, multiplier in FACT_FIELDS.get(class_name, []):
            value = data.get(field)
            if not isinstance(value, (int, float)):
                continue
            facts.append({"key": key, "value": compact_number(float(value) * multiplier), "unit": unit})
        return facts

    @staticmethod
    def aggregate_markers(candidates: list[dict[str, Any]], map_slug: str) -> list[dict[str, Any]]:
        groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
        singles: list[dict[str, Any]] = []
        for marker in candidates:
            key = marker.pop("aggregateKey", None)
            if key:
                groups[key].append(marker)
            else:
                singles.append(marker)
        for members in groups.values():
            marker = members[0]
            count = len(members)
            marker["world"] = {
                axis: round(sum(member["world"][axis] for member in members) / count, 3)
                for axis in ("x", "y", "z")
            }
            marker["map"] = {
                axis: round(sum(member["map"][axis] for member in members) / count, 3)
                for axis in ("x", "y")
            }
            marker["elevation"] = round(marker["world"]["y"])
            marker["content"]["instances"] = count
            marker["source"]["kind"] = "exact-zone"
            marker["exact"] = True
            singles.append(marker)

        singles.sort(key=lambda marker: (marker["category"], marker["region"], marker["world"]["z"], marker["world"]["x"]))
        sequences: Counter[str] = Counter()
        for marker in singles:
            category = marker["category"]
            sequences[category] += 1
            sequence = sequences[category]
            marker["id"] = f"{map_slug}-{category}-{sequence:04d}"
            marker["sequence"] = sequence
            marker["group"] = f"{marker['region'].lower().replace(' ', '-')}-{marker.get('biomeSlot') or 0}"
            loot_fact = next((fact for fact in marker["content"].get("facts", []) if fact["key"] == "loot-pool"), None)
            if loot_fact:
                marker["content"]["lootPoolId"] = loot_fact["value"]
                marker["content"]["facts"].remove(loot_fact)
        return singles

    @staticmethod
    def validate_rotation_extension(previous: list, current: list, window: list[int]) -> None:
        if not current or [x['index'] for x in current] != list(range(len(current))):
            raise ValueError("Rotation structure changed; cannot retain out-of-window entries")
        for old, new in zip(previous, current):
            if any(old[key] != new[key] for key in ('index', 'scene', 'assetFile')):
                raise ValueError("Existing rotation scenes were reordered or rebound")
        if any(index not in window for index in range(len(previous), len(current))):
            raise ValueError("New rotation scenes fall outside the bounded seven-day window")

    def run(self, final_days: int = 7, start_index: int | None = None, previous_catalog: Path | None = None) -> dict[str, Any]:
        current_build_id = build_id()
        items = self.extract_items()
        loot_pools = self.extract_loot_pools()
        badges = self.extract_badges()
        guidebook = self.extract_guidebook()
        daily_definitions, special_definitions = self.derive_levels()
        if start_index is None:
            matchmaking_version = ".".join(self.game_version.split(".")[:2])
            with urlopen(f"https://peaklogin3.azurewebsites.net/api/VersionCheck?version={matchmaking_version}", timeout=30) as response:
                rotation = json.load(response)
            if not rotation.get("VersionOkay") or not isinstance(rotation.get("LevelIndex"), int):
                raise ValueError("Cannot establish the current seven-day final-map window")
            start_index = rotation["LevelIndex"]
        final_indices = [(start_index + offset) % len(daily_definitions)
                         for offset in range(min(final_days, len(daily_definitions)))]
        special_by_scene = {level["scene"]: level for level in special_definitions}
        special_definitions = [special_by_scene[f"Level_{index}"] for index in final_indices]
        levels = []
        previous = json.loads(previous_catalog.read_text(encoding="utf-8")) if previous_catalog else None
        if previous:
            self.validate_rotation_extension(previous["levels"], daily_definitions, final_indices)
        retained_item_ids = {}
        if previous:
            current_items = {item["displayId"]: item for item in items}
            for item in previous["items"]:
                replacement = current_items.get(item["displayId"])
                if not replacement or replacement["prefab"] != item["prefab"]:
                    raise ValueError("Cannot safely rebind retained item references")
                retained_item_ids[item["id"]] = replacement["id"]
        for level in daily_definitions:
            if previous and level["index"] not in final_indices:
                retained = json.loads(json.dumps(previous["levels"][level["index"]]))
                if retained["scene"] != level["scene"] or retained["assetFile"] != level["assetFile"]:
                    raise ValueError("Scene structure changed; cannot retain previous entry")
                retained["mapBuildId"] = retained.get("mapBuildId", previous["source"]["buildId"])
                for marker in retained["markers"]:
                    for item in marker.get("content", {}).get("items", []):
                        item["itemId"] = retained_item_ids[item["itemId"]]
                levels.append(retained)
                continue
            print(f"Scanning {level['scene']} from {level['assetFile']}...", flush=True)
            levels.append(self.scan_level(level))
            print(f"  {len(levels[-1]['markers'])} map-specific markers", flush=True)
        special_levels = []
        for level in special_definitions:
            print(f"Scanning special scene {level['scene']} from {level['assetFile']}...", flush=True)
            special_levels.append(self.scan_level(level))
            print(f"  {len(special_levels[-1]['markers'])} map-specific markers", flush=True)
        # CDN map assets are immutable. Version filenames with the Steam build
        # and optional render revision so refreshed catalogs cannot reuse cached
        # images after either kind of change. Marker IDs keep their stable
        # level slug and are therefore unaffected by this asset-only version.
        for level in [*levels, *special_levels]:
            if "mapBuildId" in level:
                continue
            level["mapBuildId"] = current_build_id
            map_path = Path(level["mapImage"])
            level["mapImage"] = "./" + str(
                map_path.with_name(f"{map_path.stem}-{current_build_id}{map_path.suffix}")
            ).replace("\\", "/")
            if "Caldera" in level["biomes"] and self.config.get("calderaMapRevision"):
                level["mapRevision"] = self.config["calderaMapRevision"]
                level["mapImage"] = level["mapImage"].replace(
                    ".webp", f"-{level['mapRevision']}.webp"
                )
        assembly_path = self.data_root / "Managed" / "Assembly-CSharp.dll"
        catalog = {
            "schemaVersion": 3,
            "source": {
                "steamAppId": 3527290,
                "overwolfGameId": 26092,
                "buildId": current_build_id,
                "gameVersion": self.game_version,
                "revision": self.revision,
                "assemblySha256": hashlib.sha256(assembly_path.read_bytes()).hexdigest(),
                "scanner": "scan-peak-game-data.py",
            },
            "rotation": {
                **self.config["rotation"],
                "levelCount": len(levels),
            },
            "markerIcons": MARKER_ICONS,
            "items": items,
            "itemIconCoverage": {
                "withSprites": sum(item["icon"] is not None for item in items),
                "withoutSprites": sorted(
                    item["displayId"] for item in items if item["icon"] is None
                ),
            },
            "lootPools": loot_pools,
            "achievements": badges,
            "guidebook": guidebook,
            "levels": levels,
            "specialLevels": special_levels,
            "finalWindow": {"levelIndices": final_indices, "days": len(final_indices)},
            "dailyWindow": {"levelIndices": final_indices, "days": len(final_indices)} if previous else None,
        }
        self.output_path.parent.mkdir(parents=True, exist_ok=True)
        self.output_path.write_text(json.dumps(catalog, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        return catalog


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build the Peak Map catalog directly from installed game assets.")
    parser.add_argument("--game-root", type=Path, default=DEFAULT_GAME_ROOT)
    parser.add_argument("--output", type=Path, default=OUTPUT_PATH)
    parser.add_argument("--final-days", type=int, choices=range(1, 8), default=7)
    parser.add_argument("--start-index", type=int, default=None)
    parser.add_argument("--previous-catalog", type=Path, default=None)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if any((args.game_root / 'PEAK_Data/StreamingAssets/maps').glob('*.assetbundle')):
        if args.output.resolve() == OUTPUT_PATH.resolve():
            raise ValueError('Streamed maps require an explicit staging --output; never replace the live local catalog during extraction')
        if args.final_days != 7 or args.start_index is not None:
            raise ValueError('Streamed maps require exactly seven days starting from the official server rotation')
        import runpy
        bundled = runpy.run_path(str(Path(__file__).with_name('scan-bundled-peak-data.py')))
        args.output.parent.mkdir(parents=True, exist_ok=True)
        bundled['BundledScanner'](args.game_root.resolve(), args.output.resolve()).run_bounded()
        return
    scanner = GameDataScanner(args.game_root.resolve(), args.output.resolve())
    catalog = scanner.run(final_days=args.final_days, start_index=args.start_index, previous_catalog=args.previous_catalog)
    marker_total = sum(len(level["markers"]) for level in catalog["levels"])
    print(f"Wrote {len(catalog['items'])} items and {marker_total} markers to {args.output}")


if __name__ == "__main__":
    main()
