"""Apply reviewed November 5–6 hotfixes and retain a precise publication diff."""
import json
import hashlib
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AUDIT = ROOT / "data/site-research/hotfix-2026-11-07"
AUDIT.mkdir(parents=True, exist_ok=True)
changes = []
languages = dict(zip(
    ["de", "es", "es-MX", "fr", "ko", "pt-BR", "zh-Hans", "zh-Hant"],
    ["deDE", "esES", "esMX", "frFR", "koKR", "ptBR", "zhCN", "zhTW"]))


def read(path):
    return json.loads((ROOT / path).read_text(encoding="utf-8-sig"))


def baseline(path):
    saved = AUDIT / "before" / path
    return json.loads(saved.read_text(encoding="utf-8-sig")) if saved.exists() else read(path)


def save(path, data):
    target = ROOT / path
    old = read(path)
    if old == data:
        return
    before = AUDIT / "before" / path
    before.parent.mkdir(parents=True, exist_ok=True)
    if not before.exists():
        before.write_bytes(target.read_bytes())
    temporary = target.with_suffix(".hotfix.tmp")
    pretty = before.read_text(encoding="utf-8-sig").count("\n") > 4
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2 if pretty else None,
                                    separators=None if pretty else (",", ":")) + "\n", encoding="utf8")
    temporary.replace(target)
    changes.append(path)


def replace_text(value, replacements):
    if isinstance(value, str):
        for old, new in replacements.items():
            if value == old:
                return new
            if "consumed spell" in old:
                value = value.replace(old, new)
        return re.sub(r"(?: Activates Gore Drinker\.){2,}", " Activates Gore Drinker.", value)
    if isinstance(value, list):
        return [replace_text(entry, replacements) for entry in value]
    if isinstance(value, dict):
        return {key: replace_text(entry, replacements) for key, entry in value.items()}
    return value


spell_changes = {}
for spell_id, amount in [(6785, 42), (6787, 62), (9866, 78), (9867, 98)]:
    old = baseline(f"public/data/spells/foreverdb/{spell_id % 64}.json")[str(spell_id)]["d"]
    spell_changes[spell_id] = (old, re.sub(r"plus \d+", f"plus {amount}", old))
spell_changes[18562] = (
    baseline("public/data/spells/foreverdb/2.json")["18562"]["d"],
    "Instantly heals a target with an active Rejuvenation or Regrowth effect for an amount equal to the full duration of the periodic effect of one of those spells.")
spell_changes[1329555] = (
    baseline("public/data/spells/foreverdb/19.json")["1329555"]["d"],
    "Your next 4 melee attacks generate 5 additional Rage. Lasts 8 sec. Activates Gore Drinker.")
sear = "Casting spells that deal damage sears the target for 7 Fire damage."
spell_changes[1291568] = (baseline("public/data/spells/foreverdb/48.json")["1291568"]["d"], sear)
replacements = {old: new for old, new in spell_changes.values() if old != new}
replacements["Harmful spell casts sear the target for 7 Fire damage."] = sear

# Update every English consumer of the exact reviewed prose, including talents,
# class summaries, linked effects and write-ups, without touching Classic text.
for folder in ["public/data/classes", "public/data/spells", "public/data/items"]:
    for file in (ROOT / folder).rglob("*.json"):
        if "locales" in file.parts:
            continue
        path = file.relative_to(ROOT).as_posix()
        data = read(path)
        updated = replace_text(data, replacements)
        if updated != data:
            save(path, updated)

path = "public/data/professions/details/leatherworking.json"
data = read(path)
recipe = next(row for row in data["recipes"] if row["s"] == 1263031)
recipe.update(req=125, y=125, g=130)
save(path, data)
for file in (ROOT / "public/data/items/research/crafting").glob("*.json"):
    path = file.relative_to(ROOT).as_posix()
    data = read(path)
    for entry in data.values():
        for row in entry.get("made", []):
            if row[1] == 1263031:
                row[2] = 125
        for row in entry.get("used", []):
            if row[1] == 1263031:
                row[2] = 125
    save(path, data)
path = "public/data/items/foreverdb-enrichment.json"
data = read(path)
data["entries"]["2678"]["clientDetails"]["sellPriceCopper"] = 1
save(path, data)

# Retain the obsolete record for direct references, using the existing retired UI.
path = "public/data/spells/foreverdb/25.json"
data = read(path)
data["1310041"]["retired"] = True
save(path, data)

path = "public/data/quests/quest-details.json"
data = read(path)
objective = "Take the Abominable Head to Master Apothecary Faranell in Undercity."
first_quest = {"id": "97288", "title": "Unending Torment", "level": 21,
               "minimumLevel": 15, "faction": "Horde", "objective": objective,
               "startsAt": "Abominable Head", "endsAt": "Master Apothecary Faranell"}
data["quests"]["97288"] = {**data["quests"].get("97288", {}), **first_quest}
old_sleeper = data["quests"]["5321"]["description"]
new_sleeper = old_sleeper.replace(" You'll find it in the chest here.", "")
data["quests"]["5321"]["description"] = new_sleeper
save(path, data)
path = "public/data/dungeons/observed-quests.json"
data = read(path)
if not any(row["id"] == "97288" for row in data["quests"]):
    data["quests"].append({**first_quest, "dungeonId": "mapgenie-instance-949838"})
next(row for row in data["quests"] if row["id"] == "97288")["turnIn"] = {"id": "2055", "name": "Master Apothecary Faranell"}
save(path, data)
path = "public/data/quests/requirements.json"
data = read(path)
for quest_id, chain in [("92422", ["356", "99156"]), ("95216", ["447", "450", "451"])]:
    catalog = read("public/data/quests/quest-details.json")["quests"]
    entry = data["quests"].setdefault(quest_id, {"title": catalog[quest_id]["title"]})
    entry["prerequisiteQuests"] = [{"id": key, "name": catalog[key]["title"]} for key in chain]
data["quests"].setdefault("5321", {"title": "The Sleeper Has Awakened"})["providedItems"] = [
    {"id": "13536", "name": "Horn of Awakening", "quantity": 1}]
save(path, data)
path = "public/data/items/research/sources/32.json"
data = read(path)
data["13536"] = [{"t": "quest", "q": 5321, "n": "The Sleeper Has Awakened",
                  "lv": 20, "src": "forever", "provided": True}]
save(path, data)

sear_locales = {
 "de": "Das Wirken von Zaubern, die Schaden verursachen, versengt das Ziel und fügt ihm 7 Feuerschaden zu.",
 "es": "Lanzar hechizos que infligen daño abrasa al objetivo y le inflige 7 p. de daño de Fuego.",
 "es-MX": "Lanzar hechizos que infligen daño quema al objetivo y le inflige 7 p. de daño de Fuego.",
 "fr": "Lancer des sorts qui infligent des dégâts brûle la cible et lui inflige 7 points de dégâts de Feu.",
 "ko": "피해를 주는 주문을 시전하면 대상을 그을려 7의 화염 피해를 입힙니다.",
 "pt-BR": "Lançar feitiços que causam dano queima o alvo, causando 7 de dano de Fogo.",
 "zh-Hans": "施放造成伤害的法术会灼烧目标，造成7点火焰伤害。",
 "zh-Hant": "施放造成傷害的法術會灼燒目標，造成7點火焰傷害。"}
activate = {"de": "Aktiviert {name}.", "es": "Activa {name}.", "es-MX": "Activa {name}.",
            "fr": "Déclenche {name}.", "ko": "{name} 효과를 발동시킵니다.", "pt-BR": "Ativa {name}.",
            "zh-Hans": "触发{name}。", "zh-Hant": "觸發{name}。"}
labels = {
 "en": ["Required quest chain", "Provided when accepting the quest"],
 "de": ["Erforderliche Questreihe", "Bei Annahme der Quest erhalten"],
 "es": ["Cadena de misiones requerida", "Se proporciona al aceptar la misión"],
 "es-MX": ["Cadena de misiones requerida", "Se proporciona al aceptar la misión"],
 "fr": ["Suite de quêtes requise", "Fourni à l’acceptation de la quête"],
 "ko": ["선행 연계 퀘스트", "퀘스트 수락 시 지급"],
 "pt-BR": ["Sequência de missões necessária", "Fornecido ao aceitar a missão"],
 "zh-Hans": ["前置任务链", "接受任务时提供"], "zh-Hant": ["前置任務鏈", "接受任務時提供"]}
quest_objectives = {
 "de": "Bringt den abscheulichen Kopf zu Meisterapotheker Faranell in Unterstadt.",
 "es": "Lleva la cabeza abominable al maestro boticario Faranell en Entrañas.",
 "es-MX": "Lleva la cabeza abominable al maestro boticario Faranell en Entrañas.",
 "fr": "Apportez la tête abominable au maître apothicaire Faranell à Fossoyeuse.",
 "ko": "언더시티에 있는 수석 연금술사 파라넬에게 흉측한 머리를 가져가야 합니다.",
 "pt-BR": "Leve a Cabeça Abominável ao Mestre Boticário Faranell na Cidade Baixa.",
 "zh-Hans": "将憎恶的头颅交给幽暗城的大药剂师法拉尼尔。",
 "zh-Hant": "將憎惡的頭顱交給幽暗城的大藥劑師法拉尼爾。"}
chest_sentences = {
 "de": " Ihr findet es in der Truhe hier.", "es": " Lo encontrarás en este cofre.",
 "es-MX": " Lo encontrarás en este cofre.", "fr": ", qui est dans ce coffre",
 "ko": " 여기 궤짝 안에 있소.", "pt-BR": " Ela está ali no baú.",
 "zh-Hans": "号角就在这里的箱子里。", "zh-Hant": "號角就在這個箱子裡。"}

writeup_source_path = "public/data/spells/writeups/locales/source.json"
writeup_source = read(writeup_source_path)
quest_source_path = "public/data/locales/wow-forever/quest-text-source.json"
quest_source = read(quest_source_path)
new_quest_key = "97288:objective"
if new_quest_key not in quest_source["keys"]:
    quest_source["keys"].append(new_quest_key)
    quest_source["values"].append(objective)

for lang, locale in languages.items():
    path = f"public/data/locales/wow-forever/spell-tooltip-{locale}.json"
    tooltips = read(path)
    talent_path = f"public/data/classes/locales/talents-{lang}.json"
    talents = read(talent_path)
    translated = {}
    for spell_id, (old, new) in spell_changes.items():
        entry = tooltips["entries"].setdefault(str(spell_id), {})
        if spell_id in [6785, 6787, 9866, 9867]:
            old_amount = re.search(r"plus (\d+)", old)[1]
            new_amount = re.search(r"plus (\d+)", new)[1]
            entry["d"] = re.sub(rf"(?<!\d){old_amount}(?!\d)", new_amount, entry["d"])
        elif spell_id == 1329555:
            name = talents["entries"]["113569"]["name"]["text"]
            suffix = activate[lang].format(name=name)
            if suffix not in entry["d"]:
                entry["d"] += " " + suffix
        elif spell_id == 1291568:
            entry["d"] = sear_locales[lang]
        # The existing localized Swiftmend spell already has the corrected text.
        translated[new] = entry["d"]
    save(path, tooltips)
    path = f"public/data/classes/guides/locales/{lang}/druid.json"
    guide = read(path)
    name_source = read("public/data/locales/wow-forever/source.json")
    name_values = read(f"public/data/locales/wow-forever/{locale}.json")
    swift_old, swift_new = spell_changes[18562]
    for edit in guide["edits"]:
        if swift_old not in edit["source"]:
            continue
        edit["sources"] = [edit["source"].replace(swift_old, swift_new)]
        swift_text = translated[swift_new]
        for ability in [774, 8936]:
            name = name_values["values"][name_source["keys"].index(f"SpellName:{ability}:0")]
            swift_text = swift_text.replace(name, f"[[spell:{ability}|{name}]]")
        if edit["path"][-1] == "104912":
            edit["text"] = swift_text
        elif lang in ["de", "es", "es-MX", "fr"]:
            pattern = {"de": r"Heilt ein Ziel.*?entspricht\.",
                       "es": r"Cura al instante.*?consumido\.",
                       "es-MX": r"Cura instantáneamente.*?consumido\.",
                       "fr": r"Soigne instantanément.*?consommé\."}[lang]
            edit["text"] = re.sub(pattern, lambda _: swift_text, edit["text"])
    save(path, guide)
    for talent_id, spell_id in [("104912", 18562), ("-1329555", 1329555)]:
        text = spell_changes[spell_id][1]
        original = baseline(talent_path)["entries"][talent_id]["ranks"]["0"]["source"]
        talents["entries"][talent_id]["ranks"]["0"] = {"source": original, "sources": [text], "text": translated[text]}
    save(talent_path, talents)
    path = f"public/data/classes/locales/{lang}.json"
    data = read(path)
    data["translations"].update(translated)
    save(path, data)
    path = f"public/data/locales/wow-forever/item-effects-{locale}.json"
    data = read(path)
    data["translations"][sear] = sear_locales[lang]
    save(path, data)
    path = f"public/data/spells/writeups/locales/{lang}.json"
    data = read(path)
    for text, translation in translated.items():
        if text not in writeup_source["strings"]:
            writeup_source["strings"].append(text)
        index = writeup_source["strings"].index(text)
        while len(data["values"]) <= index:
            data["values"].append("")
        data["values"][index] = translation
    save(path, data)
    path = f"public/data/locales/wow-forever/quest-prose-wowhead-{locale}.json"
    data = read(path)
    quest = data["quests"]["5321"]
    quest["english"]["description"] = new_sleeper
    quest["locales"][locale]["description"] = quest["locales"][locale]["description"].replace(chest_sentences[lang], "")
    save(path, data)
    path = f"public/data/locales/wow-forever/quest-text-{locale}.json"
    data = read(path)
    index = quest_source["keys"].index(new_quest_key)
    while len(data["values"]) <= index:
        data["values"].append("")
    data["values"][index] = quest_objectives[lang]
    save(path, data)
    path = f"public/data/locales/wow-forever/quest-offer-{locale}.json"
    data = read(path)
    data["quests"]["97288"] = {"english": "Unending Torment", "name": data["quests"]["97289"]["name"]}
    save(path, data)
save(writeup_source_path, writeup_source)
quest_source["provenance"]["catalogSha256"] = hashlib.sha256((ROOT / "public/data/quests/quest-details.json").read_bytes()).hexdigest()
save(quest_source_path, quest_source)
for lang, values in labels.items():
    path = f"src/i18n/locales/{lang}.json"
    data = read(path)
    data["map"]["foreverQuest"].update(requiredQuestChain=values[0], providedOnAccept=values[1])
    save(path, data)

# The before snapshots make it possible to publish only these semantic edits over
# the live release, even when a selected file had unrelated local modifications.
receipt = {"version": 1, "paths": sorted(file.relative_to(AUDIT / "before").as_posix() for file in (AUDIT / "before").rglob("*.json")), "date": "2026-11-07",
           "sources": ["https://www.wowhead.com/forever/blue-tracker/news/us/wow-forever-hotfixes-november-6-2026-world-of-warcraft-blizzard-news-24315281",
                       "https://www.wowhead.com/forever/news/new-prerequisites-required-for-ruins-of-lordaeron-dungeon-quests-in-wow-forever-383769"],
           "excluded": ["Bear Form scaling", "Boot Knife conflicting tooltip", "unverified loot rates"],
           "correction": "Unending Torment starts at quest 97288, not 97289."}
(AUDIT / "changes.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf8")
print(json.dumps({"changedFiles": len(receipt["paths"])}))
