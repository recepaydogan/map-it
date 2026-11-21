#!/usr/bin/env python3
"""Render high-resolution PEAK maps from installed Unity scene geometry."""

from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from pathlib import Path
from types import ModuleType


PROJECT_ROOT = Path(__file__).resolve().parents[1]
EXTRACTOR_PATH = Path(__file__).resolve().with_name("extract-peak-data.py")
CONFIG_PATH = Path(__file__).resolve().parent / "peak-data" / "map-config.json"
CATALOG_PATH = PROJECT_ROOT / "artifacts" / "peak-data" / "catalog.json"
MAP_ROOT = CATALOG_PATH.parent / "maps"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--game-dir", type=Path, help="PEAK installation directory.")
    parser.add_argument(
        "--level",
        action="append",
        type=int,
        help="Render only this zero-based daily level. May be repeated.",
    )
    return parser.parse_args()


def load_extractor() -> ModuleType:
    specification = importlib.util.spec_from_file_location("peak_map_extractor", EXTRACTOR_PATH)
    if specification is None or specification.loader is None:
        raise SystemExit(f"Unable to load map renderer from {EXTRACTOR_PATH}")
    module = importlib.util.module_from_spec(specification)
    sys.modules[specification.name] = module
    specification.loader.exec_module(module)
    return module


def write_catalog(catalog: dict) -> None:
    temporary = CATALOG_PATH.with_suffix(".json.tmp")
    temporary.write_text(
        json.dumps(catalog, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    temporary.replace(CATALOG_PATH)


def main() -> None:
    args = parse_args()
    extractor = load_extractor()
    game_dir, _ = extractor.locate_game_dir(args.game_dir)
    game_data = game_dir / "PEAK_Data"
    config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    projection = config["projection"]
    selected = set(args.level) if args.level else None
    catalog_levels = {int(level["index"]): level for level in catalog["levels"]}

    for level in config["levels"]:
        level_index = int(level["index"])
        if selected is not None and level_index not in selected:
            continue
        catalog_level = catalog_levels.get(level_index)
        if catalog_level is None:
            raise SystemExit(f"Catalog is missing daily level {level_index}")

        scene_path = game_data / level["assetFile"]
        print(f"Loading {level['scene']} from {scene_path.name}...")
        environment = extractor.UnityPy.load(str(scene_path))
        assets_file = next(iter(environment.files.values()))
        surfaces, bounds = extractor.extract_map_geometry(assets_file, {})
        if bounds[0] < projection["worldXMin"] or bounds[2] > projection["worldXMax"]:
            raise SystemExit(
                f"{level['scene']} geometry exceeds configured horizontal bounds: {bounds}"
            )

        output = MAP_ROOT / f"level-{level_index}.webp"
        triangle_count = sum(len(surface.triangles) for surface in surfaces)
        print(f"Rendering {triangle_count:,} scene triangles to {output.name}...")
        extractor.render_map(surfaces, projection, output)

        catalog_level["projection"] = projection.copy()
        catalog_level["mapImage"] = f"./data/peak/maps/{output.name}"
        for marker in catalog_level["markers"]:
            world = marker.get("world")
            if not world:
                continue
            map_x, map_y = extractor.project_position(
                float(world["x"]),
                float(world["z"]),
                projection,
            )
            marker["map"] = {"x": map_x, "y": map_y}
        print(f"Finished {level['scene']}.")

    write_catalog(catalog)
    print("Updated map images and marker projection in catalog.json.")


if __name__ == "__main__":
    main()
