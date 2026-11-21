"""Check published event entrances against the decoded source tables and map markers."""

import argparse
import hashlib
import json
from math import hypot
import subprocess
import sys
import tempfile
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--tables", type=Path, required=True)
    args = parser.parse_args()
    script = Path(__file__).with_name("build-event-entrances.py")
    published = json.loads(Path("public/data/event-entrances.json").read_text(encoding="utf-8"))
    with tempfile.TemporaryDirectory() as directory:
        output = Path(directory) / "event-entrances.json"
        subprocess.run([sys.executable, str(script), "--tables", str(args.tables), "--output", str(output)], check=True)
        regenerated = json.loads(output.read_text(encoding="utf-8"))
    assert published == regenerated, "Published event entrance catalog differs from source tables"

    markers = [point for path in Path("public/maps").glob("*/metadata.json")
               for point in json.loads(path.read_text(encoding="utf-8"))["locations"]
               if point.get("category") == "event-entrance"
               and not point.get("eventLayerMapId") and not point.get("insetId")]
    assert len(markers) == 104
    assert {point["entityId"] for point in markers} <= set(published["npcs"])
    assert len(published["npcs"]) == 51
    map_points = {path.parent.name: {point["id"]: point for point in json.loads(path.read_text(encoding="utf-8"))["locations"]}
                  for path in Path("public/maps").glob("*/metadata.json")}
    for entrance_id, target in published["bossMarkers"].items():
        points = map_points[target["mapId"]]
        entrance = points[entrance_id]
        assert entrance["entityId"] == target["npcId"]
        for boss_id, marker_id in target["bosses"].items():
            boss = points[marker_id]
            assert boss["reference"]["id"] == boss_id
            assert boss["category"] in ("boss", "dungeon-boss", "enemy")
            assert hypot(entrance["x"] - boss["x"], entrance["y"] - boss["y"]) <= 120
    reference_root = Path("public/data/reference/creatures")
    for npc_id, entrance in published["npcs"].items():
        identity = f"NpcData:{npc_id}"
        bucket = hashlib.sha256(identity.encode()).hexdigest()[:2]
        entry = json.loads((reference_root / f"{bucket}.json").read_text(encoding="utf-8"))["entries"][identity]
        assert entry["fieldEvent"]["activityId"] == entrance["eventId"]
    assert published["npcs"]["2965107"]["eventId"] == "FieldEvent:110701"
    assert published["npcs"]["2968107"]["eventId"] == "FieldEvent:210701"
    expected_dredgion = {
        "2965141": 500032, "2965142": 500001, "2965143": 500017,
        "2966021": 510027, "2966085": 510002, "2966086": 510008,
    }
    for npc_id, map_id in expected_dredgion.items():
        entrance = published["npcs"][npc_id]
        assert entrance["mapId"] == map_id
        assert entrance["starts"] == [f"{hour:02d}:30" for hour in range(24)]
        assert entrance["days"] == list(range(7))
        assert any(target["npcId"] == npc_id and "NpcData:2340158" in target["bosses"]
                   for target in published["bossMarkers"].values())
    print("Event entrance catalog matches 104 markers, 51 source records, and six Dredgion destinations")


if __name__ == "__main__":
    main()
