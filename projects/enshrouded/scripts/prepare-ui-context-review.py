"""Prepare contextual UI repairs; keep native names opaque during translation."""
import importlib.util
import hashlib
from pathlib import Path
import re
import tempfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("builder", ROOT / "scripts/build-content-locales.py")
b = importlib.util.module_from_spec(spec)
spec.loader.exec_module(b)
t = b.translator

CORE = {
    "de": ("Namen eingeben", "Anbau", "Ausrüstungsteile des Sets", "Ausrüstungsteil des Sets", "Verwandte Ausrüstungssets"),
    "fr": ("Saisir un nom", "Culture", "Objets de l’ensemble", "Objet de l’ensemble", "Ensembles associés"),
    "it": ("Inserisci un nome", "Coltivazione", "Oggetti del set", "Oggetto del set", "Set correlati"),
    "es": ("Introduce un nombre", "Cultivo", "Objetos del conjunto", "Objeto del conjunto", "Conjuntos relacionados"),
    "ru": ("Введите название", "Выращивание", "Предметы комплекта", "Предмет комплекта", "Связанные комплекты"),
    "pl": ("Wpisz nazwę", "Uprawa", "Przedmioty zestawu", "Przedmiot zestawu", "Powiązane zestawy"),
    "ja": ("名前を入力", "栽培", "装備セットのアイテム", "装備セットのアイテム", "関連する装備セット"),
    "ko": ("이름 입력", "재배", "장비 세트 아이템", "장비 세트 아이템", "관련 장비 세트"),
    "pt-BR": ("Digite um nome", "Cultivo", "Itens do conjunto", "Item do conjunto", "Conjuntos relacionados"),
    "th": ("ป้อนชื่อ", "การเพาะปลูก", "ไอเทมในชุดอุปกรณ์", "ไอเทมในชุดอุปกรณ์", "ชุดอุปกรณ์ที่เกี่ยวข้อง"),
    "tr": ("Bir ad girin", "Yetiştirme", "Set eşyaları", "Set eşyası", "İlgili setler"),
    "zh-Hans": ("输入名称", "种植", "套装物品", "套装物品", "相关套装"),
    "zh-Hant": ("輸入名稱", "種植", "套裝物品", "套裝物品", "相關套裝"),
    "uk": ("Введіть назву", "Вирощування", "Предмети комплекту", "Предмет комплекту", "Пов’язані комплекти"),
}
CORE_KEYS = ("map.details.markerNamePlaceholder", "map.enshrouded.acquisition.farm", "progressionGuide.setItems",
             "progressionGuide.setItem", "progressionGuide.relatedSets")
CONTEXT = {"map.details.markerNamePlaceholder": "Enter a name",
           "map.enshrouded.locationGuide.facts.shrineSparks": "Interact with the Flame to collect Sparks. They replenish over time, and the amount depends on the biome.",
           "map.enshrouded.locationGuide.facts.fossilCollection": "Fossils come in different sizes and can be displayed in fossil display cases. There are sixteen different fossils to collect.",
           "map.enshrouded.shroudLair.uniqueWeaponNotice": "These weapons are associated with this dungeon type in general. Finding a particular one at this entrance is not guaranteed.",
           "craftingGuide.manual": "Handcrafting",
           "progressionGuide.setItems": "Equipment set items", "progressionGuide.setItem": "Equipment set item",
           "progressionGuide.relatedSets": "Related equipment sets"}
ALLOWED = {"Discord", "Overwolf", "Enshrouded", "Wiki", "wiki", "Vukah", "FPS", "NPC", "NPCs", "XP", "Ctrl", "Shift",
           "Alt", "Enter", "Esc", "Keen", "Games", "Windows", "WASD", "ID", "Twitch", "Boss", "boss", "Drak", "Embervale", "URL"}


def main():
    official = b.read(b.PACKS / "source.json")
    indexes = {}
    for i, value in enumerate(official["values"]):
        indexes.setdefault(b.normalize(value), []).append(i)
    by_tag = {tag: i for i, tag in enumerate(official["keys"])}
    english = dict(t.flatten(b.read(t.LOCALES / "en.json")))
    glossary = b.read(b.RESEARCH / "content-translation-source.json")["glossaryTerms"]
    draft = {}
    for code, game_code in b.LANGUAGES.items():
        if code == "en":
            continue
        target = dict(t.flatten(b.read(t.LOCALES / f"{code.lower()}.json")))
        pack = b.read(b.PACKS / (game_code.replace("_", "-").lower() + ".json"))["values"]
        names = {}
        for word in glossary:
            candidates = indexes.get(b.normalize(word), [])
            values = {b.plain(pack[i]) for i in candidates if pack[i]}
            if len(values) == 1:
                names[word] = next(iter(values))
        for word, tag in {**b.TAG_OVERRIDES, "Spark": "2259947478", "Vukah": "388130378", "Drak": "3175261909"}.items():
            names[word] = b.plain(pack[by_tag[tag]])
        for key, word in english.items():
            if key.startswith("map.enshrouded.groups."):
                names[word] = target[key]
                if not word.endswith("s"):
                    names[word + "s"] = target[key]
        names["Sparks"] = names["Spark"]
        pattern = re.compile(r"(?<![A-Za-z0-9_])(?:" + "|".join(re.escape(v) for v in sorted(names, key=len, reverse=True)) + r")(?![A-Za-z0-9_])")
        updates = dict(zip(CORE_KEYS, CORE[code]))
        for faction in ("Vukah", "Drak"):
            for suffix in ("Enemies", "Bosses"):
                key = f"map.enshrouded.bestiary.groups.{faction.lower()}{suffix}"
                if key in target:
                    updates[key] = names[faction] + " · " + target[key].split(" · ")[-1]
        pending, templates = [], {}
        for key, value in target.items():
            if key in updates or key not in english or not re.match(r"ru|uk|ja|ko|th|zh-", code):
                continue
            outside = re.sub(r"\{\{.*?\}\}|https?://\S+|\w+@\w+\.\w+", "", value)
            remaining = [word for word in re.findall(r"[A-Za-z]+", outside) if len(word) > 2 and word not in ALLOWED]
            if not remaining:
                continue
            source = CONTEXT.get(key, t.CONTEXT.get(key, english[key]))
            substitutions = {}
            def mask(match):
                token = "{{EMREVIEW_" + str(len(substitutions)) + "}}"
                substitutions[token] = names[match[0]]
                return token
            # Names inside source interpolation variables are not display text.
            parts = re.split(r"(\{\{.*?\}\})", source)
            source = "".join(part if i % 2 else pattern.sub(mask, part) for i, part in enumerate(parts))
            templates[key] = (source, substitutions)
            pending.append((key, source))
        cache_path = Path(tempfile.gettempdir()) / "enshrouded-localization-cache/ui-context-review" / f"{code.lower()}.json"
        cache = b.read(cache_path) if cache_path.is_file() else {}
        requests = [(key, source) for key, source in pending if cache.get(key, {}).get("source") != source]
        for start in range(0, len(requests), 10):
            entries = [("review:" + key, source) for key, source in requests[start:start + 10]]
            translated = t.translate_chunk(code, entries)
            for key, value in translated.items():
                key = key.removeprefix("review:")
                cache[key] = {"source": templates[key][0], "translation": value}
            b.atomic_json(cache_path, cache)
        for key, (source, replacements) in templates.items():
            value = cache[key]["translation"]
            for token, label in replacements.items():
                value = value.replace(token, label)
            if t.placeholders(value) != t.placeholders(english[key]):
                raise ValueError(f"Changed UI interpolation: {code}:{key}")
            updates[key] = value
        draft[code] = updates
        print(f"{code}: {len(updates)} contextual UI reviews prepared", flush=True)
    b.atomic_json(b.RESEARCH / "ui-context-review-draft.json", draft)


if __name__ == "__main__":
    main()
