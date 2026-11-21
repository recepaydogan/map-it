"""Build Classic recipe-to-trainer references from pinned CMaNGOS SQL dumps.

Usage: python scripts/build-classic-recipe-trainers.py CLASSIC_DB.sql.gz SPELL.sql
The inputs are research artifacts, not part of the application checkout.
"""

import csv
import gzip
import json
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DETAILS = ROOT / "public/data/professions/details"
OUTPUT = ROOT / "public/data/professions/classic-recipe-trainers.json"
CLASSIC_DB_COMMIT = "ec4f596146be6467ea93c57397858e329e2db852"
SPELL_DB_COMMIT = "8ec338a1704e7dcb1c0213eb7ed58f9231ade40f"


def read_table(path: Path, name: str) -> list[dict[str, str]]:
    opener = gzip.open if path.suffix == ".gz" else open
    with opener(path, "rt", errors="replace") as stream:
        lines = stream.readlines()
    marker = f"CREATE TABLE `{name}`"
    start = next(i for i, line in enumerate(lines) if line.startswith(marker))
    columns = []
    for line in lines[start + 1:]:
        if line.startswith(") ENGINE="):
            break
        match = re.match(r"\s*`([^`]+)`", line)
        if match:
            columns.append(match.group(1))

    rows = []
    prefix = f"INSERT INTO `{name}` VALUES "
    for line in lines:
        if not line.startswith(prefix):
            continue
        for part in line[len(prefix):].rstrip(";\n").split("),("):
            cells = next(csv.reader([part.removeprefix("(").removesuffix(")")],
                                    delimiter=",", quotechar="'", escapechar="\\"))
            if len(cells) != len(columns):
                raise ValueError(f"Could not parse {name} row: {len(cells)} fields, expected {len(columns)}")
            rows.append(dict(zip(columns, cells)))
    return rows


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("Usage: build-classic-recipe-trainers.py CLASSIC_DB.sql.gz SPELL.sql")
    classic_path, spell_path = map(Path, sys.argv[1:])
    spells = read_table(spell_path, "spell_template")
    teachers_by_recipe: dict[str, set[str]] = {}
    for spell in spells:
        for slot in (1, 2, 3):
            if spell[f"Effect{slot}"] == "36":  # SPELL_EFFECT_LEARN_SPELL
                teachers_by_recipe.setdefault(spell[f"EffectTriggerSpell{slot}"], set()).add(spell["Id"])

    creatures = {row["Entry"]: row for row in read_table(classic_path, "creature_template")}
    template_npcs: dict[str, set[str]] = {}
    for creature in creatures.values():
        if creature["TrainerTemplateId"] != "0":
            template_npcs.setdefault(creature["TrainerTemplateId"], set()).add(creature["Entry"])
    npcs_by_spell: dict[str, set[str]] = {}
    for row in read_table(classic_path, "npc_trainer"):
        npcs_by_spell.setdefault(row["spell"], set()).add(row["entry"])
    for row in read_table(classic_path, "npc_trainer_template"):
        npcs_by_spell.setdefault(row["spell"], set()).update(template_npcs.get(row["entry"], set()))

    professions: dict[str, dict[str, list[int]]] = {}
    referenced_npcs: set[str] = set()
    for file in sorted(DETAILS.glob("*.json")):
        details = json.loads(file.read_text(encoding="utf-8"))
        recipes = {}
        for recipe in details["recipes"]:
            if not recipe.get("src", {}).get("trainer", {}).get("classic"):
                continue
            teachers = teachers_by_recipe.get(str(recipe["s"]), set())
            npc_ids = set().union(*(npcs_by_spell.get(spell, set()) for spell in teachers)) if teachers else set()
            if not npc_ids:
                raise ValueError(f"No Classic trainers for {file.stem}: {recipe['n']} ({recipe['s']})")
            npc_ids = {npc for npc in npc_ids if npc in creatures}
            recipes[str(recipe["s"])] = sorted(map(int, npc_ids))
            referenced_npcs.update(npc_ids)
        if recipes:
            professions[file.stem] = recipes

    output = {
        "version": 1,
        "source": {
            "classicDb": f"https://github.com/cmangos/classic-db/tree/{CLASSIC_DB_COMMIT}",
            "spells": f"https://github.com/cmangos/mangos-classic/tree/{SPELL_DB_COMMIT}",
        },
        "npcs": {npc: creatures[npc]["Name"] for npc in sorted(referenced_npcs, key=int)},
        "professions": professions,
    }
    OUTPUT.write_text(json.dumps(output, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Wrote {sum(map(len, professions.values()))} recipes and {len(referenced_npcs)} NPC names to {OUTPUT}")


if __name__ == "__main__":
    main()
