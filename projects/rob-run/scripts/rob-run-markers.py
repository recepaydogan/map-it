
"""Export ROB RUN's marker sprites and resolve MapBuildingView icon types."""
from PIL import Image
import UnityPy

MARKER_SPRITES = {
    "robbery": ("Loot_3",),
    "landmark": ("CityIcon",),
    "district": ("CityIcon",),
    "settlement": ("House", "Construction"),
    "travel": ("ExitLocation",),
    "key-safe": ("Safe",),
    "drill-safe": ("mini_drill_1",),
    "safe": ("Safe",),
    "container": ("Loot_3",),
    "loose-loot": ("Loot_2", "Loot"),
    "cash-register": ("CashRegister", "LootMoney"),
    "cash": ("LootMoney",),
    "deposit-box": ("Bank_Deposit_Box_Keys",),
    "vault-loot": ("gold_bar_1", "LootMoney"),
    "trash": ("TrashBin",),
    "jewelry": ("Jewelry", "Cargo_Jewelry"),
    "medicine": ("Pharmacy",),
    "weapons-loot": ("Gun_Box",),
    "gear-loot": ("PoliceEquipmentBox",),
    "alcohol": ("Box_Of_Alcohol",),
    "electronics": ("Cargo_Electronics",),
    "car-parts": ("Cargo_Spare_Parts",),
    "drugs": ("EventCargo", "Cargo_DrugBag_01"),
    "art": ("Cargo_Statue_01",),
    "camera": ("EyeCamera",),
    "door": ("Door_Locks",),
    "alarm-panel": ("Alarm_system",),
    "metal-detector": ("Scanner", "Safety"),
    "atm": ("ATM",),
    "buyer": ("Fence",),
    "cargo-exchange": ("BuyCargo",),
    "parking": ("Parking",),
    "vendor": ("Vendor",),
    "storage": ("Storage",),
    "service": ("TaxesPointMarker",),
    "activity": ("Map_Marker",),
    "conquest": ("Defence_Point",),
    "event-cargo": ("EventCargo",),
}


def export_markers(bundles, output):
    env = UnityPy.load(str(bundles / "space-global_assets_all.bundle"))
    for bundle in bundles.glob("*__fullspriteatlas*.bundle"):
        env.load_file(str(bundle))
    env.load_file(str(bundles / "shared-global_assets_all.bundle"))
    env.load_file(str(bundles / "scriptableobjects_assets_all.bundle"))
    readers = tuple(env.objects)
    config_reader = next(obj for obj in readers
                         if obj.type.name == "MonoBehaviour" and obj.peek_name() == "MapMarkerViewDescriptions")
    config = config_reader.read_typetree()
    sprites_by_name = {}
    sprites_by_object = {}
    for obj in readers:
        if obj.type.name == "Sprite":
            sprites_by_name.setdefault(obj.peek_name().casefold(), obj)
            sprites_by_object[(obj.assets_file.name, obj.path_id)] = obj

    root = output / "maps/rob-run-icons"
    root.mkdir(parents=True, exist_ok=True)

    def save(reader, group, key):
        image = reader.read().image.convert("RGBA")
        bbox = image.getbbox()
        if bbox:
            image = image.crop(bbox)
        image.thumbnail((64, 64), Image.Resampling.LANCZOS)
        path = root / group / f"{key}.webp"
        path.parent.mkdir(exist_ok=True)
        image.save(path, lossless=True, method=4)
        return f"maps/rob-run-icons/{group}/{key}.webp"

    for category, choices in MARKER_SPRITES.items():
        sprite = next((sprites_by_name[name.casefold()] for name in choices if name.casefold() in sprites_by_name), None)
        if sprite is None:
            raise ValueError(f"Missing game sprite for {category}: {choices}")
        save(sprite, "categories", category)

    marker_icons = {}
    marker_by_id = {row["id"]: row for row in config["_markers"]}
    marker_types = {"Hospital", "Bunker", "DrugLab", "Hangar"}
    marker_values = {row["<MarkerType>k__BackingField"] for obj in readers
                     if obj.assets_file == config_reader.assets_file and obj.type.name == "MonoBehaviour"
                     and ((name := obj.peek_name()).startswith("city_") or name in ("HubBar", "HubBunker", "DrugsLab", "SettlementHangar"))
                     and "<MarkerType>k__BackingField" in (row := obj.read_typetree())}
    for name, row in marker_by_id.items():
        marker_type = row["<Marker>k__BackingField"]
        if name not in marker_types and marker_type not in marker_values:
            continue
        pointer = row["<Sprite>k__BackingField"]
        if not pointer["m_PathID"]:
            continue
        source = config_reader.assets_file.externals[pointer["m_FileID"] - 1].path.rsplit("/", 1)[-1]
        sprite = sprites_by_object[(source, pointer["m_PathID"])]
        icon_path = save(sprite, "places", name.lower())
        marker_icons[marker_type] = (icon_path, sprite.peek_name())
    return marker_icons, marker_icons[marker_by_id["Hospital"]["<Marker>k__BackingField"]]

