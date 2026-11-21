"""Align changed starter-guide blocks with existing translated markup."""
import difflib
import hashlib
import json
import subprocess
from pathlib import Path
from bs4 import BeautifulSoup

DIRECTORY = Path("data/site-research/wowhead-check-2026-11-04/localization")
read = lambda p: json.loads(Path(p).read_text(encoding="utf-8"))
inventory = read(DIRECTORY / "inventory.json")
entries = {e["text"]: e for e in inventory["entries"]}
plans = {}
for cls in ["rogue", "shaman", "warrior"]:
    source = f"public/data/guides/leveling-{cls}.json"
    old = json.loads(subprocess.check_output(["git", "show", f"HEAD:{source}"], text=True, encoding="utf-8"))
    new = read(source)
    blocks = lambda html: [str(x) for x in BeautifulSoup(html, "html.parser").children if getattr(x, "name", None)]
    a, b = blocks(old["html"]), blocks(new["html"])
    operations = list(difflib.SequenceMatcher(a=a, b=b, autojunk=False).get_opcodes())
    for language in inventory["languages"]:
        local = read(f"public/data/guides/locales/{language}/leveling-{cls}.json")
        c = blocks(local["html"])
        tags = lambda items: [BeautifulSoup(x, "html.parser").find().name for x in items]
        if tags(a) != tags(c):
            raise ValueError(f"Cannot safely align starter guide: {language}/{cls}")
    for kind, i, j, x, y in operations:
        if kind == "equal":
            continue
        for text in b[x:y]:
            entries.setdefault(text, {"key": hashlib.sha256(text.encode()).hexdigest()[:20], "text": text,
                "kinds": ["guide-html"], "classes": [cls.title()], "translations": {}, "origins": {}})
    plans[cls] = {"oldBlocks": a, "newBlocks": b, "operations": operations}
inventory["entries"] = list(entries.values())
(DIRECTORY / "inventory.json").write_text(json.dumps(inventory, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
(DIRECTORY / "starter-guide-delta.json").write_text(json.dumps(plans, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("Added changed starter-guide blocks:", len(entries) - 1983)
