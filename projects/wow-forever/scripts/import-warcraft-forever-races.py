"""Publish playable races from the Warcraft Forever race pages."""

import argparse
import json
import re
import shutil
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urlparse

from bs4 import BeautifulSoup


ORIGIN = "https://warcraftforever.games"
RESEARCH = Path("data/site-research/warcraft-forever-races")
OUTPUT = Path("public/data/races/catalog.json")
ICONS = Path("public/data/races/icons")
ITEM_ICONS = Path("public/data/items/site-icons")
CLASS_ICONS = Path("public/data/classes/icons")
ABILITY_DESCRIPTIONS_WITH_MISSING_VALUES = {
    "Confounding Flash": "Confuses nearby enemies for 3 sec. Damage breaks the effect.",
    "Contingency Plan": "Wards an ally for 30 sec. If their health falls below 35%, the ward grants a shield and healing over 15 sec. Only one Contingency Plan can affect a target.",
}


def text(node):
    return re.sub(r"\s+", " ", node.get_text(" ", strip=True)).strip() if node else ""


def get_page(path):
    request = urllib.request.Request(f"{ORIGIN}{path}", headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read().decode("utf8")


def section(main, title):
    return next((candidate for candidate in main.find_all("section")
                 if candidate.find("h2") and text(candidate.find("h2")) == title), None)


def parse_index(html):
    main = BeautifulSoup(html, "html.parser").find("main")
    records = []
    for card in main.find_all("a", href=re.compile(r"^/races/[a-z]+$")):
        heading = card.find("h2")
        if not heading:
            continue
        name = text(heading)
        slug = card["href"].rsplit("/", 1)[-1]
        faction_label = text(heading.find_next_sibling("span"))
        assert faction_label in ("Alliance", "Horde", "Alliance or Horde"), (slug, faction_label)
        summary = text(card.find("p"))
        match = re.fullmatch(r"(\d+) classes · (\d+) racials", summary)
        assert match, (slug, summary)
        records.append({"id": slug, "name": name,
                        "faction": {"Alliance": "alliance", "Horde": "horde",
                                    "Alliance or Horde": "both"}[faction_label],
                        "classCount": int(match.group(1)), "racialCount": int(match.group(2)),
                        "newRace": "New race in Forever" in text(card)})
    assert len(records) == len({record["id"] for record in records}) == 9, "Expected nine unique races"
    return records


def parse_racial(li):
    role = text(li.find("span", class_=re.compile(r"\bw-12\b")))
    assert role in ("active", "passive", "gone"), role
    if role == "gone":
        name = text(li.find("span", class_=re.compile(r"\bline-through\b")))
        assert name
        return {"name": name, "kind": "removed"}, None
    content = li.find("span", class_=re.compile(r"\bmin-w-0\b"))
    name = text(content.find("span", class_="text-foreground"))
    effect = text(content.find("span", class_="text-muted")).removeprefix("—").strip()
    badge = content.find("span", title=re.compile(r"^spell \d+$"))
    full_effect = content.find("span", class_=re.compile(r"\bblock\b.*\btext-xs\b"))
    image = li.find("img", src=True)
    assert name and effect, (name, effect)
    icon_url = image["src"] if image else None
    icon_name = urlparse(icon_url).path.rsplit("/", 1)[-1] if icon_url else None
    assert not icon_name or re.fullmatch(r"[a-zA-Z0-9_-]+\.jpg", icon_name), icon_name
    racial = {"name": name, "kind": role, "effect": effect,
              "confirmed": bool(badge and text(badge) == "confirmed"),
              **({"spellId": int(badge["title"].split()[1])} if badge else {}),
              **({"fullEffect": text(full_effect)} if full_effect else {}),
              **({"icon": f"data/races/icons/{icon_name}"} if icon_name else {})}
    return racial, (icon_name, icon_url) if icon_name else None


def parse_exclusive_ability(li):
    name = text(li.find("span", class_=re.compile(r"\bfont-medium\b")))
    description = text(li.find("p"))
    heading = li.find("div", class_=re.compile(r"\bflex-wrap\b"))
    heading_text = text(heading)
    level = re.search(r"level (\d+)", heading_text)
    ranks = re.search(r"(\d+) ranks", heading_text)
    class_name = next((name for name in ("Priest", "Warrior", "Paladin", "Hunter", "Rogue",
                                         "Shaman", "Mage", "Warlock", "Druid")
                       if name in heading_text), None)
    image = li.find("img", src=True)
    icon_url = image["src"] if image else None
    icon_name = urlparse(icon_url).path.rsplit("/", 1)[-1] if icon_url else None
    assert name and description and class_name and level, (name, heading_text)
    assert not icon_name or re.fullmatch(r"[a-zA-Z0-9_-]+\.jpg", icon_name), icon_name
    missing_values = "$" in description
    if missing_values:
        assert name in ABILITY_DESCRIPTIONS_WITH_MISSING_VALUES, name
        description = ABILITY_DESCRIPTIONS_WITH_MISSING_VALUES[name]
    ability = {"name": name, "classId": class_name.lower(), "className": class_name,
               "level": int(level.group(1)),
               **({"ranks": int(ranks.group(1))} if ranks else {}),
               "new": "New" in heading_text.split(), "description": description,
               "valuesUnavailable": missing_values,
               **({"icon": f"data/races/icons/{icon_name}"} if icon_name else {})}
    return ability, (icon_name, icon_url) if icon_name else None


def parse_detail(record, html, classes, race_icons):
    main = BeautifulSoup(html, "html.parser").find("main")
    heading = main.find("h1")
    assert heading and text(heading) == record["name"], record["id"]
    header = heading.find_parent("header")
    description = text(header.find_all("p")[-1])
    class_section = section(main, f"{record['name']} classes")
    racial_section = section(main, "Racial abilities")
    assert class_section and racial_section, record["id"]
    playable = []
    for link in class_section.find_all("a", href=re.compile(r"^/classes/[a-z]+$")):
        slug = link["href"].rsplit("/", 1)[-1]
        class_entry = classes.get(slug)
        assert class_entry, (record["id"], slug)
        playable.append({"id": slug, "name": class_entry["name"],
                         "newCombination": text(link).endswith("New"),
                         **({"icon": class_entry["icon"]} if class_entry.get("icon") else {})})
    assert len(playable) == record["classCount"], record["id"]
    from_class_pages = {class_id for class_id, entry in classes.items()
                        if any(race["id"] == record["id"]
                               for faction in ("alliance", "horde") for race in entry["races"][faction])}
    assert from_class_pages == {entry["id"] for entry in playable}, record["id"]
    for playable_class in playable:
        class_entry = classes[playable_class["id"]]
        class_flag = any(race["id"] == record["id"] and race["newCombination"]
                         for faction in ("alliance", "horde") for race in class_entry["races"][faction])
        assert playable_class["newCombination"] == class_flag, (record["id"], playable_class["id"])

    racial_rows = [li for li in racial_section.find_all("li")
                   if "flex" in li.get("class", []) and "items-baseline" in li.get("class", [])]
    parsed = [parse_racial(li) for li in racial_rows]
    racials = [racial for racial, _ in parsed if racial["kind"] != "removed"]
    removed = [racial["name"] for racial, _ in parsed if racial["kind"] == "removed"]
    assert len(racials) == record["racialCount"], (record["id"], len(racials))

    exclusive_section = section(main, f"Class abilities only {record['name']} can learn")
    exclusive_parsed = [parse_exclusive_ability(li) for li in exclusive_section.select("ul.grid > li")] if exclusive_section else []
    exclusive_abilities = [ability for ability, _ in exclusive_parsed]

    places_section = section(main, f"{record['name']} in the database")
    regions = []
    if places_section:
        for title in places_section.find_all("h3"):
            link = title.find("a", href=True)
            if link:
                regions.append({"name": text(link), "sourcePath": link["href"]})

    faction_rules = {}
    for paragraph in class_section.find_all("p"):
        for class_name, faction in re.findall(r"([A-Za-z]+) is (Alliance|Horde)-only", text(paragraph)):
            class_id = class_name.lower()
            if class_id in {entry["id"] for entry in playable}:
                faction_rules[class_id] = faction.lower()
    faction_conflicts = []
    for class_id, faction in faction_rules.items():
        listed = [side for side in ("alliance", "horde")
                  if any(race["id"] == record["id"] for race in classes[class_id]["races"][side])]
        if listed != [faction]:
            faction_conflicts.append(class_id)

    icon = race_icons.get(record["id"])
    assert icon and (Path("public") / icon).exists(), (record["id"], icon)
    return ({**record, "description": description, "icon": icon,
             "classes": playable, "racials": racials, "removedRacials": removed,
             "exclusiveAbilities": exclusive_abilities,
             "regions": regions, "factionRules": faction_rules,
             "factionConflicts": faction_conflicts,
             "sourceUrl": f"{ORIGIN}/races/{record['id']}"},
            [icon_info for _, icon_info in parsed + exclusive_parsed if icon_info])


def download_icons(icons):
    ICONS.mkdir(parents=True, exist_ok=True)
    by_name = dict(icons)

    def download(pair):
        name, url = pair
        path = ICONS / name
        if path.exists() and path.stat().st_size > 100:
            return None
        for local in (ITEM_ICONS / name, CLASS_ICONS / name):
            if local.exists():
                shutil.copyfile(local, path)
                return None
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(request, timeout=20) as response:
                content = response.read()
            if len(content) > 100:
                path.write_bytes(content)
                return None
        except Exception:
            pass
        return name

    with ThreadPoolExecutor(max_workers=5) as pool:
        return [name for name in pool.map(download, sorted(by_name.items())) if name]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--fetch", action="store_true", help="Refresh race pages before rebuilding")
    args = parser.parse_args()
    RESEARCH.mkdir(parents=True, exist_ok=True)
    if args.fetch:
        (RESEARCH / "index.html").write_text(get_page("/races"), encoding="utf8")
    records = parse_index((RESEARCH / "index.html").read_text(encoding="utf8"))
    if args.fetch:
        with ThreadPoolExecutor(max_workers=4) as pool:
            pages = list(pool.map(lambda record: get_page(f"/races/{record['id']}"), records))
        for record, html in zip(records, pages):
            (RESEARCH / f"{record['id']}.html").write_text(html, encoding="utf8")
    classes_list = json.loads(Path("public/data/classes/catalog.json").read_text(encoding="utf8"))["classes"]
    classes = {entry["id"]: entry for entry in classes_list}
    race_icons = {race["id"]: race.get("icon") for entry in classes_list
                  for faction in ("alliance", "horde") for race in entry["races"][faction]}
    parsed = [parse_detail(record, (RESEARCH / f"{record['id']}.html").read_text(encoding="utf8"), classes, race_icons)
              for record in records]
    missing_icons = download_icons(icon_info for _, icons in parsed for icon_info in icons)
    races = [record for record, _ in parsed]
    for race in races:
        for entry in race["racials"] + race["exclusiveAbilities"]:
            if entry.get("icon") and Path(entry["icon"]).name in missing_icons:
                del entry["icon"]
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps({"version": 1, "source": f"{ORIGIN}/races",
                                  "sourceBuild": "1.60.1.69893", "races": races},
                                 ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf8")
    print(f"Published {len(races)} races, {sum(len(r['racials']) for r in races)} racials and "
          f"{sum(len(r['exclusiveAbilities']) for r in races)} class-locked abilities; "
          f"{len(missing_icons)} missing racial icons; "
          f"{sum(len(r['factionConflicts']) for r in races)} source faction conflicts.")


if __name__ == "__main__":
    main()
