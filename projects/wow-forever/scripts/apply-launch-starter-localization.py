"""Apply only changed English blocks, retaining all unchanged localized guide HTML."""
import hashlib
import json
from collections import Counter
from pathlib import Path
from bs4 import BeautifulSoup

DIR = Path("data/site-research/wowhead-check-2026-11-04/localization")
read = lambda p: json.loads(Path(p).read_text(encoding="utf-8"))
iv = read(DIR / "inventory.json")
translations = {e["text"]: e["translations"] for e in iv["entries"]}
plans = read(DIR / "starter-guide-delta.json")
scope = read(DIR / "locale-scope.json")
by_path = {f["path"]: f for f in scope["files"]}
for language in iv["languages"]:
    for cls, plan in plans.items():
        file = Path(f"public/data/guides/locales/{language}/leveling-{cls}.json")
        backup = DIR / "before" / file
        data = read(backup if backup.exists() else file)
        old = [str(x) for x in BeautifulSoup(data["html"], "html.parser").children if getattr(x, "name", None)]
        if len(old) != len(plan["oldBlocks"]): raise ValueError(f"Guide shape changed: {file}")
        output = []
        for kind, a, b, x, y in plan["operations"]:
            if kind == "equal": output.extend(old[a:b]); continue
            if kind == "delete": continue
            for index in range(x, y):
                nested = plan.get("nestedLists", {}).get(str(index))
                if nested:
                    node = BeautifulSoup(old[nested["oldIndex"]], "html.parser").find()
                    children = node.find_all("li", recursive=False)
                    assert len(children) == len(nested["oldItems"])
                    localized = dict(zip(nested["oldItems"], map(str, children)))
                    items = []
                    for item in nested["newItems"]:
                        if item in localized: items.append(localized[item]); continue
                        previous_name = item.replace(">Totemic Call</a>", ">Totemic Recall</a>")
                        if previous_name in localized:
                            fragment = BeautifulSoup(localized[previous_name], "html.parser")
                            for link in fragment.select('[data-guide-link="spell:36936"]'):
                                link.string = iv["terms"][language]["Totemic Call"]
                            items.append(str(fragment)); continue
                        items.append(translations[item][language])
                    output.append("<ul>" + "".join(items) + "</ul>")
                else: output.append(translations[plan["newBlocks"][index]][language])
        data["html"] = "".join(output)
        content = json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n"
        if not backup.exists(): backup.parent.mkdir(parents=True, exist_ok=True); backup.write_bytes(file.read_bytes())
        file.write_text(content, encoding="utf-8", newline="\n")
        name = file.as_posix().removeprefix("public/")
        by_path[name] = {"path": name, "localPath": file.as_posix(), "sha256": hashlib.sha256(file.read_bytes()).hexdigest()}
scope["files"] = list(by_path.values())
(DIR / "locale-scope.json").write_text(json.dumps(scope, indent=2) + "\n", encoding="utf-8")
print("Updated 24 starter guides; scoped locale files:", len(scope["files"]))
