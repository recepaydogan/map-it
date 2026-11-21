"""Mark mapped quest objective NPCs as a dedicated map layer."""

import argparse
import json
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
QUESTS = ROOT / "public/data/reference/quests"
MAPS = ROOT / "public/maps"


def quest_targets():
    npc_references = set()
    marker_targets = set()
    for path in sorted(QUESTS.glob("*.json")):
        entries = json.loads(path.read_text(encoding="utf-8"))["entries"]
        for quest in entries.values():
            marker_targets.update(
                (location["mapId"], location["markerId"])
                for location in quest.get("locations", [])
            )
            for section in quest.get("sections", []):
                if section["title"] != "reference.labels.objectives":
                    continue
                for row in section.get("rows", []):
                    npc_references.update(
                        link["id"] for link in row.get("links", [])
                        if link.get("category") == "creatures" and link["id"].startswith("NpcData:")
                    )
    return npc_references, marker_targets


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Fail if generated map categories are stale")
    args = parser.parse_args()
    references, targets = quest_targets()
    changed_maps = []
    quest_npcs_by_map = Counter()
    for path in sorted(MAPS.glob("*/metadata.json")):
        metadata = json.loads(path.read_text(encoding="utf-8"))
        quest_npcs_by_map[path.parent.name] += 0
        changed = False
        for point in metadata.get("locations", []):
            if point["category"] not in ("npc", "quest-npc"):
                continue
            reference = point.get("reference") or {}
            is_quest_npc = (path.parent.name, point["id"]) in targets or reference.get("id") in references
            category = "quest-npc" if is_quest_npc else "npc"
            if is_quest_npc:
                quest_npcs_by_map[path.parent.name] += 1
            if point["category"] != category:
                point["category"] = category
                changed = True
        if changed:
            changed_maps.append(path.parent.name)
            if not args.check:
                path.write_text(json.dumps(metadata, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    if args.check and changed_maps:
        parser.error(f"Quest NPC categories are stale in: {', '.join(changed_maps)}")
    print(f"Quest NPC markers: {sum(quest_npcs_by_map.values())}; updated maps: {len(changed_maps)}")
    for map_id, count in sorted(quest_npcs_by_map.items()):
        print(f"  {map_id}: {count}")


if __name__ == "__main__":
    main()
