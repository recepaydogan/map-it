"""Keep English summaries and recommended allocations consistent with the current trees."""
import json
from pathlib import Path
import subprocess
import time

ROOT = Path(__file__).resolve().parents[1]
def read(path): return json.loads((ROOT / path).read_text(encoding="utf-8-sig"))
def write(path, data):
    if read(path) != data:
        target = ROOT / path
        temporary = target.with_suffix(".november-update.tmp")
        temporary.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf8")
        for attempt in range(5):
            try:
                temporary.replace(target)
                break
            except OSError:
                if attempt == 4: raise
                time.sleep(0.2)

current_catalog = read("public/data/classes/talent-calculator.json")
current = current_catalog["classes"]
snapshot = current_catalog.get("sourceSnapshot", "wowhead-2026-11-02")
original = json.loads(subprocess.check_output(["git", "show", "HEAD:public/data/classes/talent-calculator.json"], cwd=ROOT))["classes"]
class_catalog = read("public/data/classes/catalog.json")
metadata = read("public/data/spells/foreverdb/classes.json")
renames = {"Improved Fireball": "Accelerant", "Elemental Precision": "Precision", "Binding Heal": "Holy Binding"}
changed_builds = []

for cls in current:
    old = next(c for c in original if c["n"] == cls["n"])
    old_by_id = {str(t["id"]): t for tree in old["trees"] for t in tree["talents"]}
    talents = {str(t["id"]): t for tree in cls["trees"] for t in tree["talents"]}
    by_name = {t["n"]: t for t in talents.values()}
    tree_by_id = {str(t["id"]): tree for tree in cls["trees"] for t in tree["talents"]}
    entry = next(c for c in class_catalog["classes"] if c["name"] == cls["n"])
    class_metadata = next(c for c in metadata if c["n"] == cls["n"])
    abilities = {a["n"]: a for a in class_metadata["abilities"]}
    for trained in entry["trainedAbilities"]:
        ability = abilities.get(trained["name"])
        if ability and ability.get("src") == "trainer":
            trained["levels"] = sorted({r["lv"] for r in ability["ranks"] if r.get("lv")})
    for summary in entry["trees"]:
        tree = next(t for t in cls["trees"] if t["n"] == summary["name"])
        old_tree = next(t for t in old["trees"] if t["n"] == summary["name"])
        old_names = {t["n"] for t in old_tree["talents"]}
        current_names = {t["n"] for t in tree["talents"]}
        new_names = {t["name"] for t in summary["new"]} | (current_names - old_names)
        summary["new"] = [{"name": t["n"], "description": t["d"][0], "icon": f"data/spells/icons/{t['ic']}.webp"}
                          for t in tree["talents"] if t["n"] in new_names]
        summary["changed"] = [n for n in summary["changed"] if n in current_names and n not in new_names]
        summary["removed"] = sorted((set(summary["removed"]) | (old_names - current_names)) - current_names)
    entry["talentChanges"] = {kind: sum(len(t[kind]) for t in entry["trees"]) for kind in ["new", "changed", "removed"]}

    build_path = f"public/data/classes/guides/{cls['n'].lower()}-builds.json"
    builds = read(build_path)
    for spec_name, spec in builds["specs"].items():
        for build in spec["builds"]:
            before = build["points"].copy()
            target = {}
            for tid, qty in before.items():
                old_name = old_by_id.get(tid, {}).get("n")
                talent = talents.get(tid) if build.get("allocationSnapshot") in ["wowhead-2026-11-02", snapshot] else by_name.get(renames.get(old_name, old_name)) if old_name else talents.get(tid)
                if talent: target[str(talent["id"])] = min(qty, len(talent["ranks"]))
            points = {}
            budget = min(build["level"] - 9, 51)
            def available(talent):
                tid = str(talent["id"])
                if points.get(tid, 0) >= len(talent["ranks"]): return False
                tree = tree_by_id[tid]
                lower = sum(points.get(str(t["id"]), 0) for t in tree["talents"] if t["row"] < talent["row"])
                return lower >= talent["row"] * 5 and all(points.get(str(req), 0) >= rank + 1 for req, rank in talent["pre"])
            # Retain the requested talents whenever they remain legal. Fill only the
            # missing points in the build's own specialization, never into removed IDs.
            main_tree = next(t for t in cls["trees"] if t["n"] == spec_name)
            while sum(points.values()) < budget:
                preferred = [t for tid, qty in target.items() for t in [talents[tid]] if points.get(tid, 0) < qty and available(t)]
                if preferred:
                    chosen = min(preferred, key=lambda t: (t["row"], t["col"]))
                else:
                    choices = [t for t in main_tree["talents"] if available(t)]
                    if not choices: break
                    chosen = min(choices, key=lambda t: (t["row"], t["col"]))
                tid = str(chosen["id"])
                points[tid] = points.get(tid, 0) + 1
            assert sum(points.values()) == budget, build["id"]
            build["points"] = points
            build["why"] = {tid: talents[tid]["d"][qty - 1] for tid, qty in points.items()}
            build["allocationSnapshot"] = snapshot
            if before != points:
                changed_builds.append(build["id"])
                highlights = sorted((talents[tid] for tid in points), key=lambda t: (t["row"], t["col"]), reverse=True)[:3]
                build["summary"] = " ".join(t["d"][points[str(t["id"])] - 1] for t in highlights)
                build["allocationSnapshot"] = snapshot
    write(build_path, builds)

    writeup_path = f"public/data/spells/writeups/{cls['n'].lower()}.json"
    writeups = read(writeup_path)
    for tid, talent in talents.items():
        previous = old_by_id.get(tid)
        if not previous or any(previous.get(field) != talent.get(field) for field in ["n", "d", "row", "col", "pre", "ranks"]):
            writeups["talents"][tid] = {"summary": talent["d"][0], "details": list(dict.fromkeys(talent["d"])), "specs": [tree_by_id[tid]["n"]]}
    writeups["talents"] = {tid: data for tid, data in writeups["talents"].items() if tid in talents}
    write(writeup_path, writeups)

    changes_path = "public/data/classes/guides/changes.json"
    changes = read(changes_path)
    class_ids = {"Warrior": "1", "Paladin": "2", "Hunter": "3", "Rogue": "4", "Priest": "5", "Shaman": "7", "Mage": "8", "Warlock": "9", "Druid": "11"}
    delta = changes[class_ids[cls["n"]]]
    for value in delta.get("talentsAdded", []):
        current_talent = by_name.get(renames.get(value.get("n"), value.get("n")))
        if current_talent:
            value["n"] = current_talent["n"]
            value["d"] = current_talent["d"][0]
    write(changes_path, changes)

write("public/data/classes/catalog.json", class_catalog)
print("Updated source summaries and", len(changed_builds), "recommended allocations")
