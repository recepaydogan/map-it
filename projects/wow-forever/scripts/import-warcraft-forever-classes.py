"""Publish a structured snapshot of the nine Warcraft Forever class pages."""

import argparse
import json
import re
import shutil
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from bs4 import BeautifulSoup


ORIGIN = "https://warcraftforever.games"
SLUGS = ("warrior", "paladin", "hunter", "rogue", "priest", "shaman", "mage", "warlock", "druid")
RESEARCH = Path("data/site-research/warcraft-forever-classes")
ICONS = Path("public/data/classes/icons")
OUTPUT = Path("public/data/classes/catalog.json")


def value(element):
    return re.sub(r"\s+", " ", element.get_text(" ", strip=True)).strip() if element else ""


def number(text):
    match = re.search(r"\d+", text)
    return int(match.group()) if match else 0


def section(soup, heading):
    for candidate in soup.select("section"):
        h2 = candidate.find("h2")
        if h2 and value(h2).startswith(heading):
            return candidate
    return None


def icon_name(image):
    if not image:
        return None
    url = image.get("src", "")
    if "skyborne.jpg" in url:
        return "skyborne.jpg"
    if "/icons/" not in url:
        return None
    basename = urlparse(url).path.rsplit("/", 1)[-1]
    return basename if re.fullmatch(r"[a-zA-Z0-9_-]+\.jpg", basename) else None


def icon_path(image):
    basename = icon_name(image)
    return f"data/classes/icons/{basename}" if basename else None


def split_names(text):
    return [part.strip() for part in text.split("·") if part.strip()]


def parse_races(soup):
    result = {"alliance": [], "horde": []}
    container = section(soup, "Who can be a")
    assert container, "Missing race section"
    for faction in container.select("div.grid > div"):
        heading = value(faction.find("h3")).lower()
        assert heading in result, f"Unexpected faction: {heading}"
        for li in faction.select("ul > li"):
            link = li.find("a", href=re.compile(r"^/names\?"))
            assert link, "Race entry without a name"
            slug = parse_qs(urlparse(link["href"]).query).get("race", [""])[0]
            result[heading].append({
                "id": slug,
                "name": value(link),
                "newCombination": any(value(span) == "New" for span in li.find_all("span")),
                **({"icon": icon_path(li.find("img"))} if icon_path(li.find("img")) else {}),
            })
    return result


def parse_trees(soup):
    container = section(soup, "Talent trees")
    assert container, "Missing talent trees"
    trees = []
    for article in container.select("article"):
        name = value(article.find("h3"))
        groups = {"new": [], "changed": [], "removed": []}
        for heading in article.find_all("h4"):
            parent = heading.parent
            label = value(heading)
            if label == "New talents":
                talents = []
                for li in parent.select("ul > li"):
                    title = value(li.find("b"))
                    description = value(li.find("span"))
                    description = description.removeprefix(title).lstrip(" —")
                    talents.append({
                        "name": title,
                        "description": description,
                        **({"icon": icon_path(li.find("img"))} if icon_path(li.find("img")) else {}),
                    })
                groups["new"] = talents
            elif label == "Changed":
                groups["changed"] = split_names(value(parent.find("p")))
            elif label == "Removed from Classic":
                groups["removed"] = split_names(value(parent.find("p")))
        assert name, "Talent tree without a name"
        counts = [number(value(li)) for li in article.select("div.border-b ul > li")]
        assert counts == [len(groups["new"]), len(groups["changed"]), len(groups["removed"])], (name, counts)
        trees.append({
            "name": name,
            **({"icon": icon_path(article.find("img"))} if icon_path(article.find("img")) else {}),
            **groups,
        })
    assert len(trees) == 3, f"Expected three talent trees, got {len(trees)}"
    return trees


def parse_abilities(soup):
    container = section(soup, "New and reworked abilities")
    assert container, "Missing ability section"
    new = []
    for li in container.select(":scope > ul > li"):
        title = value(li.find("b"))
        info = li.find("div")
        paragraphs = info.find_all("p", recursive=False) if info else []
        level = next((number(value(span)) for span in li.find_all("span") if value(span).startswith("Level ")), None)
        assert title, "Ability without a name"
        new.append({
            "name": title,
            **({"level": level} if level is not None else {}),
            "passive": any(value(span) == "Passive" for span in li.find_all("span")),
            "specialization": value(paragraphs[0]) if paragraphs else "",
            "description": value(paragraphs[1]) if len(paragraphs) > 1 else "",
            **({"icon": icon_path(li.find("img"))} if icon_path(li.find("img")) else {}),
        })
    reworked_heading = next((h for h in container.find_all("h3") if value(h).startswith("Reworked")), None)
    reworked = split_names(value(reworked_heading.find_next_sibling("p"))) if reworked_heading else []
    assert not reworked_heading or len(reworked) == number(value(reworked_heading)), "Reworked ability count mismatch"
    return {"new": new, "reworked": reworked}


def parse_trained(soup):
    container = section(soup, "Trained abilities")
    if not container:
        return []
    trained = []
    for row in container.select("table tbody tr"):
        cells = row.find_all("td", recursive=False)
        assert len(cells) == 3, "Malformed trained ability row"
        name = value(cells[0].find("b"))
        ranks = cells[1].find("span", class_="flex")
        levels = [int(value(span)) for span in ranks.find_all("span", recursive=False)] if ranks else []
        copper = 0
        for image in cells[2].find_all("img"):
            denomination = image.get("alt", "")
            amount = number(value(image.parent))
            copper += amount * {"g": 10000, "s": 100, "c": 1}.get(denomination, 0)
        assert name and levels, f"Incomplete trained ability: {name}"
        trained.append({
            "name": name,
            "levels": levels,
            "allRanksCopper": copper,
            **({"icon": icon_path(cells[0].find("img"))} if icon_path(cells[0].find("img")) else {}),
        })
    return trained


def parse_related(soup):
    container = next((candidate for candidate in soup.select("section") if
                      candidate.find("h2") and value(candidate.find("h2")).endswith("in the database")), None)
    assert container, "Missing database context"
    cards = container.select("div.grid > div")
    assert len(cards) == 3, "Unexpected database context layout"
    sets = []
    for li in cards[0].select("ul > li"):
        link = li.find("a", href=re.compile(r"^/items/sets\?set="))
        assert link
        meta = value(li.find("span"))
        numbers = [int(part) for part in re.findall(r"\d+", meta)]
        sets.append({"id": parse_qs(urlparse(link["href"]).query)["set"][0], "name": value(link),
                     "new": "new" in meta.lower(), "pieces": numbers[0] if numbers else 0,
                     "level": numbers[1] if len(numbers) > 1 else 0})
    items = []
    for li in cards[1].select("ul > li"):
        link = li.find("a", href=re.compile(r"^/items/\d+$"))
        assert link
        meta = value(li.select_one("span.shrink-0"))
        items.append({"id": link["href"].rsplit("/", 1)[-1], "name": value(link),
                      "slot": meta.rsplit("·", 1)[0].strip() if "·" in meta else meta,
                      "level": number(meta.rsplit("·", 1)[-1]),
                      **({"icon": icon_path(link.find("img"))} if icon_path(link.find("img")) else {})})
    trainers = []
    for li in cards[2].select("ul > li"):
        link = li.find("a", href=re.compile(r"^/npcs/\d+$"))
        assert link
        trainers.append({"id": link["href"].rsplit("/", 1)[-1], "name": value(link),
                         "location": value(li.select_one("span.shrink-0"))})
    counts = [number(value(card.find("h3"))) for card in cards]
    assert len(sets) <= counts[0] and len(items) <= counts[1] and len(trainers) <= counts[2], counts
    return {"sets": {"count": counts[0], "preview": sets},
            "exclusiveItems": {"count": counts[1], "preview": items},
            "trainers": {"count": counts[2], "preview": trainers}}


def parse_class(slug, html):
    soup = BeautifulSoup(html, "html.parser")
    header = soup.find("h1").parent.parent
    name = slug.capitalize()
    assert value(soup.find("h1")) == f"{name} in WoW: Forever"
    trees = parse_trees(soup)
    totals = {key: sum(len(tree[key]) for tree in trees) for key in ("new", "changed", "removed")}
    header_counts = [int(part) for part in re.findall(r"\d+", value(header.find_all("p")[-1]))]
    assert header_counts[:3] == [totals["new"], totals["changed"], totals["removed"]], (slug, header_counts, totals)
    return {"id": slug, "name": name,
            **({"icon": icon_path(header.find("img"))} if icon_path(header.find("img")) else {}),
            "races": parse_races(soup), "trees": trees, "talentChanges": totals,
            "abilities": parse_abilities(soup), "trainedAbilities": parse_trained(soup),
            "related": parse_related(soup)}


def fetch_html(slug):
    request = urllib.request.Request(f"{ORIGIN}/classes/{slug}", headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read().decode("utf8")


def download_icons(classes, check_only=False):
    names = set()
    for entry in classes:
        for node in [entry, *entry["races"]["alliance"], *entry["races"]["horde"], *entry["trees"],
                     *(talent for tree in entry["trees"] for talent in tree["new"]),
                     *entry["abilities"]["new"], *entry["trainedAbilities"], *entry["related"]["exclusiveItems"]["preview"]]:
            if node.get("icon"):
                names.add(Path(node["icon"]).name)
    ICONS.mkdir(parents=True, exist_ok=True)
    item_icons = Path("public/data/items/site-icons")

    def download_one(name):
        path = ICONS / name
        if path.exists() and path.stat().st_size > 100:
            return None
        if check_only:
            return name
        if (item_icons / name).exists():
            shutil.copyfile(item_icons / name, path)
            return None
        sources = (f"{ORIGIN}/blizzard/recap/skyborne.jpg",) if name == "skyborne.jpg" else (
            f"https://wowforever-media.fly.storage.tigris.dev/icons/medium/{name}",
            f"https://wow.zamimg.com/images/wow/icons/medium/{name}")
        for url in sources:
            try:
                request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
                with urllib.request.urlopen(request, timeout=8) as response:
                    data = response.read()
                if len(data) > 100:
                    path.write_bytes(data)
                    return None
            except Exception:
                time.sleep(0.02)
        return name

    with ThreadPoolExecutor(max_workers=8) as pool:
        failed = [name for name in pool.map(download_one, sorted(names)) if name]
    return failed


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--fetch", action="store_true", help="Refresh the nine class HTML snapshots")
    parser.add_argument("--reuse-icons", action="store_true", help="Use downloaded icons without retrying unavailable ones")
    args = parser.parse_args()
    RESEARCH.mkdir(parents=True, exist_ok=True)
    classes = []
    for slug in SLUGS:
        path = RESEARCH / f"{slug}.html"
        if args.fetch:
            path.write_text(fetch_html(slug), encoding="utf8")
        classes.append(parse_class(slug, path.read_text(encoding="utf8")))
    failed = download_icons(classes, args.reuse_icons)
    if failed:
        print(f"Unavailable class icons: {', '.join(failed)}", file=sys.stderr)
        missing = set(failed)
        def omit_missing(value):
            if isinstance(value, dict):
                if value.get("icon") and Path(value["icon"]).name in missing:
                    del value["icon"]
                for child in value.values():
                    omit_missing(child)
            elif isinstance(value, list):
                for child in value:
                    omit_missing(child)
        omit_missing(classes)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps({"version": 1, "source": f"{ORIGIN}/classes", "sourceBuild": "1.60.1.69893",
                                  "classes": classes}, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf8")
    print(f"Published {len(classes)} classes, {sum(len(c['trainedAbilities']) for c in classes)} trained abilities, "
          f"{sum(len(c['abilities']['new']) for c in classes)} new abilities, {len(failed)} unavailable icons.")


if __name__ == "__main__":
    main()
