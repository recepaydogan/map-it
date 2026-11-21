"""Audit real isolated interior recipes against native volumes, DDS pixels and pins.

Upright native volumes and explicitly bound native instance chains are checked.
Composite pixel measurements use Pillow, independently of the Sharp renderer.
This does not publish content or certify conditional actors and atlas layout.
"""

import argparse
import hashlib
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent


def contains(volume, point):
    if not volume["minHeight"] <= point["y"] < volume["maxHeight"]:
        return False
    winding = 0
    polygon = volume["polygon"]
    for a, b in zip(polygon, polygon[1:] + polygon[:1]):
        cross = (b["x"] - a["x"]) * (point["z"] - a["z"]) - (point["x"] - a["x"]) * (b["z"] - a["z"])
        if abs(cross) < 1e-8 and min(a["x"], b["x"]) <= point["x"] <= max(a["x"], b["x"]) and min(a["z"], b["z"]) <= point["z"] <= max(a["z"], b["z"]):
            return True
        if a["z"] <= point["z"] < b["z"] and cross > 0:
            winding += 1
        if b["z"] <= point["z"] < a["z"] and cross < 0:
            winding -= 1
    return winding != 0


def native_transform(points, transform):
    """Hamilton quaternion products, independent of the producer's vector formula."""
    position = np.array(list(map(float, transform["Position"]["value"].split())))
    x, y, z, w = map(float, transform["RotationQuat"]["value"].split())
    scale = transform["Scale"]["value"]
    assert np.isfinite([*position, x, y, z, w, scale]).all() and scale > 0
    assert abs(x*x + y*y + z*z + w*w - 1) < 1e-5, "Invalid native quaternion"
    # L(q) and R(conjugate(q)) retain original float precision without normalizing.
    left = np.array([[w, -x, -y, -z], [x, w, -z, y], [y, z, w, -x], [z, -y, x, w]])
    right = np.array([[w, x, y, z], [-x, w, -z, y], [-y, z, w, -x], [-z, -y, x, w]])
    vectors = np.column_stack([np.zeros(len(points)), np.array(points) * scale])
    return (vectors @ (left @ right).T)[:, 1:] + position


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", required=True)
    parser.add_argument("--raster-root", required=True)
    parser.add_argument("--content-stage", required=True)
    parser.add_argument("--inventory", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    hashes = {}

    def data(file):
        file = (ROOT / file).resolve()
        raw = file.read_bytes()
        hashes[file.relative_to(ROOT).as_posix()] = hashlib.sha256(raw).hexdigest()
        return raw

    def read(file):
        return json.loads(data(file))

    config = read(args.config)
    inventory = read(args.inventory)
    catalog = read("map-sources/catalog/floor-volumes.json")
    texture_catalog = read(config["nativeTextureCatalog"])
    textures = {row["textureName"]: row for row in texture_catalog["textures"]}
    reviews = {row["mapId"]: row for row in config["placementReviews"]}
    assert set(reviews) == {row["id"] for row in config["maps"]}
    native_template_levels = {}
    for source_path in config.get("nativeRootTemplateSources", []):
        for obj in read(source_path)["save"]["regions"]["Templates"]["GameObjects"]:
            if obj.get("SubLevelName", {}).get("value"):
                key, value = obj["MapKey"]["value"], obj["SubLevelName"]["value"]
                assert key not in native_template_levels or native_template_levels[key] == value
                native_template_levels[key] = value

    def project_instances(points, chain, level):
        for instance in chain:
            placed, = [row for row in read(instance["source"])["save"]["regions"]["Templates"]["GameObjects"]
                       if row["MapKey"]["value"] == instance["id"]]
            assert placed["Type"]["value"] == "LevelTemplate"
            assert native_template_levels[placed["TemplateName"]["value"]] == level
            level = placed["LevelName"]["value"]
            assert level == Path(instance["source"]).parts[-3]
            points = native_transform(points, placed["Transform"][0])
        return points, level

    results = []
    for recipe in config["maps"]:
        map_id = recipe["id"]
        review = reviews[map_id]
        entries = [row for row in catalog["entries"] if row["mapId"] == review["parentMapId"] and row.get("volume", {}).get("id") in review["patchIds"]]
        assert len(entries) == len(review["patchIds"])
        native = {row["MapKey"]["value"]: row for row in read(review["nativeTriggerSource"])["save"]["regions"]["Templates"]["GameObjects"]}
        geometry_errors, verified_volumes = {}, {}
        for entry in entries:
            assert entry["status"] == "resolved-native-volume"
            volume = entry["volume"]
            source = native[volume["nativeTriggerId"]]
            transform, = source["Transform"]
            assert source["BuildingUUID"]["value"] == volume["buildingId"]
            assert source["Floor"]["value"] == volume["floor"]
            assert source["IsRoof"]["value"] is False and volume["isRoof"] is False
            if "Points" in source:
                points = [list(map(float, row["Object"]["value"].split())) for row in source["Points"]]
                low, high = 0, source["Height"]["value"]
            else:
                ex, ey, ez = map(float, source["Extents"]["value"].split())
                points, low, high = [(-ex, -ez), (ex, -ez), (ex, ez), (-ex, ez)], -ey, ey
            assert len(points) >= 3 and high > low
            bottom = native_transform([[px, low, pz] for px, pz in points], transform)
            top = native_transform([[px, high, pz] for px, pz in points], transform)
            native_level = Path(review["nativeTriggerSource"]).parts[-3]
            chain = review.get("nativeInstanceChain", [])
            top, _ = project_instances(top, chain, native_level)
            bottom, native_level = project_instances(bottom, chain, native_level)
            patch, = [row for row in inventory["patches"] if row["identity"] == entry["identity"]]
            assert native_level == patch["level"], "Incomplete native instance chain"
            assert np.max(np.abs(top[:, [0, 2]] - bottom[:, [0, 2]])) < 1e-8, "Tilted floor needs 3D review"
            assert np.ptp(bottom[:, 1]) < 1e-8 and np.ptp(top[:, 1]) < 1e-8
            polygon = [{"x": float(px), "z": float(pz)} for px, _, pz in bottom]
            low, high = float(bottom[:, 1].min()), float(top[:, 1].max())
            error = max(float(np.max(np.abs(bottom[:, [0, 2]] - np.array([[p["x"], p["z"]] for p in volume["polygon"]])))),
                        abs(low - volume["minHeight"]), abs(high - volume["maxHeight"]))
            # Existing map calibration rounds translated instances by 0.000005
            # world units. Record that discrepancy; never alter native geometry.
            assert error <= (1e-5 if review.get("nativeInstanceChain") else 1e-10), "Native geometry differs"
            geometry_errors[volume["id"]] = error
            verified_volumes[volume["id"]] = {**volume, "polygon": polygon, "minHeight": low, "maxHeight": high}
        layers = recipe.get("layers", [recipe])
        images, worlds = [], []
        for layer in layers:
            texture = Path(layer["source"]).name.removesuffix("_0.dds")
            patch, = [row for row in inventory["patches"] if row["id"] in review["patchIds"] and row["texture"] == texture]
            assert patch["worldBounds"] == layer["worldBounds"] and layer["cropContent"] is False
            data(layer["source"])
            with Image.open(ROOT / layer["source"]) as image:
                assert image.size == (textures[texture]["width"], textures[texture]["height"])
                images.append(image.convert("RGBA"))
            w = layer["worldBounds"]
            worlds.append((w["centerX"] - w["width"] / 2, w["centerY"] - w["height"] / 2, w["width"], w["height"]))
        left, bottom = min(w[0] for w in worlds), min(w[1] for w in worlds)
        right, top = max(w[0] + w[2] for w in worlds), max(w[1] + w[3] for w in worlds)
        world_width, world_height = right - left, top - bottom
        if len(images) == 1:
            expected = images[0]
        else:
            ppu = recipe["pixelsPerWorldUnit"]
            expected = Image.new("RGBA", (math.ceil(world_width * ppu), math.ceil(world_height * ppu)))
            for source, world in zip(images, worlds):
                rounded = lambda value: math.floor(value + 0.5)
                resized = source.resize((rounded(world[2] * ppu), rounded(world[3] * ppu)), Image.Resampling.LANCZOS)
                expected.alpha_composite(resized, (rounded((world[0] - left) * ppu), rounded((top - world[1] - world[3]) * ppu)))
        directory = Path(args.raster_root) / map_id
        metadata = read(directory / "metadata.json")
        assert metadata["sourceBuild"] == config["sourceBuild"]
        assert metadata["description"] == recipe["description"]
        assert metadata["displayName"] == recipe["displayName"]
        frame = metadata["coordinateReference"]
        assert frame["flipY"] is True
        for field, value in {"x": left, "y": bottom, "width": world_width, "height": world_height}.items():
            assert abs(frame["worldBounds"][field] - value) < 1e-10
        width, height = expected.size
        assert metadata["bounds"] == {"minX": 0, "minY": 0, "maxX": width, "maxY": height}
        actual = np.zeros((height, width, 4), dtype=np.uint8)
        tile_size = metadata["tileSize"]
        tile_count = 0
        for level in metadata["detailLevels"]:
            for column in range(math.ceil(width / 2 ** level / tile_size)):
                for row in range(math.ceil(height / 2 ** level / tile_size)):
                    file = directory / f"tiles/{level}/tile{column}x{row}.webp"
                    data(file)
                    with Image.open(ROOT / file) as image:
                        assert image.size == (tile_size, tile_size)
                        if level == 0:
                            x, y = column * tile_size, row * tile_size
                            rw, rh = min(tile_size, width - x), min(tile_size, height - y)
                            actual[y:y + rh, x:x + rw] = np.array(image.convert("RGBA"))[:rh, :rw]
                    tile_count += 1
        data(directory / "overview.webp")
        with Image.open(ROOT / directory / "overview.webp") as image:
            assert image.size == expected.size
            overview_alpha = np.array(image.convert("RGBA"))[:, :, 3]
        pixels = np.array(expected)
        alpha_changes = int(np.count_nonzero(pixels[:, :, 3] != actual[:, :, 3]))
        if len(images) == 1:
            assert alpha_changes == 0, "Uncropped native floor lost exact alpha"
            assert np.array_equal(pixels[:, :, 3], overview_alpha), "Native overview alpha changed"
        opaque = pixels[:, :, 3] >= 240
        rgb_error = np.abs(pixels[:, :, :3].astype(float) - actual[:, :, :3].astype(float)).mean(axis=2)
        buildings = {entry["volume"]["buildingId"] for entry in entries}
        siblings = [entry["volume"] for entry in catalog["entries"] if entry["mapId"] == review["parentMapId"] and entry["status"] == "resolved-native-volume" and entry["volume"]["buildingId"] in buildings]
        native_siblings = [verified_volumes.get(volume["id"], volume) for volume in siblings]
        content = read(Path(args.content_stage) / "public/maps" / review["parentMapId"] / "content.json")
        occupants, boundary_portals = [], []
        def selected_volume(point, volumes):
            matching = sorted([volume for volume in volumes if contains(volume, point)], key=lambda volume: (-volume["minHeight"], volume["id"]))
            return matching[0]["id"] if matching else None

        for entity in content["entities"]:
            portal = entity.get("navigationPortal")
            selection_point = portal["sourcePosition"] if portal else entity["worldPosition"]
            pivot_volume, entrance_volume = selected_volume(entity["worldPosition"], siblings), selected_volume(selection_point, siblings)
            for point in [entity["worldPosition"], selection_point]:
                assert selected_volume(point, siblings) == selected_volume(point, native_siblings), "Source float calibration changes a floor assignment"
            if portal and (pivot_volume in review["patchIds"] or entrance_volume in review["patchIds"]):
                # Never infer an endpoint from a nearby pin or an item action.
                assert not portal.get("actionBinding") and portal["id"] == entity["id"]
                assert portal["sourceWorldLevel"] == portal["level"] == entity["sourceLevel"]
                source_path = f"Mods/{portal['module']}/Levels/{portal['level']}/Ai/navigationPortals.lsj"
                assert portal["provenance"]["sourcePath"] == source_path
                source_portals = read(Path("map-sources/converted/navigation-portals") / source_path)["save"]["regions"]["PortalData"]["Portal"]
                native_portal, = [row for row in source_portals if row["PortalUUID"]["value"] == entity["id"]]
                source_point = dict(zip(["x", "y", "z"], map(float, native_portal["Source"]["value"].split())))
                if portal["sourceCoordinateSpace"] == "world-region":
                    assert portal["sourceTransformId"] is None and source_point == selection_point
                else:
                    assert portal["sourceCoordinateSpace"] == "level-transform"
                    key = f"{portal['module']}/{portal['level']}"
                    assert portal["sourceTransformId"] == key and portal["authoredSourcePosition"] == source_point
                    chain = config.get("nativePortalInstanceChains", {}).get(key)
                    assert chain, "Transformed portal needs an explicit native instance chain"
                    projected, level = project_instances([[source_point[k] for k in ["x", "y", "z"]]], chain, portal["level"])
                    assert level == patch["level"]
                    native_point = dict(zip(["x", "y", "z"], map(float, projected[0])))
                    assert max(abs(native_point[k] - selection_point[k]) for k in native_point) <= 1e-5
                    assert selected_volume(native_point, native_siblings) == entrance_volume
                if pivot_volume != entrance_volume:
                    boundary_portals.append({"id": entity["id"], "title": entity["title"], "pivotVolume": pivot_volume,
                                             "entranceVolume": entrance_volume, "sourcePosition": source_point,
                                             "provenance": source_path})
            if entrance_volume in review["patchIds"]:
                point = entity["worldPosition"]
                x = math.floor((point["x"] - left) / world_width * width)
                y = math.floor((top - point["z"]) / world_height * height)
                assert 0 <= x < width and 0 <= y < height, f"Native occupant outside image: {entity['id']}"
                occupants.append({"id": entity["id"], "title": entity["title"], "worldPosition": point,
                                  "patchId": entrance_volume, "selectionPosition": selection_point, "pixel": [x, y], "alpha": int(actual[y, x, 3])})
        results.append({"mapId": map_id, "width": width, "height": height, "tiles": tile_count,
                        "nativeGeometryMaxErrors": geometry_errors,
                        "nativePatches": review["patchIds"], "opaquePixels": int(opaque.sum()),
                        "changedAlphaPixels": alpha_changes, "meanOpaqueRgbError": float(rgb_error[opaque].mean()),
                        "maxAlphaError": int(np.abs(pixels[:, :, 3].astype(int) - actual[:, :, 3].astype(int)).max()),
                        "opaqueBecameTransparentPixels": int(np.count_nonzero(opaque & (actual[:, :, 3] < 16))),
                        "stronglyDifferentOpaquePixels": int(np.count_nonzero(opaque & (rgb_error > 30))),
                        "occupants": occupants, "boundaryPortals": boundary_portals,
                        "transparentOccupants": [row["id"] for row in occupants if row["alpha"] < 16]})
    data(Path(__file__))
    report = {"kind": "native-interior-review", "hashes": hashes, "maps": results,
              "scope": __doc__.strip(), "published": False}
    output = (ROOT / args.output).resolve()
    assert output.is_relative_to(ROOT / "map-sources/audits")
    output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf8")
    print(json.dumps([{**{key: value for key, value in row.items() if key != "occupants"}, "occupants": len(row["occupants"])} for row in results], indent=2))


if __name__ == "__main__":
    main()
