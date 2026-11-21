"""Publish Soul Healer identities and level-based recovery prices from client tables."""

import argparse
import json
from pathlib import Path


def rows(tables, name):
    return json.loads((tables / f"{name}.json").read_text(encoding="utf-8"))["Properties"]["Data"]


def value(cell):
    return cell["Value"] if isinstance(cell, dict) else cell


def publish(tables, output):
    npcs = sorted(str(value(npc["ID"])) for npc in rows(tables, "NpcData")
                  if npc.get("FunctionType") == "ENpcFuncType::Resurrection"
                  and not npc.get("Name", "").startswith("Basic_"))
    costs = sorted(({"level": row["Level"], "kinah": row["ExpRecoverGold"],
                     "dia": row["ExpRecoverDia"]} for row in rows(tables, "Exp")),
                   key=lambda row: row["level"])
    if not npcs or not costs or [cost["level"] for cost in costs] != list(range(1, len(costs) + 1)):
        raise ValueError("Soul Healers or contiguous recovery levels are missing")
    if any(cost["kinah"] < 0 or cost["dia"] < 0 for cost in costs):
        raise ValueError("Invalid recovery price")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps({"version": 1, "npcs": npcs, "costs": costs},
                                 ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Published {len(npcs)} Soul Healers and {len(costs)} recovery levels to {output}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--tables", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=Path("public/data/reference/resurrection-services.json"))
    args = parser.parse_args()
    publish(args.tables, args.output)
