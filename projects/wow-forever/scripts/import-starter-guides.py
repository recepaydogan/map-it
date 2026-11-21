"""Import public starter articles as safe, locally navigable guide data."""

from __future__ import annotations

import html
import json
import re
import urllib.request
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import parse_qs, urlparse


ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "public" / "data" / "guides"
GUIDES = [
    ("getting-started", "start"),
    ("leveling", "leveling"),
    *((f"leveling-{name}", "class") for name in (
        "warrior", "paladin", "hunter", "rogue", "priest", "shaman", "mage", "warlock", "druid"
    )),
    ("professions", "profession"),
    ("first-dungeon", "dungeon"),
    ("making-money", "economy"),
]


def normalized_name(value):
    return re.sub(r"[^a-z0-9]", "", re.sub(r"^the\s+", "", value.lower()))


REFERENCE_INDEX = json.loads((ROOT / "public" / "data" / "reference" / "index.json").read_text(encoding="utf-8"))
DUNGEONS = {
    normalized_name(entry["name"]): entry["id"]
    for entry in REFERENCE_INDEX["entries"]
    if entry["category"] == "dungeons" and entry.get("adventure", {}).get("listed")
}
DUNGEONS.update({
    normalized_name("Stormwind Stockade"): DUNGEONS.get(normalized_name("The Stockade"), ""),
    normalized_name("Excavation Site: Wetlands"): DUNGEONS.get(normalized_name("Excavation Site"), ""),
})

ALLOWED = {
    "p", "h2", "h3", "h4", "ul", "ol", "li", "b", "strong", "em", "i", "small",
    "table", "thead", "tbody", "tr", "th", "td", "blockquote", "cite", "code", "br",
    "div", "span", "sup", "sub", "hr", "a",
}
VOID = {"br", "hr", "img", "input", "meta", "link"}


class GuideHTML(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.root = {"tag": "root", "attrs": {}, "children": []}
        self.stack = []
        self.done = False

    def handle_starttag(self, tag, attrs):
        if self.done:
            return
        attributes = dict(attrs)
        if not self.stack:
            if tag == "div" and "ssr" in attributes.get("class", "").split():
                self.stack = [self.root]
            return
        node = {"tag": tag, "attrs": attributes, "children": []}
        self.stack[-1]["children"].append(node)
        if tag not in VOID:
            self.stack.append(node)

    def handle_endtag(self, tag):
        if not self.stack:
            return
        if len(self.stack) == 1 and tag == "div":
            self.stack = []
            self.done = True
            return
        for index in range(len(self.stack) - 1, 0, -1):
            if self.stack[index]["tag"] == tag:
                self.stack = self.stack[:index]
                return

    def handle_data(self, data):
        if self.stack:
            self.stack[-1]["children"].append(data)


def text_of(node):
    if isinstance(node, str):
        return node
    return "".join(text_of(child) for child in node["children"])


def clean_text(value):
    value = re.sub(r"ForeverDB", "WoW Forever Map", value, flags=re.I)
    return value.replace("our planner gives each class", "the client data supports for each class")


def remove_product_claims(markup):
    markup = re.sub(
        r"<li><b>Explore the (?:site|app):</b>.*?</li>",
        '<li><b>Explore the app:</b> <a href="/guides">Guides</a>, <a href="/classes">Classes</a>, '
        '<a href="/dungeons">Dungeons</a>, <a href="/items">Items</a> and <a href="/spells">Spells</a>; '
        'open Map for locations.</li>',
        markup,
        flags=re.S | re.I,
    )
    def rewrite_paragraph(match):
        paragraph = match.group(0)
        plain = re.sub(r"<[^>]+>", "", paragraph)
        if "WoW Forever Map addon records" in plain:
            return "<p>Dungeon quest givers and rewards marked as Classic data still need confirmation in the Forever beta.</p>"
        if "raid and dungeon planner" in plain:
            return "<p>Review each dungeon's boss details in the Dungeons tab before your group enters.</p>"
        if "our news page" in plain:
            return "<p>Beta dates and features can change; check Blizzard's official announcements for the latest schedule.</p>"
        if "gear planner" in plain or "PvE page has a gear list" in plain or "dungeon guide lists the best items" in plain:
            for marker in ("Right now", "Some highlights", "A few examples", "At 20"):
                position = paragraph.find(marker)
                if position >= 0:
                    return "<p>Gear examples from the beta data: " + paragraph[position:-4] + "</p>"
            return "<p>Use the Items tab to inspect the stats and sources of the gear mentioned in this guide.</p>"
        if "our Druid outlook" in plain or "our Mage outlook" in plain or "our Warlock outlook" in plain or "our Shaman outlook" in plain or "our Priest outlook" in plain or "our Rogue outlook" in plain:
            return "<p>Open this class's Abilities tab for changes and the Specs, builds &amp; PvP guide for further planning. Higher-level advice is a beta preview.</p>"
        if "use the planner to look at the bosses" in plain or "The planner shows what each boss" in plain:
            return paragraph.replace("use the planner to look at the bosses before you go", "review boss details in the Dungeons tab before you go").replace("The planner shows what each boss did in Classic, which Forever may have changed.", "Review boss details in the Dungeons tab; beta mechanics can change.")
        return paragraph.replace("Read more in our Deep Dive recap.", "")

    markup = re.sub(r"<p>.*?</p>", rewrite_paragraph, markup, flags=re.S)
    replacements = {
        "Our pet database lists every tameable beast.": "Check a beast's family and abilities before taming it.",
        "Our BlizzCon recap has the full picture.": "Blizzard's official BlizzCon recap has the full picture.",
        "Each class's PvE tab lists the best items at level 20, for example Warrior PvE, and the gear planner compares items.": "Open Items to inspect gear stats and sources as you level.",
        "Find your first pet in the pet database.": "Ask a Hunter trainer about taming your first pet.",
        "Explore the site: classes, maps, dungeons, items, spells, the Hunter pet database and the Companion addon.": "Explore the app's Guides, Classes, Map, Dungeons, Items and Spells tabs.",
        "and the Companion addon can show that rotation on screen.": "and the class Guide shows the full rotation.",
        "Report bugs to Blizzard in game, and if you use the Companion addon, the items, quests and beasts it saves help us confirm Forever's data. Upload your dungeon logs to Logs to see your pulls on the Replay page.": "Report beta bugs to Blizzard in game. Quest, item and dungeon details marked uncertain should be checked as the beta changes.",
        "the pet database shows what each family looks like and where Classic's data puts them.": "check the beast's family and location in game.",
        "The pet database also marks beasts that attack faster than usual, rare beasts, and the ones the game has confirmed in Forever.": "Some beasts are rare or attack faster than others; compare their skills before taming.",
        "The Forever game cache that WoW Forever Map has seen": "A Forever beta game cache reviewed for this guide",
        "see our write-up of the September 24 development notes.": "check Blizzard's September 24 development notes.",
        "Each class's Builds tab": "The class Guide's Specs, builds &amp; PvP tab",
        "builds page": "Specs, builds &amp; PvP tab",
        "<b>Explore the site:</b> classes, maps, dungeons, items, spells, the Hunter pet database and the Companion addon.": "<b>Explore the app:</b> Guides, Classes, Map, Dungeons, Items and Spells.",
        "Your class’s PvE tab (for example Mage PvE) lists the best item for each slot at level 20 and where to get it, and the gear planner helps you compare.": "Use the Items tab to inspect an upgrade's stats and sources before spending gold.",
    }
    for before, after in replacements.items():
        markup = markup.replace(before, after)
    # Imported articles refer to site features that this application does not have.
    # Keep the gameplay advice, while directing readers to real in-app sections.
    markup = markup.replace("Our BlizzCon recap has the full picture.", "Blizzard's BlizzCon recap has the full picture.")
    markup = markup.replace("Follow the changes on our news page, in where the beta stands and in the September 24 class changes.", "Check Blizzard's beta updates for later changes.")
    markup = markup.replace("our planner gives each class", "the beta client data supports for each class")
    markup = markup.replace("Our pet database lists every tameable beast.", "Hunters can tame many beasts with different family skills.")
    markup = markup.replace("Find your first pet in the pet database.", "Ask a Hunter trainer about taming your first pet.")
    markup = markup.replace("the pet database shows", "the game's beast family information shows")
    markup = markup.replace("The pet database also marks", "Some beast families include")
    markup = markup.replace("our talent calculator", "the Talents tab")
    markup = markup.replace("the talent calculator", "the Talents tab")
    markup = markup.replace("and a talent calculator", "and the Talents tab for exploring alternatives")
    markup = markup.replace("in the calculator", "in the Talents tab")
    markup = markup.replace("the gear planner", "the Items tab")
    markup = markup.replace("the gear page", "the Items tab")
    markup = markup.replace("The Deep Dive recap explains how they work.", "Check the campfire tooltip in game for the current buffs.")
    markup = markup.replace("More in our Deep Dive recap.", "")
    markup = markup.replace("check the news and the known issues", "check Blizzard's beta notes and known issues")
    markup = markup.replace("Each class page has a <b>Builds</b> tab", "Each class page has a <b>Specs, builds &amp; PvP</b> guide")
    markup = markup.replace("your class page's Builds tab", "your class Guide's Specs, builds &amp; PvP tab")
    markup = markup.replace("the Builds tab", "the Specs, builds &amp; PvP tab")
    markup = markup.replace("The Builds tabs", "The Specs, builds &amp; PvP guides")
    markup = markup.replace("the class Builds tab", "the class Guide's Specs, builds &amp; PvP tab")
    markup = markup.replace("the <b>Builds</b> tab", "the <b>Specs, builds &amp; PvP</b> tab")
    markup = markup.replace("a PvE guide: open classes, pick yours and look at Builds and PvE", "a PvE guide: open Classes and choose Specs, builds &amp; PvP")
    markup = re.sub(r"(?:the|your) ([A-Z][a-z]+) PvE page", r"the \1 Specs, builds &amp; PvP tab", markup)
    markup = markup.replace("Each class's PvE tab", "Each class's Specs, builds &amp; PvP tab")
    markup = markup.replace("Your class's PvE tab", "Your class's Specs, builds &amp; PvP tab")
    markup = markup.replace("The full list, including raids, is on the dungeons page.", "Browse the Dungeons tab for the full instance list.")
    markup = markup.replace("our Deep Dive recap", "Blizzard's development notes")
    markup = re.sub(r"Our pick for a first ([A-Za-z]+) is", r"For a first \1, consider", markup)
    markup = markup.replace("Our interactive maps", "The interactive maps")
    markup = markup.replace("Explore the site", "Explore the app")
    markup = markup.replace(
        "It doesn't say what they do. Go in expecting to learn: watch what each boss casts, and add what you see to the planner to work out a plan with your group.",
        "The Dungeons tab has boss abilities and tactics where the beta data supports them. Review those details with your group, and watch for changes during the fight.",
    )
    markup = re.sub(r"WoW Forever Map (?:has a published|publishes a) ", "The class Guide includes a ", markup)
    return markup


def route_for(href):
    parsed = urlparse(href)
    if parsed.netloc and parsed.netloc not in {"foreverdb.net", "www.foreverdb.net"}:
        return None
    path = parsed.path
    map_page = re.fullmatch(r"/maps/(\d+)", path, re.I)
    if map_page:
        pin = parse_qs(parsed.query).get("pin", [""])[0].split(",")
        if len(pin) >= 2 and all(re.fullmatch(r"\d+(?:\.\d+)?", value) for value in pin[:2]):
            return "map-pin", f"{map_page.group(1)}:{pin[0]}:{pin[1]}"
        if map_page.group(1) == "2521":
            return "map-view", "zephras-isle"
    class_section = re.fullmatch(r"/class/([^/]+)/(pve|pvp|builds|guide|abilities|talents|changes)", path, re.I)
    if class_section:
        name, section = class_section.groups()
        view = "changes" if section.lower() == "changes" else "specs" if section.lower() in {"pve", "pvp", "builds", "guide"} else section.lower()
        return "class", f"{name.lower()}:{view}"
    outlook = re.fullmatch(r"/article/outlook-([a-z]+)", path, re.I)
    if outlook:
        return "class", f"{outlook.group(1).lower()}:specs"
    if path == "/article/races-classes-and-racials":
        return "race", ""
    if path == "/article/meet-the-skyborne-zephras-isle":
        return "race", "skyborne"
    root_sections = {"/guides": "guide", "/classes": "class", "/races": "race", "/professions": "profession", "/dungeons": "dungeon", "/items": "item", "/spells": "spell"}
    if path in root_sections:
        return root_sections[path], ""
    for pattern, kind in (
        (r"/spell/(\d+)", "spell"),
        (r"/item/(\d+)", "item"),
        (r"/class/([^/]+)", "class"),
        (r"/race/([^/]+)", "race"),
        (r"/profession/([^/]+)", "profession"),
        (r"/dungeon/([^/]+)", "dungeon"),
        (r"/guide/([^/]+)", "guide"),
    ):
        match = re.fullmatch(pattern, path, re.I)
        if match:
            return kind, match.group(1).lower()
    return None


def slug(value):
    value = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return value or "section"


def render(node, headings, used):
    if isinstance(node, str):
        return html.escape(clean_text(node), quote=False)
    tag = node["tag"]
    if tag in {"nav", "script", "style", "h1"}:
        return ""
    children = "".join(render(child, headings, used) for child in node["children"])
    if tag not in ALLOWED:
        return children
    if tag == "a":
        target = route_for(node["attrs"].get("href", ""))
        if not target:
            return children
        kind, value = target
        if kind == "dungeon":
            value = DUNGEONS.get(normalized_name(text_of(node)), "")
            if not value:
                return children
        return f'<a href="#" data-guide-link="{kind}:{html.escape(value, quote=True)}">{children}</a>'
    if tag in {"h2", "h3"}:
        title = clean_text(text_of(node)).strip()
        identifier = slug(title)
        used[identifier] = used.get(identifier, 0) + 1
        if used[identifier] > 1:
            identifier += f"-{used[identifier]}"
        headings.append({"id": identifier, "title": title, "depth": 2 if tag == "h2" else 3})
        return f'<{tag} id="{identifier}">{children}</{tag}>'
    if tag in VOID:
        return f"<{tag}>"
    return f"<{tag}>{children}</{tag}>"


def load_guide(identifier, group):
    request = urllib.request.Request(
        f"https://foreverdb.net/guide/{identifier}",
        headers={"User-Agent": "Mozilla/5.0 WoW-Forever-Map-Guide-Importer"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        markup = response.read().decode("utf-8")
    parser = GuideHTML()
    parser.feed(markup)
    if not parser.done:
        raise ValueError(f"Guide body missing: {identifier}")
    children = parser.root["children"]
    title_node = next((node for node in children if isinstance(node, dict) and node["tag"] == "h1"), None)
    title = clean_text(text_of(title_node)).strip() if title_node else ""
    paragraphs = [node for node in children if isinstance(node, dict) and node["tag"] == "p"]
    intro = clean_text(text_of(paragraphs[0])).strip() if paragraphs else ""
    headings = []
    used = {}
    article_nodes = []
    skip_addon_section = False
    for node in children:
        if node is paragraphs[0]:
            continue
        if isinstance(node, dict) and node["tag"] == "h3" and "Companion addon" in text_of(node):
            skip_addon_section = True
        elif isinstance(node, dict) and node["tag"] == "h2":
            skip_addon_section = False
        if not skip_addon_section:
            article_nodes.append(node)
    output = remove_product_claims("".join(render(node, headings, used) for node in article_nodes))
    if not title or len(headings) < 3 or len(output) < 2000 or "foreverdb" in output.lower():
        raise ValueError(f"Guide validation failed: {identifier}")
    if identifier == "leveling" or identifier.startswith("leveling-"):
        if "to 30" not in title or "30" not in intro:
            raise ValueError(f"Outdated leveling guide: {identifier}")
    return {"id": identifier, "group": group, "title": title, "intro": intro, "headings": headings, "html": output}


def main():
    listing_request = urllib.request.Request(
        "https://foreverdb.net/guides", headers={"User-Agent": "Mozilla/5.0 WoW-Forever-Map-Guide-Importer"}
    )
    with urllib.request.urlopen(listing_request, timeout=30) as response:
        listing = response.read().decode("utf-8")
    published = set(re.findall(r'href=["\']/guide/([a-z0-9-]+)', listing))
    expected = {identifier for identifier, _ in GUIDES}
    if published != expected:
        raise ValueError(f"Guide listing changed; new={sorted(published - expected)}, removed={sorted(expected - published)}")
    OUTPUT.mkdir(parents=True, exist_ok=True)
    catalog = []
    for identifier, group in GUIDES:
        guide = load_guide(identifier, group)
        (OUTPUT / f"{identifier}.json").write_text(json.dumps(guide, ensure_ascii=False), encoding="utf-8")
        catalog.append({key: guide[key] for key in ("id", "group", "title", "intro", "headings")})
        print(f"{identifier}: {len(guide['headings'])} sections, {len(guide['html'])} characters")
    (OUTPUT / "index.json").write_text(json.dumps({"version": 1, "guides": catalog}, ensure_ascii=False), encoding="utf-8")
    print(f"Imported {len(catalog)} complete starter guides.")


if __name__ == "__main__":
    main()
