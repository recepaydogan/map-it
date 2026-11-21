"""Publish storage NPC portraits and expansion prices from decoded client tables."""

import argparse
import json
from pathlib import Path


def rows(directory, table):
    return json.loads((directory / f"{table}.json").read_text("utf-8"))["Properties"]["Data"]


def cell_value(cell):
    return cell["Value"] if isinstance(cell, dict) else cell


def kinah_cost(row, field):
    costs = row[field]
    if len(costs) != 1 or costs[0]["ItemName"] != "GoldCombined":
        raise ValueError(f"Unsupported storage expansion cost: {row['SlotLineNum']} {field}")
    amount = costs[0]["ItemCount"]
    if not isinstance(amount, int) or amount < 0:
        raise ValueError(f"Invalid storage expansion cost: {row['SlotLineNum']} {field}")
    return amount


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--tables", type=Path, required=True)
    parser.add_argument("--artwork", type=Path, default=Path("public/data/reference/artwork"))
    parser.add_argument("--output", type=Path, default=Path("public/data/storage-services.json"))
    args = parser.parse_args()

    npcs = {}
    for npc in rows(args.tables, "NpcData"):
        if npc.get("FunctionType") != "ENpcFuncType::Storage":
            continue
        npc_id = str(cell_value(npc["ID"]))
        resource = npc["ResourceKey"].lower().replace("_", "-")
        portraits = [path for path in args.artwork.glob(f"ut-256-{resource}-*.png")
                     if not path.stem.removeprefix(f"ut-256-{resource}-").startswith("v")]
        if len(portraits) != 1:
            raise ValueError(f"Expected one base portrait for storage NPC {npc_id}: {portraits}")
        npcs[npc_id] = {"portrait": f"data/reference/artwork/{portraits[0].name}"}

    costs = []
    for row in sorted(rows(args.tables, "StorageExtensionCost"), key=lambda item: item["SlotLineNum"]):
        costs.append({
            "line": row["SlotLineNum"],
            "server": kinah_cost(row, "SlotExtensionCostList"),
            "character": kinah_cost(row, "CharStorageSlotExtensionCostList"),
        })
    if not npcs or not costs or [cost["line"] for cost in costs] != list(range(1, len(costs) + 1)):
        raise ValueError("Storage NPCs or contiguous expansion prices are missing")

    result = {"version": 1, "npcs": npcs, "costs": costs}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Published {len(npcs)} storage NPCs and {len(costs)} expansion prices to {args.output}")


if __name__ == "__main__":
    main()
