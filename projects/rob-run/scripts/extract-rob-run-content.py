"""Export maps and catalogs from the installed game (UnityPy, Pillow, ModernGL, NumPy)."""
import argparse
import json
import math
import re
from pathlib import Path
from runpy import run_path

from PIL import Image, ImageColor, ImageDraw
from UnityPy.helpers.MeshHelper import MeshHandler
import UnityPy


CITY_SCENE = "location-city-standalone_scenes_city_standalone.unity.bundle"
REALM_GRID = "space-realm_assets_all.bundle"
REALM_SCENE = "space-realm_scenes_all.bundle"
ATTRIBUTION = "ROB RUN game data © Kefir"
CITY_WATER = "#244653"
BUILDINGS = {
    "Bank": "Bank", "GrandHotel": "Grand Hotel", "MiniMarket": "Mini Market",
    "Pharmacy": "Pharmacy", "Hotel": "Hotel", "StripClub": "Strip Club",
    "GasStation": "Gas Station", "WeaponShop": "Gun Shop", "Gallery": "Gallery",
    "Cafe": "Café", "PoliceStation": "Police Station", "ElectronicsStore": "Electronics Store",
    "DrugWarehouse": "Drug Warehouse", "Cottage": "Cottage", "Hospital": "Hospital",
    "Jewelry": "Jewelry Store", "EquipShop": "Equipment Store", "ElectronicStore": "Electronics Store",
}
ITEM_PATTERNS = {
    "keys": r"(?:safe_key|room_key|storage_lockpick|yacht_key|vip_key|idcard_key)_1",
    "tools": r"(?:lockpick|vehicle_lockpick|drill|mini_drill|armor_plate)_1|weapon_cleaning_[123]",
    "weapons": r"weapon_[a-z]+\d+(?:_mk[234])?|(?:pistol|shotgun|rifle|smg|sniper)_ammo_\d+",
    "equipment": r"equip_(?:carbine|belt|armor|helmet|bag|backpack|vest|bodyarmor)_\d+",
    "supplies": r"(?:medicine|first_aid|bandage|medkit|repairkit|repair_kit|health_restore)_\d+",
    "valuables": r"(?:gold_bar|car_trinket|car_device|car_parts_parts|weapon_trinket|baseball_card|poker_cards|graphics_card)_\d+|cargo_(?:safe(?:_legendary)?|(?:suitcase|drugbag)(?:_[23])?|statue|cashbag|medicine|jewelry|carparts|electronics|equip|minimarket|box)",
    "materials": r"(?:car_spare_parts|weaponparts_box|reagent|electronics|wood|metal|cloth|stone)_\d+",
    "vehicles": r"default_car|police_car(?:_wild|_outrider)?|car_(?:ecu|turbocharger|engine_cooling|suspension|steering_rack|inventory|cargo)_\d+",
}


def components(game_object):
    return [(component.component.type.name, component.component.deref()) for component in game_object.m_Component]


def component(game_object, kind):
    return next((reader.read() for name, reader in components(game_object) if name == kind), None)


def behaviour(game_object, key):
    for kind, reader in components(game_object):
        if kind == "MonoBehaviour":
            data = reader.read_typetree()
            if key in data:
                return data
    raise ValueError(f"{game_object.m_Name} lacks {key}")


def find_object(environment, kind, name):
    return next(obj.read() for obj in environment.objects if obj.type.name == kind and obj.peek_name() == name)


def ancestors(transform):
    while transform.m_Father:
        transform = transform.m_Father.read()
        yield transform


def coordinates(transform):
    """Transform the object origin through each Unity parent."""
    p = transform.m_LocalPosition
    x, y, z = p.x, p.y, p.z
    for parent in ancestors(transform):
        scale, q, pos = parent.m_LocalScale, parent.m_LocalRotation, parent.m_LocalPosition
        x, y, z = x * scale.x, y * scale.y, z * scale.z
        tx, ty, tz = 2*(q.y*z-q.z*y), 2*(q.z*x-q.x*z), 2*(q.x*y-q.y*x)
        x, y, z = (
            pos.x+x+q.w*tx+q.y*tz-q.z*ty,
            pos.y+y+q.w*ty+q.z*tx-q.x*tz,
            pos.z+z+q.w*tz+q.x*ty-q.y*tx,
        )
    return x, y, z


def slug(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def marker(id, name, kind, label, position, region, **fields):
    x, y = position
    return dict(id=id, name=name, category=kind, label=label, subtype=kind,
                x=round(x, 2), y=round(y, 2), regionId=slug(region), region=region, **fields)


def save_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def render_tiles(root, name, image, background, locations, regions=(), origin=(0, 0), *,
                 extra_detail_levels=0, initial_bounds=None):
    tile_size = 256
    pixel_ratio = 2**extra_detail_levels
    width, height = (round(dimension / pixel_ratio) for dimension in image.size)
    levels = range(-extra_detail_levels, math.ceil(math.log2(max(width, height) / tile_size)) + 1)
    for level in levels:
        divisor = 2**level
        scaled = image if level == -extra_detail_levels else image.resize(
            (math.ceil(width / divisor), math.ceil(height / divisor)), Image.Resampling.LANCZOS)
        tiles = root / "tiles" / str(level)
        tiles.mkdir(parents=True, exist_ok=True)
        for row in range(math.ceil(scaled.height / tile_size)):
            for column in range(math.ceil(scaled.width / tile_size)):
                x, y = column * tile_size, row * tile_size
                tile = Image.new("RGB", (tile_size, tile_size), background)
                tile.paste(scaled.crop((x, y, min(scaled.width, x+tile_size), min(scaled.height, y+tile_size))))
                tile.save(tiles / f"tile{column}x{row}.webp", quality=87, method=4)

    save_json(root / "metadata.json", dict(
        schemaVersion=1, displayName=name, attribution=ATTRIBUTION,
        bounds=dict(minX=origin[0], minY=origin[1], maxX=origin[0]+width, maxY=origin[1]+height),
        tileSize=tile_size, detailLevels=list(levels), backgroundColor=background,
        regions=list(regions), locations=locations,
        **({"initialBounds": dict(zip(("minX", "minY", "maxX", "maxY"), initial_bounds))}
           if initial_bounds else {}),
    ))


SCENE_MAPS = {
    "prison": ("Prison", "location-prison-standalone_scenes_all.bundle", "PrisonMapMeshView", (-170, -165, 135, 105)),
    "lennys-motel": ("Lenny's Motel", "location-hub_standalone_scenes_all.bundle", "HubMapMeshView", (-245, -240, 245, 245)),
    "sales-center": ("Sales Center", "location-sectorcenter-standalone_scenes_all.bundle", "SectorCenterMapMeshView", (-665, -665, 665, 665)),
    "settlement": ("Settlement", "location-settlement-standalone_scenes_settlementadditive_standalone.bundle", "SettlementMapMeshView", (-665, -665, 665, 665)),
    "settlement-2": ("Settlement II", "location-settlement2-standalone_scenes_all.bundle", "Settlement2MapMeshView", (-665, -665, 665, 665)),
}
SCENE_CUTAWAYS = {
    "prison": (-27, -35, 27, 34, 13.1),
    "lennys-motel": (-23, 27, 15, 56, 35.7),
}
COMPONENT_MARKERS = {
    "CameraEntityView": ("camera", "Security camera"),
    "DoorEntityView": ("door", "Interactive door"),
    "SafeDoorView": ("door", "Vault door"),
    "SecurityPanelEntityView": ("alarm-panel", "Alarm panel"),
    "MetalDetectorEntityView": ("metal-detector", "Metal detector"),
    "ClanBattleConquestObjectView": ("conquest", "Conquest point"),
    "LocationEventCargoContainerView": ("event-cargo", "Event cargo"),
    "CashWithdrawalEntityView": ("atm", "ATM"),
    "BuyerView": ("buyer", "Fence"),
    "CargoExchangerView": ("cargo-exchange", "Cargo exchange"),
    "VehicleSpawnerView": ("parking", "Parking terminal"),
    "BarterTraderView": ("vendor", "Suspicious door"),
    "LocationHubTraderView": ("vendor", "Hub trader"),
    "PersonalRepositoryView": ("storage", "Personal storage"),
    "TattooMasterView": ("vendor", "Tattoo master"),
    "LocationLeavePointView": ("travel", "Exit"),
    "PrisonEscapeView": ("travel", "Prison exit"),
    "CashLootNodeView": ("cash", "Cash pickup"),
    "RouletteView": ("activity", "Roulette"),
    "TaxPointView": ("service", "Tax terminal"),
    "TaxCashView": ("cash", "Tax collection"),
    "PointOfInterestView": ("activity", "Interaction"),
    "LootNodeView": ("container", "Loot container"),
    "ContainerEntityView": ("container", "Loot container"),
    "LootObjectView": ("loose-loot", "Loose loot"),
}
PRISON_ACTIONS = {
    "Call": "Phone", "Execution": "Execution", "Prank": "Prank",
    "Spit": "Spit", "TaskBoard": "Task board", "Mailbox": "Mailbox",
}
LOOT_FILTERS = (
    (r"trash|bin\b", "trash", "Trash container"),
    (r"cashregister|cash_register|cashbox", "cash-register", "Cash register"),
    (r"bankcell|bank_cell", "deposit-box", "Deposit box"),
    (r"bankgold|bank_gold|bank_cash", "vault-loot", "Bank vault loot"),
    (r"safe", "safe", "Safe"),
    (r"jewel|necklace|ringbox|bracelet", "jewelry", "Jewelry"),
    (r"medicine|medication|medical|pharm", "medicine", "Medicine"),
    (r"gun|weapon|ammo|grenade", "weapons-loot", "Weapons or ammunition"),
    (r"equip|armor|helmet|carabiner", "gear-loot", "Equipment"),
    (r"alcohol|cigar|wine|beer|whisk|rum\b|vodka", "alcohol", "Alcohol or cigars"),
    (r"electronics|computer|phone|graphics|tablet", "electronics", "Electronics"),
    (r"carparts|car_parts|automotive", "car-parts", "Car parts"),
    (r"drug|narco|powder", "drugs", "Drugs"),
    (r"art|antique|painting|statue|picture|figurine|gallery", "art", "Art or antiques"),
)

def actor_name(name):
    value = re.sub(r"^(?:Runtime|Editor|LootNode|LootObject|Container)_", "", name)
    value = re.sub(r"\(\s*\d+\s*\)|\[\d+\]", "", value).strip()
    value = re.sub(r"(?<=[a-z])(?=[A-Z])", " ", value).replace("_", " ")
    return " ".join(value.split())


def component_index(env):
    """Group scene objects by component class using bundled MonoScript references."""
    by_class = {}
    classes = {}
    for reader in env.objects:
        if reader.type.name != "MonoBehaviour":
            continue
        try:
            view = reader.read()
            if not view.m_GameObject or not view.m_Script:
                continue
            script = view.m_Script
            cache_key = (reader.assets_file.name, script.m_FileID, script.m_PathID)
            if cache_key not in classes:
                classes[cache_key] = script.read().m_ClassName
            name = classes[cache_key]
            if name in COMPONENT_MARKERS or name in {"TargetObjectView", "DistrictNameView", "MapBuildingView"}:
                go = view.m_GameObject.read()
                if go.m_IsActive:
                    by_class.setdefault(name, []).append((reader, go))
        except (KeyError, ValueError, AttributeError, EOFError):
            continue
    return by_class


def read_english_ids(bundles):
    bundle = "localization-string-tables-english(unitedstates)(en-us)_assets_all.bundle"
    env = UnityPy.load(str(bundles / bundle))
    table = next(reader.read_typetree() for reader in env.objects
                 if reader.type.name == "MonoBehaviour" and reader.peek_name() == "StaticStrings_en-US")
    return {row["m_Id"]: row["m_Localized"] for row in table["m_TableData"]}


def load_scene(bundles, filename):
    env = UnityPy.load(str(bundles / filename))
    env.load_file(str(next(bundles.glob("*_monoscripts.bundle"))))
    return env


def add_scene_points(index, map_id, name, filename, project, image_size, english_ids, initial=()):
    locations = list(initial)
    width, height = image_size
    regions = []
    targets_by_object = {p["sourceObjectId"]: p for p in locations if p["category"] in {"robbery", "landmark"}}
    existing = {p.get("sourceObjectId") for p in locations}
    groups = {}
    for class_name, rows in index.items():
        if class_name == "MapBuildingView":
            continue
        for reader, go in rows:
            transform = component(go, "Transform")
            if transform is None or go.object_reader.path_id in existing:
                continue
            actor = go.m_Name
            data = None
            if class_name == "TargetObjectView":
                if map_id != "prison" or actor not in PRISON_ACTIONS:
                    continue
                category, label = "activity", PRISON_ACTIONS[actor]
            elif class_name == "DistrictNameView":
                data = reader.read_typetree()
                key = data["<LocalizedString>k__BackingField"]["m_TableEntryReference"]["m_KeyId"]
                region_name = english_ids.get(key, actor_name(actor))
                x, _, z = coordinates(transform)
                u, v = project(x, z)
                if 0 <= u <= width and 0 <= v <= height and all(r["name"] != region_name for r in regions):
                    regions.append(dict(id=slug(region_name), name=region_name, x=round(u, 2), y=round(v, 2), importance="major"))
                continue
            else:
                category, label = COMPONENT_MARKERS[class_name]

            # Skip render-only helpers and prefer the highest-level authored interaction.
            if class_name == "PointOfInterestView":
                if re.search(r"trash|bin", actor, re.I):
                    category, label = "trash", "Trash container"
                elif not re.search(r"fountain|lectricbox", actor, re.I):
                    continue
                else:
                    label = "Fountain" if re.search(r"fountain", actor, re.I) else "Electrical box"
            if class_name == "PrisonEscapeView" and "Toilet" in actor:
                category, label = "activity", "Toilet escape"
            if class_name == "LootObjectView" and actor.startswith("RandomLootObject"):
                label = "Possible loot"
            if category in {"container", "loose-loot"}:
                for pattern, kind, title in LOOT_FILTERS:
                    if re.search(pattern, actor, re.I):
                        category, label = kind, title
                        break

            parents = [parent.m_GameObject.read() for parent in ancestors(transform)]
            if category == "safe" and any(re.search(r"_safe |SafeKey\d+", parent.m_Name) for parent in parents):
                continue
            owner = next((target for parent in parents if (target := targets_by_object.get(parent.object_reader.path_id))), None)
            x, elev, z = coordinates(transform)
            position = project(x, z)
            if not (0 <= position[0] <= width and 0 <= position[1] <= height):
                continue
            id = f"{category}-{go.object_reader.path_id}"
            display = f"{owner['name']} · {label}" if owner else label
            fields = dict(referenceCoordinates=dict(x=round(x, 2), y=round(z, 2)),
                          elevation=round(elev, 2), sourceActor=actor, sourceAsset=filename,
                          sourceObjectId=go.object_reader.path_id, sourceComponent=class_name)
            if category == "travel" and map_id != "prison":
                fields["relatedMapId"] = "world"
            if owner:
                fields["locationParentId"] = owner["id"]
            locations.append(marker(id, display, category, label, position, name, **fields))
            existing.add(go.object_reader.path_id)

    for point in locations:
        parent = point.get("locationParentId")
        if parent:
            groups.setdefault(parent, []).append(point["id"])
    for point in locations:
        if point["id"] in groups:
            point["locationChildIds"] = groups[point["id"]]
    return locations, regions


def build_scene_map(bundles, output, map_id, config, english_ids, render_aerial):
    name, filename, view_name, (left, bottom, right, top) = config
    scene = load_scene(bundles, filename)
    view = find_object(scene, "GameObject", view_name)
    scale = 3 if map_id in {"prison", "lennys-motel"} else 2
    background = "#2e3538"
    image = Image.new("RGB", ((right-left)*scale, (top-bottom)*scale), background)
    project = lambda x, z: ((x-left)*scale, (top-z)*scale)
    index = component_index(scene)
    if map_id == "settlement":
        base = "location-settlement-standalone_scenes_settlement_standalone.bundle"
        for key, entries in component_index(load_scene(bundles, base)).items():
            index.setdefault(key, []).extend(entries)
    locations, regions = add_scene_points(index, map_id, name, filename, project, image.size, english_ids)
    if map_id == "prison":
        for actor, title in {"Gym": "Gym", "Yard": "Yard", "Taskboard": "Task board"}.items():
            game_object = find_object(scene, "GameObject", actor)
            x, elevation, z = coordinates(component(game_object, "Transform"))
            locations.append(marker(slug(title), title, "landmark", "Prison location", project(x, z), name,
                sourceActor=actor, sourceAsset=filename, elevation=round(elevation,2),
                referenceCoordinates=dict(x=round(x,2), y=round(z,2))))

    location_asset = re.split(r"[-_]", filename, maxsplit=2)[1]
    extras = (f"location-{location_asset}-data_assets_all.bundle",)
    if map_id == "settlement-2":
        extras += ("location-settlement-standalone_scenes_settlement_standalone.bundle",)
    extra_detail_levels = 2 if map_id == "prison" else 0
    initial_bounds = None
    raster_project = project
    if map_id == "prison":
        # Keep the existing marker coordinates while framing the cell block and yard.
        initial_bounds = (*project(-45, 43), *project(45, -43))
        pixel_ratio = 2**extra_detail_levels
        image = Image.new("RGB", (image.width*pixel_ratio, image.height*pixel_ratio), background)
        raster_project = lambda x, z: ((x-left)*scale*pixel_ratio, (top-z)*scale*pixel_ratio)
    image = render_aerial(scene, bundles, view.object_reader.assets_file, image, background, raster_project,
                          terrain_name="terrainLOD" if map_id == "lennys-motel" else "terrainLOD_base",
                          cutaway=SCENE_CUTAWAYS.get(map_id), extra_bundles=extras)
    render_tiles(output / "maps" / map_id, name, image, background, locations, regions,
                 extra_detail_levels=extra_detail_levels, initial_bounds=initial_bounds)
    return locations


def read_building_descriptions(bundles, english_ids, marker_icons):
    env = UnityPy.load(str(bundles / "scriptableobjects_assets_all.bundle"))
    descriptions = {}
    for obj in env.objects:
        if obj.type.name != "MonoBehaviour":
            continue
        name = obj.peek_name()
        if not name.startswith("city_") and name not in {"HubBar", "HubBunker", "DrugsLab", "SettlementHangar"}:
            continue
        data = obj.read_typetree()
        def translate(field):
            ref = data.get(f"<{field}>k__BackingField", {}).get("m_TableEntryReference", {})
            return english_ids.get(ref.get("m_KeyId"), "")
        title = translate("Title")
        if title:
            appearance = marker_icons.get(data["<MarkerType>k__BackingField"])
            rewards = [slug(reward["_id"]) for reward in data["<Rewards>k__BackingField"]]
            descriptions[obj.path_id] = (name, title, translate("Description"), translate("SizeDescription"), appearance, rewards)
    return descriptions


def read_city_buildings(index, describe, project):
    locations = []
    for reader, view in index.get("MapBuildingView", []):
        data = reader.read_typetree()
        source = describe.get(data["<MapBuildingViewDescription>k__BackingField"]["m_PathID"])
        if not source:
            continue
        source_id, title, description, size, appearance, rewards = source
        transform = component(view, "Transform")
        building = transform.m_Father.read().m_GameObject.read()
        actor = building.m_Name
        x, elevation, z = coordinates(transform)
        base, _, number = actor.partition("_")
        old_name = BUILDINGS.get(base, actor)
        id = slug(f"{old_name} {int(number)}" if number.isdigit() else old_name)
        if title in {"Cottage", "Convenience Store", "Electronics Store", "Pharmacy"}:
            title = f"{title} {int(number)}" if number.isdigit() and title == "Cottage" else title
            direction = next((label for suffix, label in {"east_bridge":"Bridge", "east":"East", "west":"West"}.items()
                              if source_id.endswith("_"+suffix)), "")
            if direction:
                title += f" · {direction}"
        artwork = dict(iconPath=appearance[0], sourceIcon=appearance[1]) if appearance else {}
        locations.append(marker(id, title, "robbery", "Heist location", project(x, z), "Looty Bay",
            description=description or None, detailLabel=size or None, elevation=round(elevation, 2),
            referenceCoordinates=dict(x=round(x,2), y=round(z,2)), sourceActor=actor,
            sourceAsset=CITY_SCENE, sourceObjectId=building.object_reader.path_id, sourceComponent="MapBuildingView",
            previewRewardIds=rewards, **artwork))
    return locations


def catalog_category(item_id, name):
    for category, pattern in ITEM_PATTERNS.items():
        if re.fullmatch(pattern, item_id):
            return category
    if re.search(r"_(?:m|mk)[1234]$|^weapon_.*(?:mk|_m)\d+$|ammo|grenade", item_id):
        return "weapons"
    if re.search(r"(?:\bkey|cutter|drill|hacking|tablet|lockpick|jammer|bolt)", name.lower()):
        return "keys" if re.search(r"\bkey", name.lower()) else "tools"
    if re.match(r"^(?:cargo_|bank_cargo_|collection_reward_cargo)", item_id):
        return "cargo"
    if re.match(r"^(?:drugs?|bush_drugs|drugbag)", item_id):
        return "drugs"
    if re.search(r"armor|medkit|afak|ifak|backpack|^equip_|^cop_armor|bandage", item_id):
        return "supplies" if re.search(r"medkit|afak|ifak|bandage", item_id) else "equipment"
    if re.search(r"building|wall_|plot_|^home_|^garage_|^workbench|collection_upgrade|^construction", item_id):
        return "building"
    if re.match(r"^(?:longhorn|royal_|buletti|helicopter_|car_)", item_id):
        return "vehicles"
    return "valuables"


def read_item_artwork(bundles, output, strings):
    env = UnityPy.load(str(bundles / "space-global_assets_all.bundle"))
    atlas = next(bundles.glob("*__fullspriteatlas_4k.spriteatlasv2.bundle"))
    env.load_file(str(atlas))
    path = output / "data/rob-run/icons"
    path.mkdir(parents=True, exist_ok=True)
    items = {}
    for reader in env.objects:
        if reader.type.name != "Sprite":
            continue
        stem = reader.peek_name().lower()
        if re.match(r"^(?:icon_|ui_|location_|panel_|marker_|stat_|hint_)", stem):
            continue
        name = strings.get(stem+"_name")
        match = re.fullmatch(r"(safe_key|room_key|vip_key)_(\d+)", stem)
        if match:
            base, number = match.groups()
            name = name or strings.get(base+"_1_name")
            if name and int(number) > 1:
                name = f"{name} {int(number)}"
        if not name or not re.fullmatch(r"[a-z0-9_]+", stem) or len(name) > 74 or "{" in name:
            continue
        item_id = slug(stem)
        if item_id in items:
            continue
        description = strings.get(stem+"_description", "")
        item = dict(id=item_id, name=name, category=catalog_category(stem, name), description=description,
                    sourceAsset="space-global_assets_all.bundle", sourceSprite=reader.peek_name(), markers=[])
        try:
            image = reader.read().image
            image.thumbnail((112, 112), Image.Resampling.LANCZOS)
            image.save(path / f"{item_id}.webp", quality=88, method=4)
            item["icon"] = f"data/rob-run/icons/{item_id}.webp"
        except (ValueError, KeyError, AttributeError, NotImplementedError, FileNotFoundError):
            pass
        items[item_id] = item
    return items


def build_city(bundles, output, english_ids, marker_icons, hospital_icon, render_aerial):
    scene = load_scene(bundles, CITY_SCENE)
    map_view = find_object(scene, "GameObject", "CityMapMeshView")
    image = Image.new("RGB", (4200, 3330), CITY_WATER)
    project = lambda x, z: ((x+700)*3, (725-z)*3)

    index = component_index(scene)
    buildings = read_building_descriptions(bundles, english_ids, marker_icons)
    locations = read_city_buildings(index, buildings, project)
    marker_ids = {point["id"] for point in locations}
    for obj in map_view.object_reader.assets_file.objects.values():
        if obj.type.name != "GameObject":
            continue
        name = obj.peek_name()
        building = name == "Hospital"
        safe_key = re.search(r"\bSafeKey(\d+)$", name)
        drill_safe = name.endswith("_minidrill") and "_safe " in name
        if not (building or safe_key or drill_safe or name == "LocationLeavePoint"):
            continue
        go = obj.read()
        transform = component(go, "Transform")
        if not transform or not go.m_IsActive or building and not transform.m_Children:
            continue
        x, elevation, z = coordinates(transform)
        position = project(x, z)
        if not (0 <= position[0] < image.width and 0 <= position[1] < image.height):
            raise ValueError(f"City marker out of bounds: {name} ({x}, {z})")
        fields = dict(referenceCoordinates=dict(x=round(x, 2), y=round(z, 2)),
                      elevation=round(elevation, 2), sourceActor=name, sourceAsset=CITY_SCENE,
                      sourceObjectId=obj.path_id)
        if building:
            id, display_name, kind, label = "hospital", "Hospital", "landmark", "Landmark"
            fields["iconPath"], fields["sourceIcon"] = hospital_icon
        elif name == "LocationLeavePoint":
            id, display_name, kind, label = "city-exit", "Looty Bay exit", "travel", "Exit"
            fields["relatedMapId"] = "world"
        else:
            owner = next((entry for parent in ancestors(transform)
                          if (entry := parent.m_GameObject.read().m_Name) in BUILDINGS
                          or entry.rsplit("_", 1)[0] in BUILDINGS), "")
            if owner:
                owner_base, _, owner_number = owner.partition("_")
                owner = BUILDINGS.get(owner_base, owner)
                if owner_number.isdigit():
                    owner += f" {int(owner_number)}"
            id = f"safe-{obj.path_id}"
            kind, label = ("key-safe", "Key safe") if safe_key else ("drill-safe", "Drill safe")
            display_name = f"{label} {int(safe_key[1])}" if safe_key else label
            if owner:
                display_name = f"{owner} · {display_name}"
            fields["requiredItemId"] = f"safe-key-{int(safe_key[1])}" if safe_key else "mini-drill-1"
            fields["description"] = (f"Requires Safe Key {int(safe_key[1])}." if safe_key else "Requires a Mini Drill.")

        if id in marker_ids:
            id = f"{id}-{obj.path_id}"
        marker_ids.add(id)
        locations.append(marker(id, display_name, kind, label, position, "Looty Bay", **fields))

    if len({entry["id"] for entry in locations}) != len(locations):
        raise ValueError("City contains duplicate marker IDs")
    root = output / "maps/looty-bay"
    by_actor = {point["sourceObjectId"]:point for point in locations if point["category"] in {"robbery", "landmark"}}
    for point in locations:
        if point["category"] not in {"key-safe", "drill-safe"}:
            continue
        go = map_view.object_reader.assets_file.objects[point["sourceObjectId"]].read()
        for parent in ancestors(component(go, "Transform")):
            owner = by_actor.get(parent.m_GameObject.m_PathID)
            if owner:
                point["locationParentId"] = owner["id"]
                break
    locations, regions = add_scene_points(index, "looty-bay", "Looty Bay", CITY_SCENE, project, image.size, english_ids, locations)
    # Add space above the north shore while keeping all saved pin coordinates.
    north_margin = 300
    aerial_canvas = Image.new("RGB", (image.width, image.height+north_margin), CITY_WATER)
    image = render_aerial(scene, bundles, map_view.object_reader.assets_file, aerial_canvas, CITY_WATER,
                          lambda x, z: ((x+700)*3, (725-z)*3+north_margin))
    render_tiles(root, "Looty Bay", image, CITY_WATER, sorted(locations, key=lambda item: item["id"]), regions,
                 origin=(0, -north_margin))
    image.thumbnail((1100, 1100), Image.Resampling.LANCZOS)
    image.save(root / "satellite-overview.webp", quality=88)
    return locations


def read_strings(bundles):
    shared = UnityPy.load(str(bundles / "localization-assets-shared_assets_all.bundle"))
    english = UnityPy.load(str(bundles / "localization-string-tables-english(unitedstates)(en-us)_assets_all.bundle"))
    def table(environment, name):
        return next(obj.read_typetree() for obj in environment.objects
                    if obj.type.name == "MonoBehaviour" and obj.peek_name() == name)
    strings = {row["m_Id"]:row["m_Localized"] for row in table(english,"StaticStrings_en-US")["m_TableData"]}
    return {row["m_Key"]:strings[row["m_Id"]] for row in table(shared,"StaticStrings Shared Data")["m_Entries"]
            if row["m_Id"] in strings}


def add_world_city(image, scene, surface):
    mesh = MeshHandler(component(surface, "MeshFilter").m_Mesh.read())
    mesh.process()
    # The second UV channel maps the high-resolution city into the main atlas.
    city_uvs = [base for base, detail in zip(mesh.m_UV0, mesh.m_UV1)
                if 0 <= detail[0] <= 1 and 0 <= detail[1] <= 1]
    left = round(min(u for u, _ in city_uvs)*image.width)
    right = round(max(u for u, _ in city_uvs)*image.width)
    top = round((1-max(v for _, v in city_uvs))*image.height)
    bottom = round((1-min(v for _, v in city_uvs))*image.height)
    city = find_object(scene, "Texture2D", "GlobalMap_City").image.convert("RGBA")
    city = city.resize((right-left, bottom-top), Image.Resampling.LANCZOS)
    image.paste(city, (left, top), city.getchannel("A"))


def build_world(bundles, output, strings):
    env = UnityPy.load(str(bundles / REALM_GRID))
    grid = component(find_object(env, "GameObject", "Runtime_RealmGrid_v0"), "Transform")
    background = "#253b46"
    project = lambda x, z: ((x+24)*76, (16-z)*76)
    world_scene = load_scene(bundles, REALM_SCENE)
    world_surface = find_object(world_scene, "GameObject", "GlobalMap")
    draft = component(world_surface, "Transform").m_Father.read()
    center_x, _, center_z = coordinates(draft)
    map_width, map_height = draft.m_LocalScale.x, draft.m_LocalScale.z
    origin = project(center_x - map_width/2, center_z + map_height/2)
    origin = tuple(round(value, 2) for value in origin)
    atlas = find_object(world_scene, "Texture2D", "GlobalMap").image
    # The material uses alpha for the water mask. Preserve all of the authored RGB.
    image = atlas.convert("RGB").resize((round(map_width*38), round(map_height*38)), Image.Resampling.LANCZOS)
    add_world_city(image, world_scene, world_surface)
    draw = ImageDraw.Draw(image, "RGBA")
    palette = ["#394d52", "#414d64", "#464f6b", "#50516a", "#424b5c",
               "#4f5264", "#505573", "#49616a", "#48566e", "#57506b"]
    locations, regions = [], []
    children = {obj.m_GameObject.read().m_Name:obj for ref in grid.m_Children if (obj:=ref.read())}

    def hexagon(x, z, color):
        points = [project(x+0.566*math.sin(i*math.pi/3), z+0.566*math.cos(i*math.pi/3)) for i in range(6)]
        raster_points = [((px-origin[0])/2, (py-origin[1])/2) for px, py in points]
        draw.polygon(raster_points, fill=(*ImageColor.getrgb(color), 32), outline=(23, 32, 38, 150))

    for i in range(10):
        sector = children[f"Sector{i}"].m_GameObject.read()
        center = children[f"SectorCenter{i}"].m_GameObject.read()
        name = strings[f"district_name_{i}"]
        pos = behaviour(center, "<MarkerWorldPosition>k__BackingField")["<MarkerWorldPosition>k__BackingField"]
        cells = behaviour(sector, "<Cells>k__BackingField")["<Cells>k__BackingField"]
        for cell in cells:
            world = cell["WorldPosition"]
            hexagon(world["x"], world["z"], palette[i])
            number = cell["SettlementIndex"]
            if not cell["RealmCellView"]["m_PathID"] or number < 0:
                continue
            grid_x, grid_y = cell["WorldCoords"]["x"], cell["WorldCoords"]["y"]
            locations.append(marker(f"settlement-{i}-{grid_x}-{grid_y}", f"{name} #{number+1}",
                                    "settlement", "Settlement", project(world["x"],world["z"]), name,
                                    referenceCoordinates=dict(x=grid_x,y=grid_y), sourceAsset=REALM_GRID))
        x, y = project(pos["x"],pos["z"])
        regions.append(dict(id=slug(name), name=name, x=round(x,2), y=round(y-75,2), importance="major"))
        locations.append(marker(f"district-{i}", name, "district", "District center", (x,y), name, relatedMapId="sales-center", sourceAsset=REALM_GRID))

    place_names = {"city":"Looty Bay", "hub":"Lenny\u0027s Motel", "prison":"Prison"}
    for i in range(3):
        transform = children[f"Location{i}"]
        data = behaviour(transform.m_GameObject.read(), "Location")
        kind = data["Location"]["_id"]
        pos = data["<MarkerWorldPosition>k__BackingField"]
        fields = {"relatedMapId":{"city":"looty-bay", "hub":"lennys-motel", "prison":"prison"}[kind]}
        locations.append(marker(f"world-{kind}", place_names[kind], "travel" if kind=="city" else "landmark",
                                "Location", project(pos["x"],pos["z"]), "World Map", sourceAsset=REALM_GRID, **fields))
    footprint = (*origin, origin[0] + image.width*2, origin[1] + image.height*2)
    render_tiles(output / "maps/world", "World Map", image, background, locations, regions,
                 origin=origin, extra_detail_levels=-1, initial_bounds=footprint)
    return locations


def build_items(bundles, output, strings, locations, build):
    items = read_item_artwork(bundles, output, strings)
    for key, value in strings.items():
        if not key.endswith("_name") or not value.strip():
            continue
        base = key.removesuffix("_name")
        category = next((group for group, pattern in ITEM_PATTERNS.items() if re.fullmatch(pattern, base)), None)
        if not category:
            continue
        id = slug(base)
        description = re.sub(r"</?color(?:=[^>]*)?>", "", strings.get(base+"_description", ""))
        if len(description) > 420 or "{" in description:
            description = ""
        items.setdefault(id, dict(id=id, name=value, category=category, description=description, markers=[]))
    for item in items.values():
        text = re.sub(r"</?color(?:=[^>]*)?>", "", item["description"])
        item["description"] = text if len(text) <= 550 and "{" not in text else ""
        item["markers"] = [dict(id=point["id"], name=point["name"]) for point in locations if point.get("requiredItemId") == item["id"]]
    save_json(output / "data/rob-run/items.json",
              dict(build=build, attribution=ATTRIBUTION, items=sorted(items.values(), key=lambda item: (item["name"].casefold(), item["id"]))))
    return len(items)


def build_heists(output, locations):
    by_id = {point["id"]: point for point in locations}
    items = json.loads((output / "data/rob-run/items.json").read_text(encoding="utf-8"))["items"]
    item_by_id = {item["id"]: item for item in items}

    def item_links(ids):
        return [dict(id=id, name=item_by_id[id]["name"], icon=item_by_id[id].get("icon"))
                for id in ids if id in item_by_id]
    rows = []
    for point in locations:
        if point.get("sourceComponent") != "MapBuildingView":
            continue
        children = [by_id[id] for id in point.get("locationChildIds", [])]
        counts = {}
        for child in children:
            label = child["label"]
            counts[label] = counts.get(label, 0) + 1
        gear = sorted({child["requiredItemId"] for child in children if child.get("requiredItemId")})
        rows.append(dict(id=point["id"], name=point["name"], description=point.get("description") or "",
                         type=point.get("detailLabel") or "", counts=counts, icon=point.get("iconPath"),
                         gear=item_links(gear), rewards=item_links(point.get("previewRewardIds", []))))
    save_json(output / "data/rob-run/heists.json", sorted(rows, key=lambda row: row["name"].casefold()))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("install", type=Path, help="Steam common/Rob Run directory")
    parser.add_argument("--build", default="26726105")
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[1] / "public")
    parser.add_argument("--references", type=Path, help="Also refresh the economy from the game's references.dat")
    args = parser.parse_args()
    bundles = args.install / "ROB RUN_Data/StreamingAssets/aa/StandaloneWindows64"
    scripts = Path(__file__).resolve().parent
    render_aerial = run_path(str(scripts / "rob-run-aerial.py"))["render_aerial"]
    export_markers = run_path(str(scripts / "rob-run-markers.py"))["export_markers"]
    strings = read_strings(bundles)
    english_ids = read_english_ids(bundles)
    marker_icons, hospital_icon = export_markers(bundles, args.output)
    city = build_city(bundles, args.output, english_ids, marker_icons, hospital_icon, render_aerial)
    world = build_world(bundles, args.output, strings)
    scenes = [(map_id, config[0], build_scene_map(bundles, args.output, map_id, config, english_ids, render_aerial))
              for map_id, config in SCENE_MAPS.items()]
    items = build_items(bundles, args.output, strings, city, args.build)
    build_heists(args.output, city)
    locations = [dict(mapId=map_id, mapName=name, point=point, count=1)
                 for map_id, name, points in [("looty-bay", "Looty Bay", city), ("world", "World Map", world), *scenes]
                 for point in points]
    save_json(args.output / "data/map-search/index.json", dict(version=1, locations=locations, items=[]))
    if args.references:
        export_economy = run_path(str(scripts / "extract-rob-run-references.py"))["export_economy"]
        export_economy(args.references, bundles, args.output)
    print("Scene maps:", [(key, len(pins)) for key, _, pins in scenes])
    print(f"Looty Bay: {len(city)} markers. World map: {len(world)} markers. Item catalog: {items} entries.")


if __name__ == "__main__":
    main()

