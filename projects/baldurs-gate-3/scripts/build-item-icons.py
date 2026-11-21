from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Crop item icons from extracted game atlases.")
    parser.add_argument("--atlases", default="map-sources/extracted/icon-atlases")
    parser.add_argument("--mappings", default="map-sources/extracted/icon-mappings")
    parser.add_argument("--output", default="public/items/icon-atlases")
    return parser.parse_args()


def find_atlas(root: Path, stem: str) -> Path | None:
    matches = sorted(root.rglob(f"{stem}.dds"))
    return matches[-1] if matches else None


def main() -> None:
    args = parse_arguments()
    atlas_root = Path(args.atlases).resolve()
    mapping_root = Path(args.mappings).resolve()
    output_root = Path(args.output).resolve()
    output_root.mkdir(parents=True, exist_ok=True)

    converted = 0
    skipped = 0
    for mapping_path in sorted(mapping_root.rglob("*.lsx")):
        atlas_path = find_atlas(atlas_root, mapping_path.stem)
        if atlas_path is None:
            raise FileNotFoundError(f"No DDS atlas found for {mapping_path.name}.")
        output_path = output_root / f"{mapping_path.stem}.webp"
        if (
            output_path.exists()
            and output_path.stat().st_size > 0
            and output_path.stat().st_mtime >= atlas_path.stat().st_mtime
        ):
            skipped += 1
            continue
        with Image.open(atlas_path) as atlas:
            atlas.load()
            atlas.save(output_path, "WEBP", quality=88, method=4)
        converted += 1

    if converted + skipped == 0:
        raise RuntimeError("No item icon atlases were found.")
    print(
        f"Item icons: converted {converted} and reused {skipped} atlases in {output_root}."
    )


if __name__ == "__main__":
    main()
