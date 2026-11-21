"""Link item IDs to the matching source-string indexes without changing item data."""

import argparse
import json
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("decoded_items", type=Path)
    parser.add_argument("--source", type=Path, default=Path("public/data/game-locales/source.json"))
    parser.add_argument("--output", type=Path, default=Path("public/data/game-locales/item-key-index.json"))
    parser.add_argument("--previous-source", type=Path, default=Path("public/data/game-locales/source.json"))
    parser.add_argument("--previous-index", type=Path, default=Path("public/data/game-locales/item-key-index.json"))
    arguments = parser.parse_args()

    rows = json.loads(arguments.decoded_items.read_text(encoding="utf-8"))["Properties"]["Data"]
    source = json.loads(arguments.source.read_text(encoding="utf-8"))
    indexes = {key: index for index, key in enumerate(source["keys"])}
    items = json.loads(Path("public/data/items/catalog.json").read_text(encoding="utf-8"))["items"]
    item_ids = {item["id"] for item in items}
    previous_source = json.loads(arguments.previous_source.read_text(encoding="utf-8"))
    previous_index = json.loads(arguments.previous_index.read_text(encoding="utf-8"))
    entries: dict[str, int] = {}

    for row in rows:
        item_id = str(row["ID"]["Value"])
        if item_id not in item_ids:
            continue
        key = f'String_{row["Desc"]["Key"]}_body'
        index = indexes.get(key)
        if index is None:
            raise ValueError(f"Missing source text for item {item_id}: {key}")
        entries[item_id] = index

    for item_id in sorted(item_ids - entries.keys()):
        old_index = previous_index["entries"].get(item_id)
        if old_index is None:
            raise ValueError(f"No client row or previous locale key for item {item_id}")
        key = previous_source["keys"][old_index]
        index = indexes.get(key)
        if index is None:
            raise ValueError(f"Missing legacy locale key for item {item_id}: {key}")
        entries[item_id] = index

    if set(entries) != item_ids:
        raise ValueError("Item locale index does not cover the item catalog")
    for item_id, index in entries.items():
        if not isinstance(source["values"][index], str) or not source["values"][index].strip():
            raise ValueError(f"Item has no source text: {item_id}")
    arguments.output.parent.mkdir(parents=True, exist_ok=True)
    arguments.output.write_text(
        json.dumps({"version": 1, "entries": entries}, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    print(f"Indexed {len(entries)} item locale keys")


if __name__ == "__main__":
    main()
