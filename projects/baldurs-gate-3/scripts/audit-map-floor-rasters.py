"""Compare native floor pixels with published parent rasters for review triage.

Image differences are evidence to inspect, not an automatic missing-room verdict.
This audit never changes map pixels, markers, or source classifications.
"""

import json
import argparse
from functools import lru_cache
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parent.parent
SAMPLE_EDGE = 64


@lru_cache(maxsize=256)
def tile_pixels(map_id, column, row, maps_root):
    filename = maps_root / map_id / "tiles/0" / f"tile{column}x{row}.webp"
    with Image.open(filename) as image:
        return np.array(image.convert("RGBA"))


@lru_cache(maxsize=256)
def metadata(map_id, maps_root):
    return json.loads((maps_root / map_id / "metadata.json").read_text(encoding="utf8"))


def compare(patch, samples, map_id, maps_root, evidence_directory=None):
    meta = metadata(map_id, maps_root)
    reference = meta["coordinateReference"]
    world = reference["worldBounds"]
    bounds = meta["bounds"]
    size = meta.get("tileImageSize", {"width": bounds["maxX"] - bounds["minX"], "height": bounds["maxY"] - bounds["minY"]})
    native = patch["worldBounds"]
    ys, xs = np.indices(samples.shape[:2])
    wx = native["centerX"] + ((xs + 0.5) / samples.shape[1] - 0.5) * native["width"]
    wz = native["centerY"] + (0.5 - (ys + 0.5) / samples.shape[0]) * native["height"]
    px = np.floor((wx - world["x"]) / world["width"] * size["width"]).astype(int)
    fraction_y = (wz - world["y"]) / world["height"]
    py = np.floor((1 - fraction_y if reference["flipY"] else fraction_y) * size["height"]).astype(int)
    valid = (px >= 0) & (py >= 0) & (px < size["width"]) & (py < size["height"])
    actual = np.zeros_like(samples)
    tile_size = meta["tileSize"]
    for column, row in set(zip((px[valid] // tile_size).tolist(), (py[valid] // tile_size).tolist())):
        mask = valid & (px // tile_size == column) & (py // tile_size == row)
        actual[mask] = tile_pixels(map_id, column, row, maps_root)[py[mask] % tile_size, px[mask] % tile_size]
    opaque = samples[:, :, 3] >= 240
    visible = opaque & (actual[:, :, 3] >= 240)
    differences = np.abs(actual[:, :, :3].astype(float) - samples[:, :, :3].astype(float)).mean(axis=2)
    if evidence_directory:
        Image.fromarray(actual).save(evidence_directory / f"{patch['id']}-{map_id}.png")
    return {
        "mapId": map_id,
        "nativeDimensionsVerified": meta.get("rasterEncoding", {}).get("nativeDimensionsVerified", False),
        "opaqueSamples": int(opaque.sum()),
        "uncoveredSamples": int((opaque & ~valid).sum()),
        "transparentParentSamples": int((opaque & (actual[:, :, 3] < 16)).sum()),
        "meanRgbError": round(float(differences[visible].mean()), 3) if visible.any() else None,
        "stronglyDifferentSamples": int((visible & (differences > 30)).sum()),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--evidence", help="Render source and parent comparisons for one patch UUID")
    parser.add_argument("--maps", help="Compare only the specified comma-separated parent maps")
    parser.add_argument("--raster-root", default="public/maps", help="Published or completed staged map directory")
    parser.add_argument("--inventory", default="public/maps/source-inventory-report.json", help="Native source inventory to review")
    parser.add_argument("--output", help="Write an isolated audit report without replacing the catalog report")
    args = parser.parse_args()
    maps_root = (ROOT / args.raster_root).resolve()
    requested_maps = set(filter(None, (args.maps or "").split(",")))
    inventory_path = (ROOT / args.inventory).resolve()
    inventory = json.loads(inventory_path.read_text(encoding="utf8"))
    results = []
    evidence_directory = ROOT / "map-sources/audits/floor-evidence" if args.evidence else None
    if evidence_directory:
        evidence_directory.mkdir(parents=True, exist_ok=True)
    for patch in inventory["patches"]:
        if patch["status"] != "requires-floor-review":
            continue
        if args.evidence and patch["id"] != args.evidence:
            continue
        parent_maps = [map_id for map_id in patch["spatialCandidateMapIds"] if not requested_maps or map_id in requested_maps]
        if not parent_maps:
            continue
        source = ROOT / "map-sources/processed/minimaps-exact" / f"{patch['texture']}_0.dds"
        with Image.open(source) as image:
            # Nearest source samples avoid hiding a different floor behind blur.
            edge = 512 if args.evidence else SAMPLE_EDGE
            samples = np.array(image.convert("RGBA").resize((edge, edge), Image.Resampling.NEAREST))
        if evidence_directory:
            Image.fromarray(samples).save(evidence_directory / f"{patch['id']}-source.png")
        results.append({
            "identity": patch["identity"], "name": patch["name"], "buildingId": patch["buildingId"],
            "floor": patch["floor"], "nativeTexture": patch["texture"],
            "comparisons": [compare(patch, samples, map_id, maps_root, evidence_directory) for map_id in parent_maps],
        })
        if len(results) % 25 == 0:
            print(f"Compared {len(results)} native floor rasters.", flush=True)
    if args.evidence:
        if not results:
            raise ValueError("No pending floor patch matches the requested UUID")
        print(json.dumps(results, indent=2))
        return
    report = {"schemaVersion": 1, "scope": __doc__.strip(), "sampleEdge": SAMPLE_EDGE,
              "rasterRoot": str(maps_root), "inventoryPath": str(inventory_path),
              "requestedMaps": sorted(requested_maps), "patches": results}
    suffix = "-" + "-".join(sorted(requested_maps)) if requested_maps else ""
    output = (ROOT / args.output).resolve() if args.output else ROOT / f"map-sources/catalog/floor-raster-audit{suffix}.json"
    output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf8")
    print(f"Compared {len(results)} native floor rasters; evidence saved to {output.relative_to(ROOT)}.")


if __name__ == "__main__":
    main()
