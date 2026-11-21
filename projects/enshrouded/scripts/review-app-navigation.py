"""Apply reviewed game-companion navigation wording and item-noun context."""
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
LABELS = {
    "de": ("Gegenstände", "Herstellung", "Herstellungsanleitung", "Sets"),
    "fr": ("Objets", "Fabrication", "Guide de fabrication", "Ensembles"),
    "it": ("Oggetti", "Creazione", "Guida alla creazione", "Set"),
    "es": ("Objetos", "Fabricación", "Guía de fabricación", "Conjuntos"),
    "ru": ("Предметы", "Крафт", "Руководство по крафту", "Комплекты"),
    "pl": ("Przedmioty", "Rzemiosło", "Poradnik rzemiosła", "Zestawy"),
    "ja": ("アイテム", "クラフト", "クラフトガイド", "装備セット"),
    "ko": ("아이템", "제작", "제작 가이드", "장비 세트"),
    "pt-br": ("Itens", "Fabricação", "Guia de fabricação", "Conjuntos"),
    "th": ("ไอเทม", "การคราฟต์", "คู่มือการคราฟต์", "ชุดอุปกรณ์"),
    "tr": ("Eşyalar", "Üretim", "Üretim Rehberi", "Setler"),
    "zh-hans": ("物品", "制作", "制作指南", "套装"),
    "zh-hant": ("物品", "製作", "製作指南", "套裝"),
    "uk": ("Предмети", "Крафт", "Посібник із крафту", "Комплекти"),
}
REPLACEMENTS = {
    "fr": {"Articles": "Objets", "articles": "objets", "article": "objet", "Article": "Objet"},
    "it": {"Articoli": "Oggetti", "articoli": "oggetti", "Articolo": "Oggetto", "articolo": "oggetto"},
    "es": {"Artículos": "Objetos", "artículos": "objetos", "Artículo": "Objeto", "artículo": "objeto"},
    "ko": {"품목": "아이템"}, "zh-hans": {"项目": "物品"},
    "zh-hant": {"專案": "物品", "項目": "物品"},
}


def flatten(value, prefix=""):
    for key, child in value.items():
        path = f"{prefix}.{key}" if prefix else key
        if isinstance(child, str):
            yield path, child
        elif isinstance(child, dict):
            yield from flatten(child, path)


def put(data, key, value):
    parts = key.split(".")
    for part in parts[:-1]:
        data = data.setdefault(part, {})
    data[parts[-1]] = value


def main():
    english = dict(flatten(json.loads((ROOT / "src/i18n/locales/en.json").read_text(encoding="utf-8"))))
    for code, (items, craft, title, sets) in LABELS.items():
        path = ROOT / f"src/i18n/locales/{code}.json"
        data = json.loads(path.read_text(encoding="utf-8"))
        reviews = ROOT / f"scripts/localization-overrides/{code}.json"
        overrides = json.loads(reviews.read_text(encoding="utf-8"))
        updates = {}
        for key, value in flatten(data.get("itemsGuide", {}), "itemsGuide"):
            updated = value
            for before, after in REPLACEMENTS.get(code, {}).items():
                updated = updated.replace(before, after)
            if updated != value:
                updates[key] = updated
        updates.update({"itemsGuide.nav": items, "itemsGuide.title": items,
                        "craftingGuide.nav": craft, "craftingGuide.title": title,
                        "progressionGuide.catalogs.sets": sets,
                        "wikiGuide.nav": {"ja": "ウィキ", "ko": "위키", "ru": "Вики", "uk": "Вікі", "th": "วิกิ",
                                          "zh-hans": "百科", "zh-hant": "百科"}.get(code, "Wiki")})
        if code == "de":
            updates.update({"itemsGuide.search": "Alle Gegenstände durchsuchen", "itemsGuide.clearSearch": "Gegenstandssuche löschen",
                            "itemsGuide.categories": "Gegenstandskategorien", "itemsGuide.groupFilter": "Gegenstandsgruppe",
                            "itemsGuide.noResults": "Keine passenden Gegenstände.", "itemsGuide.collapseSidebar": "Gegenstandsliste einklappen",
                            "itemsGuide.expandSidebar": "Gegenstandsliste ausklappen"})
            for family in ("subtitle", "results"):
                for suffix in ("", "_one", "_other"):
                    updates[f"itemsGuide.{family}{suffix}"] = "{{count}} " + ("Gegenstand" if suffix == "_one" else "Gegenstände")
        if code == "th":
            updates.update({"itemsGuide.search": "ค้นหาไอเทมทั้งหมด", "itemsGuide.clearSearch": "ล้างการค้นหาไอเทม",
                            "itemsGuide.categories": "หมวดหมู่ไอเทม", "itemsGuide.groupFilter": "กลุ่มไอเทม",
                            "itemsGuide.noResults": "ไม่พบไอเทมที่ตรงกัน", "itemsGuide.collapseSidebar": "ย่อรายการไอเทม",
                            "itemsGuide.expandSidebar": "ขยายรายการไอเทม"})
            for family in ("subtitle", "results"):
                for suffix in ("", "_one", "_other"):
                    updates[f"itemsGuide.{family}{suffix}"] = "{{count}} ไอเทม"
        for key, value in updates.items():
            source = english.get(key, english.get(re.sub(r"_(?:one|few|many)$", "_other", key)))
            if source is None or sorted(re.findall(r"\{\{.*?\}\}", value)) != sorted(re.findall(r"\{\{.*?\}\}", source)):
                raise ValueError(f"Changed reviewed interpolation: {code}:{key}")
            put(data, key, value)
            overrides[key] = value
        for output, content in ((path, data), (reviews, overrides)):
            output.write_text(json.dumps(content, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("Applied reviewed item, crafting and equipment-set navigation in all target locales.")


if __name__ == "__main__":
    main()
