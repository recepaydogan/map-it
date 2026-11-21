
"""Decode data from the official ROB RUN client references.dat."""
import argparse
import hashlib
import json
import re
import struct
from pathlib import Path
from runpy import run_path


class ReferenceStream:
    # The game reads little-endian 64-bit words for primitives and copies
    # UTF-8 payloads from the byte cursor without discarding buffered bits.
    def __init__(self, source, offset=0, pending=0):
        self.source = source
        self.offset = offset
        self.pending = pending
        self.buffer = int.from_bytes(source[offset-8:offset], "little") >> (64-pending) if pending else 0

    def bits(self, size):
        if self.pending < size:
            word = self.source[self.offset:self.offset+8]
            if self.pending + 8*len(word) < size:
                raise ValueError("Unexpected end of the references stream")
            self.offset += len(word)
            self.buffer |= int.from_bytes(word, "little") << self.pending
            self.pending += 8*len(word)
        value = self.buffer & ((1 << size)-1)
        self.buffer >>= size
        self.pending -= size
        return value

    def i32(self):
        value = self.bits(32)
        return value - 2**32 if value >= 2**31 else value

    def f32(self):
        return struct.unpack("<f", self.bits(32).to_bytes(4, "little"))[0]

    def flag(self):
        return bool(self.bits(1))

    def reference(self):
        return None if self.flag() else self.i32()

    def identifier(self):
        length = self.bits(31)
        if not 1 <= length <= 128:
            raise ValueError(f"Invalid identifier length {length}")
        raw = self.source[self.offset:self.offset+length]
        if len(raw) != length or not re.fullmatch(rb"[a-zA-Z0-9_.-]+", raw):
            raise ValueError(f"Invalid identifier at byte {self.offset}")
        self.offset += length
        return raw.decode("ascii")

    def quantities(self, limit):
        count = self.i32()
        if not 0 <= count <= limit:
            raise ValueError(f"Invalid list length {count}")
        return count

    def required_reference(self, limit):
        index = self.reference()
        if index is None or not 0 <= index < limit:
            raise ValueError(f"Invalid reference index {index}")
        return index

    def collection(self, parse, limit):
        return [] if self.flag() else [parse() for _ in range(self.quantities(limit))]


def inventory_item(stream, name):
    # InventoryItemDescriptionBinarySerializer.TryReadInventoryItemDescription
    index = stream.i32()
    kind = stream.bits(8)
    width, height, base = stream.i32(), stream.i32(), stream.i32()
    modifier = stream.reference()
    stack, rarity = stream.i32(), stream.i32()
    available = stream.flag()
    lines, pockets = stream.i32(), stream.i32()
    is_key = stream.flag()
    durability = stream.i32()
    if not (0 <= index <= 6000 and kind <= 100 and 1 <= width <= 40 and 1 <= height <= 40
            and 0 <= base <= 100_000_000 and (modifier is None or 0 <= modifier <= 30)
            and 0 <= stack <= 100_000 and 0 <= rarity <= 10 and 0 <= lines <= 50
            and 0 <= pockets <= 50 and 0 <= durability <= 10000):
        raise ValueError(f"Invalid item values for {name}")
    extras = [stream.reference() for _ in range(47)]
    if any(index is not None and not 0 <= index <= 20000 for index in extras):
        raise ValueError(f"Invalid item cross-reference for {name}")
    return dict(id=name, index=index, itemType=kind, width=width, height=height, basePrice=base,
                modifier=modifier, stackSize=stack, rarity=rarity, sellAvailable=available,
                isKey=is_key, durability=durability, armor=extras[2], weapon=extras[3], ammo=extras[4])


def weapon_description(stream, name):
    # WeaponDescriptionBinarySerializer and IWeaponDamageBinarySerializer.
    index, cooldown = stream.i32(), stream.bits(64)
    damage_type = stream.i32()
    if damage_type != 0:
        raise ValueError(f"Unsupported damage type: {name}")
    full_damage_range, damage = stream.f32(), stream.i32()
    intervals = stream.collection(lambda: (stream.f32(), stream.i32()), 30)
    head_multiplier, magazine = stream.f32(), stream.i32()
    precast, reload, fast_reload, aim, aim_out = (stream.bits(64) for _ in range(5))
    spread, draw = stream.reference(), stream.bits(64)
    references = [stream.reference() for _ in range(8)]
    automatic, pistol_pose = stream.flag(), stream.flag()
    reload_type = stream.reference()
    if not (0 < cooldown <= 10000 and 0 <= damage <= 1000 and 0 < full_damage_range <= 2000
            and 0 <= head_multiplier <= 10 and 0 <= magazine <= 2000
            and all(0 <= length <= 2000 and 0 <= amount <= 1000 for length, amount in intervals)
            and all(value <= 120000 for value in (precast, reload, fast_reload, aim, aim_out, draw))):
        raise ValueError(f"Invalid weapon fields: {name}")
    return dict(id=name, index=index, damage=damage, fullDamageRange=full_damage_range,
                damageBands=[dict(length=length, damage=amount) for length, amount in intervals],
                headshotMultiplier=head_multiplier, cooldownMs=cooldown, magazine=magazine,
                reloadMs=reload, fastReloadMs=fast_reload, reloadPrecastMs=precast, aimMs=aim,
                aimOutMs=aim_out, drawMs=draw, automatic=automatic, pistolPose=pistol_pose,
                spreadIndex=spread, aimedPattern=references[2], ammoIndex=references[3], reloadType=reload_type)


def armor_description(stream, name):
    index, segments, blocking = stream.i32(), stream.i32(), stream.f32()
    if not (1 <= segments <= 100 and 0 <= blocking <= 1):
        raise ValueError(f"Invalid armor: {name}")
    return dict(index=index, segments=segments, blockingRate=blocking)


def sell_modifier(stream, name):
    index, multiplier = stream.i32(), stream.f32()
    if not 0 <= index <= 30 or not 0 <= multiplier <= 5:
        raise ValueError(f"Invalid sell price modifier {name}")
    return dict(id=name, index=index, multiplier=multiplier)


def ammo_price(stream, name):
    index, base, modifier = stream.i32(), stream.i32(), stream.required_reference(31)
    if not 0 <= index < 30 or not 0 <= base <= 10000:
        raise ValueError(f"Invalid ammunition price {name}")
    return dict(id=name, index=index, basePrice=base, modifier=modifier)


def indexed_id(stream, name):
    return dict(id=name, index=stream.i32())


def loot_node(stream, name):
    index = stream.i32()
    steps = [stream.i32(), stream.i32()]
    item = stream.required_reference(6000)
    quantity = [stream.i32(), stream.i32()]
    if not 0 <= steps[0] <= steps[1] <= 1000 or not 0 <= quantity[0] <= quantity[1] <= 100000:
        raise ValueError(f"Invalid loot quantities {name}")
    return dict(id=name, index=index, steps=steps, quantityPerStep=quantity, item=item)


def shipment_item(stream, name):
    return dict(id=name, index=stream.i32(), item=stream.required_reference(6000))


def notoriety_level(stream, name):
    index, next_level, points = stream.i32(), stream.reference(), stream.i32()
    cargo, loot = stream.f32(), stream.f32()
    if not (0 <= points <= 100_000_000 and 0 <= cargo <= 5 and 0 <= loot <= 5):
        raise ValueError(f"Invalid notoriety bonuses {name}")
    return dict(id=name, index=index, nextLevel=next_level, points=points, cargoBonus=cargo, lootBonus=loot)


def cargo_item(stream, name):
    # CargoDescriptionBinarySerializer serializes distinct seizure and exchange rewards.
    index, rarity, take_time = stream.i32(), stream.i32(), stream.bits(64)
    seize, exchange = stream.i32(), stream.i32()
    workbench, open_time = stream.reference(), stream.bits(64)
    carry_type, breaks = stream.bits(8), stream.flag()
    exchange_points, exchange_time = stream.i32(), stream.bits(64)
    links = [stream.reference() for _ in range(6)]
    if not (0 <= rarity <= 10 and 0 <= seize <= 10**9 and 0 <= exchange <= 10**9
            and 0 <= carry_type <= 10 and 0 <= exchange_points <= 10**8
            and all(x is None or 0 <= x < 600 for x in links)):
        raise ValueError(f"Invalid cargo record {name}")
    return dict(id=name, index=index, rarity=rarity, takeTimeMs=take_time, seizureCoins=seize,
                exchangeCoins=exchange, openWorkbench=workbench, openTimeMs=open_time,
                exchangeTimeMs=exchange_time, exchangePoints=exchange_points,
                exchangeCargo=links[0], improvedExchangeCargo=links[1])


def read_cargo(data):
    _, stream = indexed_table(data, "engine", indexed_id, 3)
    rows = []
    for index in range(stream.quantities(400)):
        row = cargo_item(stream, stream.identifier())
        if row["index"] != index:
            raise ValueError("Nonconsecutive cargo index")
        rows.append(row)
    if not rows or rows[0]["id"] != "bank_cash_bag":
        raise ValueError("Cargo table header did not match")
    for row in rows:
        for field in ("exchangeCargo", "improvedExchangeCargo"):
            if row[field] is not None:
                row[field] = rows[row[field]]["id"]
    return rows


def read_collections(data, inventory, cargo):
    def collection(stream, name):
        index = stream.i32()
        entries = stream.collection(lambda: (stream.required_reference(len(inventory)), stream.i32(), stream.i32()), 30)
        reward = stream.required_reference(len(cargo))
        if not entries or any(amount <= 0 or slot < 0 for _, amount, slot in entries):
            raise ValueError(f"Invalid collection recipe {name}")
        return dict(id=name, index=index, reward=cargo[reward]["id"],
                    requires=[dict(item=inventory[item]["id"], amount=amount, slot=slot) for item, amount, slot in entries])

    return indexed_table(data, "collection_0", collection, 30)[0]


def read_vendors(data, inventory):
    def vendor(stream, name):
        index, multiplier, locked = stream.i32(), stream.f32(), stream.flag()
        def item_list():
            return stream.collection(lambda: inventory[stream.required_reference(len(inventory))]["id"], len(inventory))
        items = item_list()
        tiers = stream.collection(lambda: (stream.required_reference(10), item_list()), 10)
        roles = stream.collection(lambda: stream.required_reference(32), 32)
        if not 0 < multiplier <= 10:
            raise ValueError(f"Invalid vendor price multiplier {name}")
        return dict(id=name, index=index, buyMultiplier=multiplier, shipmentLocked=locked, items=items,
                    tiers=[dict(tierIndex=tier, items=tier_items) for tier, tier_items in tiers], roles=roles)

    return indexed_table(data, "laptop", vendor, 10)[0]


def indexed_table_candidates(source, first_id, parse_row):
    """Read tables from the count and first ID, checking every consecutive index."""
    token = first_id.encode("ascii")
    for anchor in re.finditer(re.escape(token), source):
        offset = anchor.start()
        for start in range(max(0, offset-16), offset+1):
            for pending in range(64):
                stream = ReferenceStream(source, start, pending)
                try:
                    count = stream.quantities(6000)
                    if not count or stream.bits(31) != len(token) or stream.offset != offset:
                        continue
                    stream.offset += len(token)
                    rows = [parse_row(stream, first_id)]
                    if rows[0]["index"] != 0:
                        continue
                    for index in range(1, count):
                        name = stream.identifier()
                        row = parse_row(stream, name)
                        if row["index"] != index:
                            raise ValueError(f"Nonconsecutive index in {first_id}: {name}")
                        rows.append(row)
                    yield rows, stream
                except ValueError:
                    continue


def indexed_table(source, first_id, parse_row, minimum):
    tables = {}
    for rows, stream in indexed_table_candidates(source, first_id, parse_row):
        if len(rows) >= minimum:
            tables[(stream.offset, stream.pending)] = rows, stream
    if len(tables) != 1:
        raise ValueError(f"Expected one complete {first_id} table, found {len(tables)}")
    return next(iter(tables.values()))


def read_barters(data, items):
    _, stream = indexed_table(data, "abusive_behavior", indexed_id, 7)
    recipes = []
    for index in range(stream.quantities(200)):
        name = stream.identifier()
        if stream.i32() != index:
            raise ValueError(f"Invalid barter index {name}")
        payment = stream.collection(lambda: (stream.required_reference(len(items)), stream.i32()), 50)
        result = stream.required_reference(len(items))
        if not payment or any(amount <= 0 for _, amount in payment):
            raise ValueError(f"Invalid barter payment {name}")
        recipes.append(dict(id=name, resultItem=items[result]["id"],
                            requires=[dict(item=items[item]["id"], amount=amount) for item, amount in payment]))
    if not recipes or recipes[0]["id"] != "drill_1":
        raise ValueError("Barter table header did not match")

    traders = []
    for index in range(stream.quantities(50)):
        name = stream.identifier()
        if stream.i32() != index:
            raise ValueError(f"Invalid trader index {name}")
        trades = stream.collection(lambda: stream.required_reference(len(recipes)), len(recipes))
        traders.append(dict(id=name, recipes=[recipes[recipe]["id"] for recipe in trades]))
    if not traders or traders[0]["id"] != "default_trader":
        raise ValueError("Barter trader table header did not match")
    return recipes, traders


def read_shipment_rules(data, nodes, items):
    # RealmVersionDescription contains a complete array of VendorTreeNodeWithParams.
    # This array has no string payloads, so a bit position can be read directly.
    size = len(nodes)
    rules = {}
    for null_bytes in re.finditer(rb"(?=\x00\x00\x00)", data):
        index = null_bytes.start() - 2
        if index < 4:
            continue
        word = int.from_bytes(data[index:index+7], "little")
        for shift in range(1, 9):
            if (word >> shift) & 0xFFFFFFFF != size or (word >> (shift-1)) & 1:
                continue
            stream = ReferenceStream(data, index-4)
            stream.bits(shift-1)
            realm_version = stream.i32()
            stream.bits(33)
            if not 0 <= realm_version <= 100_000:
                continue
            try:
                rows = {}
                for _ in nodes:
                    node = stream.required_reference(size)
                    enabled = stream.flag()
                    requirements = stream.collection(
                        lambda: (stream.required_reference(len(items)), stream.i32()), 30)
                    coins, years, tier = stream.i32(), stream.i32(), stream.reference()
                    previous = stream.collection(lambda: stream.required_reference(size), size)
                    if (node in rows or node in previous or not 0 <= years <= 50000
                            or not 0 <= coins <= 10**9 or tier is not None and not 0 <= tier < 50
                            or any(not 0 < amount <= 100_000_000 for _, amount in requirements)):
                        raise ValueError("Invalid shipment requirements")
                    rows[node] = dict(
                        enabled=enabled, coins=coins, imprisonmentYears=years, tierIndex=tier,
                        requires=[dict(item=items[item]["id"], amount=amount) for item, amount in requirements],
                        prerequisites=[nodes[parent]["id"] for parent in previous],
                    )
                if not any(row["requires"] and row["prerequisites"] for row in rows.values()):
                    continue
                if realm_version in rules and rules[realm_version] != rows:
                    raise RuntimeError(f"Ambiguous shipment rules for version {realm_version}")
                rules[realm_version] = rows
            except ValueError:
                continue
    if not rules:
        raise ValueError("No complete Shipment requirements found")
    return [
        dict(realmVersion=version, nodes=[
            dict(id=node["id"], item=items[node["item"]]["id"], **rows[node["index"]])
            for node in nodes
        ])
        for version, rows in sorted(rules.items())
    ]


def float32(value):
    return struct.unpack("<f", struct.pack("<f", value))[0]


def decode(data):
    inventory, _ = indexed_table(data, "jp7_m1", inventory_item, 350)
    modifiers, _ = indexed_table(data, "common", sell_modifier, 5)
    ammo, _ = indexed_table(data, "rifle", ammo_price, 4)
    loot, _ = indexed_table(data, "bank_cash", loot_node, 30)
    shipments, _ = indexed_table(data, "fukurou_tensa", shipment_item, 100)
    notoriety, _ = indexed_table(data, "level_1", notoriety_level, 5)
    weapons, _ = indexed_table(data, "jp_7_m_1", weapon_description, 46)
    armor, _ = indexed_table(data, "armor_1_mk_1", armor_description, 4)

    for item in inventory:
        price = item if item["ammo"] is None else ammo[item["ammo"]]
        base, modifier = price["basePrice"], price["modifier"]
        # The game multiplies in single precision and rounds ties to even.
        multiplier = modifiers[modifier]["multiplier"] if modifier is not None else None
        if base and multiplier is None:
            raise ValueError(f"Missing sale multiplier for {item['id']}")
        item["basePrice"] = base
        item["sellPrice"] = round(float32(float32(base) * multiplier)) if base else 0
        if item["weapon"] is not None:
            item["weaponFacts"] = weapons[item["weapon"]].copy()
        if item["armor"] is not None:
            item["armorFacts"] = armor[item["armor"]]
    ammo_items = {item["ammo"]: item["id"] for item in inventory if item["itemType"] == 0 and item["ammo"] is not None}
    for item in inventory:
        if weapon := item.get("weaponFacts"):
            weapon["ammoItemId"] = ammo_items.get(weapon["ammoIndex"])

    barters, traders = read_barters(data, inventory)
    rules = read_shipment_rules(data, shipments, inventory)
    cargo = read_cargo(data)
    collections = read_collections(data, inventory, cargo)
    vendors = read_vendors(data, inventory)
    loot_rows = [dict(id=row["id"], item=inventory[row["item"]]["id"],
                      steps=row["steps"], quantityPerStep=row["quantityPerStep"]) for row in loot]
    return inventory, dict(barters=barters, traders=traders, shipments=rules, loot=loot_rows,
                           notoriety=notoriety, cargo=cargo, collections=collections, vendors=vendors)


def apply_game_artwork(bundles, root, items, cargo, english):
    import UnityPy
    from PIL import Image

    env = UnityPy.load(str(bundles / "scriptableobjects_assets_all.bundle"))
    for asset in ("space-global_assets_all.bundle", "shared-global_assets_all.bundle",
                  "*__fullspriteatlas*.bundle"):
        for file in bundles.glob(asset):
            env.load_file(str(file))
    views = {}
    sprites = {}
    view_names = {"InventoryItemViewDescriptions", "CargoViewDescriptions", "CargoWorkbenchTypeViewDescriptions"}
    for reader in env.objects:
        if reader.type.name == "Sprite":
            sprites[(reader.assets_file.name, reader.path_id)] = reader
        elif reader.type.name == "MonoBehaviour" and (name := reader.peek_name()) in view_names:
            views[name] = reader

    def view_rows(name):
        reader = views[name]
        rows = reader.read_typetree()["<List>k__BackingField"]
        return reader.assets_file, {row["<Identified>k__BackingField"]["_id"]: row for row in rows}

    def localized(field):
        ref = field.get("m_TableEntryReference", {})
        return english.get(ref.get("m_KeyId"), "")

    def save_artwork(row, key, pointer, asset_file, folder):
        if not pointer or not pointer["m_PathID"]:
            return
        file_id = pointer["m_FileID"]
        source = asset_file.externals[file_id-1].path.rsplit("/", 1)[-1] if file_id else asset_file.name
        sprite = sprites.get((source, pointer["m_PathID"]))
        if sprite is None:
            return
        try:
            image = sprite.read().image
            image.thumbnail((112, 112), Image.Resampling.LANCZOS)
            image.save(root / folder / f"{key}.webp", quality=88, method=4)
        except (KeyError, ValueError, FileNotFoundError, NotImplementedError):
            return
        row["icon"] = f"data/rob-run/{folder}/{key}.webp"
        row["sourceSprite"] = sprite.peek_name()

    item_file, item_views = view_rows("InventoryItemViewDescriptions")
    for item in items.values():
        key = item.get("gameId")
        view = item_views.get(key)
        if not view:
            continue
        name = localized(view.get("<Name>k__BackingField", {}))
        if name and not key.startswith(("safe_key_", "room_key_", "vip_key_")):
            item["name"] = name
        description = localized(view.get("<Description>k__BackingField", {}))
        if description:
            item["description"] = description
        save_artwork(item, item["id"], view.get("_sprite"), item_file, "icons")

    cargo_file, cargo_views = view_rows("CargoViewDescriptions")
    (root / "cargo-icons").mkdir(exist_ok=True)
    for entry in cargo:
        link = cargo_views.get(entry["id"], {}).get("<View>k__BackingField")
        if not link or link["m_FileID"] or not link["m_PathID"]:
            continue
        view = cargo_file.objects[link["m_PathID"]].read_typetree()
        entry["name"] = localized(view.get("<Name>k__BackingField", {})) or entry["id"]
        entry["description"] = localized(view.get("<Description>k__BackingField", {}))
        save_artwork(entry, entry["id"].replace("_", "-"), view.get("<CargoImage>k__BackingField"), cargo_file, "cargo-icons")

    _, workbench = view_rows("CargoWorkbenchTypeViewDescriptions")
    return {key: localized(view["<SlotView>k__BackingField"]["<MiniTooltipTitle>k__BackingField"])
            for key, view in workbench.items()}


def export_economy(references, bundles, output):
    tools = run_path(str(Path(__file__).with_name("extract-rob-run-content.py")))
    strings = tools["read_strings"](bundles)
    slug, save_json, category = (tools[key] for key in ("slug", "save_json", "catalog_category"))
    data = references.read_bytes()
    inventory, economy = decode(data)
    source = dict(asset=references.name, sha256=hashlib.sha256(data).hexdigest())
    root = output / "data/rob-run"
    catalog = json.loads((root / "items.json").read_text(encoding="utf-8"))
    items = {item["id"]: item for item in catalog["items"]
             if not item.get("sourceAsset", "").startswith("references.dat")}
    for record in inventory:
        source_id = record["id"]
        item_id = slug(source_id)
        if item_id not in items:
            name = strings.get(f"{source_id}_name", source_id)
            items[item_id] = dict(
                id=item_id, name=name, category=category(source_id, name),
                description=strings.get(f"{source_id}_description", ""), markers=[], sourceAsset=references.name,
            )
        item = items[item_id]
        item.update(gameId=source_id, sellAvailable=record["sellAvailable"], basePrice=record["basePrice"],
                    sellPrice=record["sellPrice"] if record["sellAvailable"] else None)
        item.update(width=record["width"], height=record["height"], rarity=record["rarity"],
                    inventoryType=record["itemType"], stackSize=record["stackSize"], durability=record["durability"])
        if "weaponFacts" in record:
            item["weapon"] = record["weaponFacts"]
        if "armorFacts" in record:
            item["armor"] = record["armorFacts"]

    bench_types, _ = indexed_table(data, "common_workbench", indexed_id, 2)
    bench_names = apply_game_artwork(bundles, root, items, economy["cargo"], tools["read_english_ids"](bundles))
    for row in economy["cargo"]:
        index = row["openWorkbench"]
        if index is not None:
            key = bench_types[index]["id"]
            row["openWorkbench"] = bench_names.get(key) or key
    trader_keys = {"default_trader": "barter_trader_name", "city_trader": "city_barter_trader_name"}
    for trader in economy["traders"]:
        key = trader_keys.get(trader["id"])
        trader["name"] = strings.get(key, trader["id"]) if key else trader["id"]

    catalog["references"] = source
    catalog["items"] = sorted(items.values(), key=lambda item: (item["name"].casefold(), item["id"]))
    save_json(root / "items.json", catalog)
    save_json(root / "economy.json", dict(source=source, **economy))
    city_metadata = json.loads((output / "maps/looty-bay/metadata.json").read_text(encoding="utf-8"))
    tools["build_heists"](output, city_metadata["locations"])
    print(f"{len(inventory)} inventory records, {len(economy['barters'])} barters, "
          f"{sum(len(record['nodes']) for record in economy['shipments'])} Shipment nodes, "
          f"{len(economy['loot'])} loot yields, {len(economy['cargo'])} cargo entries, "
          f"{len(economy['collections'])} collections and {len(economy['vendors'])} vendor inventories.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("install", type=Path, help="Steam common/Rob Run directory")
    parser.add_argument("references", type=Path, help="The official game client's downloaded references.dat")
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[1] / "public")
    args = parser.parse_args()
    bundles = args.install / "ROB RUN_Data/StreamingAssets/aa/StandaloneWindows64"
    export_economy(args.references, bundles, args.output)


if __name__ == "__main__":
    main()

