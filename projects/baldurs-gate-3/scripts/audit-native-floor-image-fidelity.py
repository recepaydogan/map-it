"""Read-only native image/published archive audit; write only an isolated report."""

import argparse
import hashlib
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-stage", required=True)
    parser.add_argument("--archive", required=True)
    parser.add_argument("--new-maps", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    hashes = {}

    def read_bytes(filename):
        filename = (ROOT / filename).resolve()
        data = filename.read_bytes()
        hashes[filename.relative_to(ROOT).as_posix()] = hashlib.sha256(data).hexdigest()
        return data

    def read_json(filename):
        return json.loads(read_bytes(filename))

    baseline = read_json(Path(args.baseline_stage) / "stage-manifest.json")
    archive = ROOT / args.archive
    recipes = read_json("map-sources/config/bc3-maps.json")
    requested = args.new_maps.split(",")
    assert len(set(requested)) == len(requested)
    assert not set(requested).intersection(baseline["maps"])
    old_files = 0
    old_bytes = 0
    for map_id in baseline["maps"]:
        directory = Path("public/maps") / map_id
        metadata = read_json(directory / "metadata.json")
        bounds = metadata["bounds"]
        size = metadata.get("tileImageSize", {"width": bounds["maxX"] - bounds["minX"], "height": bounds["maxY"] - bounds["minY"]})
        paths = [Path("overview.webp")]
        for level in metadata["detailLevels"]:
            for column in range(math.ceil(size["width"] / 2 ** level / metadata["tileSize"])):
                for row in range(math.ceil(size["height"] / 2 ** level / metadata["tileSize"])):
                    paths.append(Path(f"tiles/{level}/tile{column}x{row}.webp"))
        for relative in paths:
            current = read_bytes(directory / relative)
            assert current == read_bytes(archive / map_id / relative), f"Old raster changed: {map_id}/{relative}"
            old_files += 1
            old_bytes += len(current)
    results = []
    for map_id in requested:
        recipe, = [row for row in recipes["maps"] if row["id"] == map_id]
        assert recipe.get("cropContent") is False and "source" in recipe
        read_bytes(recipe["source"])
        with Image.open(ROOT / recipe["source"]) as image:
            source = np.array(image.convert("RGBA"))
        height, width = source.shape[:2]
        directory = Path("public/maps") / map_id
        metadata = read_json(directory / "metadata.json")
        assert metadata["sourceTextureSize"] == {"width": width, "height": height}
        assert metadata["sourceImageBounds"] == {"x": 0, "y": 0, "width": width, "height": height}
        assert metadata["bounds"] == {"minX": 0, "minY": 0, "maxX": width, "maxY": height}
        actual = np.zeros_like(source)
        tile_size = metadata["tileSize"]
        tile_count = 0
        for level in metadata["detailLevels"]:
            for column in range(math.ceil(width / 2 ** level / tile_size)):
                for row in range(math.ceil(height / 2 ** level / tile_size)):
                    filename = directory / f"tiles/{level}/tile{column}x{row}.webp"
                    read_bytes(filename)
                    with Image.open(ROOT / filename) as image:
                        tile = np.array(image.convert("RGBA"))
                    tile_count += 1
                    if level == 0:
                        x, y = column * tile_size, row * tile_size
                        rw, rh = min(tile_size, width - x), min(tile_size, height - y)
                        actual[y:y + rh, x:x + rw] = tile[:rh, :rw]
        read_bytes(directory / "overview.webp")
        with Image.open(ROOT / directory / "overview.webp") as image:
            overview = np.array(image.convert("RGBA"))
        assert overview.shape == source.shape
        assert np.array_equal(source[:, :, 3], actual[:, :, 3]), "Native tile alpha changed"
        assert np.array_equal(source[:, :, 3], overview[:, :, 3]), "Native overview alpha changed"
        opaque = source[:, :, 3] >= 240
        error = np.abs(source[:, :, :3].astype(float) - actual[:, :, :3].astype(float)).mean(axis=2)
        results.append({"mapId": map_id, "width": width, "height": height, "tiles": tile_count,
                        "opaquePixels": int(opaque.sum()), "changedAlphaPixels": 0,
                        "meanOpaqueRgbError": float(error[opaque].mean()),
                        "stronglyDifferentOpaquePixels": int((opaque & (error > 30)).sum())})
    read_bytes(Path(__file__).resolve())
    report = {"kind": "native-floor-image-fidelity", "errors": [], "oldMaps": len(baseline["maps"]),
              "unchangedOldRasterFiles": old_files, "unchangedOldRasterBytes": old_bytes, "newMaps": results, "hashes": hashes,
              "scope": "Every old metadata-referenced tile/overview is byte-identical to its retained original-quality archive. New uncropped floor tiles retain native dimensions and exact alpha; full-resolution DDS-vs-WebP RGB errors are reported, not hidden. No source or published raster was changed by this audit. This does not prove native volume extraction, atlas layout or complete map coverage."}
    output = (ROOT / args.output).resolve()
    assert output.is_relative_to(ROOT / "map-sources/audits")
    output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf8")
    print(json.dumps({key: value for key, value in report.items() if key not in {"hashes", "scope"}}, indent=2))


if __name__ == "__main__":
    main()
