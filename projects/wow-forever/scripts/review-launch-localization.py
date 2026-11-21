"""Apply explicit terminology reviews and preserve unchanged translated guide list items."""
import copy
import hashlib
import html
import json
import re
from pathlib import Path
from bs4 import BeautifulSoup

DIR = Path("data/site-research/wowhead-check-2026-11-04/localization")
read = lambda p: json.loads(Path(p).read_text(encoding="utf-8"))
write = lambda p, d: Path(p).write_text(json.dumps(d, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
inventory = read(DIR / "inventory.json")
entries = {e["text"]: e for e in inventory["entries"]}
languages = inventory["languages"]
changes = []

def add(text, kind, translations=None):
    e = entries.setdefault(text, {"key": hashlib.sha256(text.encode()).hexdigest()[:20], "text": text, "kinds": [kind], "classes": [], "translations": {}, "origins": {}})
    if translations:
        for language, value in translations.items():
            e["translations"][language] = value
            e["origins"][language] = "explicit-context-review"
    return e

def revise_text(old, new, old_number, new_number):
    if old == new:
        return
    translations = {}
    for language in languages:
        value = entries.get(old, {}).get("translations", {}).get(language)
        if value:
            assert len(re.findall(rf"(?<!\d){old_number}(?!\d)", value)) == 1, (language, old[:70])
            translations[language] = re.sub(rf"(?<!\d){old_number}(?!\d)", new_number, value)
    add(new, "class-guide", translations)

for file in ["public/data/classes/guides/class-guides.json", "public/data/classes/guides/warrior-play.json", "public/data/guides/leveling-warrior.json"]:
    data = read(file)
    def visit(node):
        if isinstance(node, dict):
            for k, value in node.items():
                if isinstance(value, str):
                    updated = value.replace("raises all your threat by 30%", "raises all your threat by 80%").replace("30% more threat", "80% more threat").replace("(18 sec base)", "(15 sec base)").replace("Defensive Stance's tooltip now states the threat bonus, 30%", "Defensive Stance's tooltip now states the threat bonus, 80%")
                    if updated != value:
                        if k != "html": revise_text(value, updated, "18" if "(18 sec base)" in value else "30", "15" if "(18 sec base)" in value else "80")
                        node[k] = updated
                else: visit(value)
        elif isinstance(node, list):
            for value in node: visit(value)
    original = copy.deepcopy(data); visit(data)
    if data != original:
        changes.append(file); write(file, data)

# For unchanged prose that only gained a threat correction, retain each existing
# localized sentence and replace its single, verified old number.
for language in languages:
    p = read(f"public/data/classes/guides/locales/{language}/warrior.json")
    for e in p["edits"]:
        old = e["source"]
        new = old.replace("raises all your threat by 30%", "raises all your threat by 80%").replace("30% more threat", "80% more threat").replace("(18 sec base)", "(15 sec base)")
        if new == old: continue
        a, b = ("18", "15") if "(18 sec base)" in old else ("30", "80")
        assert len(re.findall(rf"(?<!\d){a}(?!\d)", e["text"])) == 1
        add(new, "class-guide")["translations"][language] = re.sub(rf"(?<!\d){a}(?!\d)", b, e["text"])
        entries[new]["origins"][language] = "existing-translation-reviewed-numeric-update"

delta = read(DIR / "guide-delta.json")
source = read("public/data/classes/guides/class-guides.json")["classes"]
for cls, record in delta.items():
    record["data"]["guide"] = source[cls.title()]
    record["data"]["play"] = read(f"public/data/classes/guides/{cls}-play.json")
    for e in record["changed"]:
        value = record["data"]
        for key in e["path"]: value = value[int(key)] if isinstance(value, list) else value[key]
        e["source"] = value
write(DIR / "guide-delta.json", delta)

plans = read(DIR / "starter-guide-delta.json")
for cls, plan in plans.items():
    current = read(f"public/data/guides/leveling-{cls}.json")["html"]
    plan["newBlocks"] = [str(x) for x in BeautifulSoup(current, "html.parser").children if getattr(x, "name", None)]
    plan["nestedLists"] = {}
    for kind, a, b, x, y in plan["operations"]:
        if kind != "replace" or b-a != 1 or y-x != 1: continue
        old, new = BeautifulSoup(plan["oldBlocks"][a], "html.parser").find(), BeautifulSoup(plan["newBlocks"][x], "html.parser").find()
        if old.name != "ul" or new.name != "ul": continue
        old_items, new_items = [str(t) for t in old.find_all("li", recursive=False)], [str(t) for t in new.find_all("li", recursive=False)]
        plan["nestedLists"][str(x)] = {"oldIndex": a, "oldItems": old_items, "newItems": new_items}
        entries.pop(str(new), None)
        # Also discard the earlier whole-list text before the threat correction.
        for text in list(entries):
            if "guide-html" in entries[text]["kinds"] and text.startswith("<ul>") and text.startswith(str(old)[:40]): entries.pop(text)
        for item in new_items:
            if item not in old_items: add(item, "guide-html")
write(DIR / "starter-guide-delta.json", plans)

# Review digit/word differences explicitly, rather than weakening numeric checks.
reviews = []
for r in read(DIR / "prose-review-needed.json"):
    if r["english"] not in entries: continue
    language = r["language"]
    terms = sorted([(a,b) for a,b in inventory["terms"][language].items() if len(a)>=4 and b and b!=a], key=lambda x:-len(x[0]))
    pattern = re.compile(r"(?<![A-Za-z])(?:" + "|".join(re.escape(a) for a,b in terms) + r")(?![A-Za-z])|\{\{[^{}]+\}\}")
    tokens = [dict(terms).get(m.group(),m.group()) for part in re.split(r"(<[^>]+>)",r["english"]) if not part.startswith("<") for m in pattern.finditer(html.unescape(part))]
    raw = r["raw"]
    seen = [int(v) for v in re.findall(r'<g id="(\d+)">',raw)]
    missing = [t for t in set(tokens) if t not in [tokens[i] for i in seen if i<len(tokens)] and t not in raw]
    if missing: continue
    text = re.sub(r'<g id="(\d+)">[\s\S]*?</g>', lambda m: tokens[int(m[1])], raw)
    text = html.unescape(re.sub(r"^\s*<text>|</text>\s*$", "", text)).strip()
    if r["error"] == "Lost protected token":
        reason = "The exact native name remains as plain localized text."
    else:
        reason = "Reviewed explicit singular per-point/per-second wording, written Chinese tier numbers, or written English five. No mechanical value changed."
    add(r["english"], "review", {language: text})
    reviews.append({"key":r["key"],"language":language,"reason":reason})

# Avoid English plural group labels and machine-added alternatives to a protected
# game name; these are prose corrections, not official spell-name replacements.
group_names = {"de":"Rufe","es":"gritos","es-MX":"gritos","fr":"cris","ko":"외침","pt-BR":"gritos","zh-Hans":"战吼","zh-Hant":"戰吼"}
for e in entries.values():
    for language, text in e["translations"].items():
        if e["origins"].get(language, "").startswith("Blizzard"): continue
        text = re.sub(r"\bShouts\b", group_names[language], text)
        if language == "de": text = text.replace("im Stealth-Modus", "in Verstohlenheit")
        if language == "ko": text = re.sub(r"\bRage\b", "분노", text).replace("꿰뚫는 울부짖음(날카로운 고함)", "날카로운 고함")
        e["translations"][language] = text

inventory["entries"] = list(entries.values()); write(DIR / "inventory.json", inventory)
write(DIR / "explicit-reviews.json", reviews)
write(DIR / "english-guide-corrections.json", {"paths":changes})
print("Reviewed segments:",len(reviews),"remaining:",{l:sum(not e["translations"].get(l) for e in entries.values()) for l in languages})
