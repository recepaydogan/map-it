"""Apply the reviewed UI context matrix and preserve interpolation variables."""
import importlib.util
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("builder", ROOT / "scripts/build-content-locales.py")
b = importlib.util.module_from_spec(spec)
spec.loader.exec_module(b)

MANUAL = {
    "zh-Hans": {"buildingGuide.nav": "建造", "buildingGuide.title": "建造指南", "buildingGuide.loading": "正在加载建造指南…",
                "buildingGuide.collapseSidebar": "收起建材列表", "buildingGuide.expandSidebar": "展开建材列表",
                "buildingGuide.groups.soil-and-dirt": "泥土与土壤", "craftingGuide.crafterAndWorkshops": "工匠与工作站",
                "craftingGuide.openBuilding": "打开建造指南", "progressionGuide.searchCraftedItems": "搜索可制作的物品"},
    "ko": {"map.enshrouded.bestiary.abilitySummaries.fellDragonYoungling": "타락자의 화염 운석, 화염 숨결, 공중 기총소사를 사용합니다. 날갯짓으로 플레이어를 밀쳐내며, 타락한 드라코니안 독수리를 소환할 수 있습니다.",
           "map.enshrouded.shroudLair.overview": "어둠의 장막 소굴은 어둠의 장막 속에 있는 던전으로, 타락자 생물이 서식합니다.",
           "map.enshrouded.shroudLair.uniqueWeaponNotice": "이 무기는 이 유형의 던전 전반에서 얻을 수 있는 보상입니다. 이 입구에서 특정 무기를 찾는다고 보장되지는 않습니다.",
           "map.enshrouded.locationGuide.facts.sanctumPuzzle": "야간 성소에는 함정과 퍼즐이 있습니다. 일부 성소에 들어가려면 불꽃이 필요합니다.",
           "map.enshrouded.locationGuide.facts.balefireQuest": "봉화 여덟 곳을 모두 밝히면 「오염된 짐승 제거하기」 퀘스트가 진행되고 울부짖는 봉우리의 야수가 모습을 드러냅니다.",
           "map.enshrouded.acquisition.archaicEssenceSummary": "{{region}}의 어둠의 장막 소굴이나 어둠의 장막 응시자 터널 안에서 노란색 혹을 채집하세요."},
    "th": {"map.enshrouded.bestiary.abilitySummaries.fellMonstrosity": "ยิงกระสุนชราวด์ใส่เป้าหมายและพ่นชราวด์ไปข้างหน้า รูปปั้นในสนามต่อสู้อาจสร้างนักรบคลั่งเฟลล์ขึ้นมา",
           "map.enshrouded.bestiary.abilitySummaries.fellDragonYoungling": "โจมตีด้วยอุกกาบาตเพลิงเฟลล์ พ่นไฟ และบินพ่นไฟผ่านสนาม การกระพือปีกจะผลักผู้เล่นให้ถอย และมันสามารถเรียกแร้งมังกรเฟลล์ได้",
           "map.enshrouded.bestiary.abilitySummaries.hollowCyclops": "ใช้กระบอง กระทืบพื้น และพ่นลมหายใจในระยะใกล้ การปะทุของร้างจะเหวี่ยงผู้ที่อยู่ในพื้นที่เป้าหมายสีเขียวขึ้นไป",
           "map.enshrouded.shroudLair.overview": "รังชราวด์เป็นดันเจี้ยนในชราวด์ซึ่งมีสิ่งมีชีวิตเฟลล์อาศัยอยู่",
           "map.enshrouded.shroudLair.essenceNote": "ขุดแหล่งแก่นแท้ยุคโบราณและเก็บตุ่มสีเหลืองภายใน ผู้จ้องมองชราวด์อาจดรอปแก่นแท้ยุคโบราณได้เช่นกัน",
           "map.enshrouded.locationGuide.facts.spireReveal": "เปลวเพลิงจะเปิดเผยตำแหน่งเสาโอเบลิสก์โบราณ เมื่ออ่านเสาเหล่านั้นจะพบตำแหน่งเหง้าชราวด์และอารามเปลวเพลิงในบริเวณใกล้เคียง",
           "map.enshrouded.locationGuide.facts.tombSpells": "สุสานลับบางแห่งเกี่ยวข้องกับภารกิจคาถานิรันดร์และให้รางวัลเป็นคาถาเฉพาะ",
           "map.enshrouded.locationGuide.facts.balefireQuest": "จุดไฟสัญญาณทั้งแปดแห่งเพื่อดำเนินภารกิจสังหารสัตว์ที่บิดเบี้ยวและล่อสัตว์ร้ายออกมาบนฮาวลิ่งพีก",
           "map.enshrouded.acquisition.archaicEssenceSummary": "เก็บตุ่มสีเหลืองในรังชราวด์ของ {{region}} หรือในอุโมงค์ของผู้จ้องมองชราวด์",
           "map.search.sourceKinds.loot": "ของที่พบในโลก"},
    "uk": {"map.enshrouded.bestiary.abilitySummaries.hollowCyclops": "Б’є дубиною, тупотить і атакує подихом зблизька. Виверження пустотілих підкидає всіх, хто опинився в зеленій зоні цілі.",
           "map.enshrouded.groups.Balefire": "Велике багаття",
           "map.enshrouded.locationGuide.facts.balefireQuest": "Запалення всіх восьми великих багать просуває завдання «Вбивство оскверненої тварюки» та виманює звіра на Виючому піку.",
           "map.enshrouded.locationGuide.facts.fossilCollection": "Скам’янілості мають різні розміри, їх можна виставляти у вітринах. Колекція містить шістнадцять різних скам’янілостей.",
           "map.details.spawnNotice": "Записи про появу ворогів також містять варіанти для завдань і подій.",
           "map.enshrouded.locationGuide.facts.shrineSparks": "Взаємодійте з Полум’ям, щоб зібрати іскри. Вони з часом відновлюються; кількість залежить від біому."},
    "tr": {"map.filters.foundCount": "Bulunan: {{found}} / {{total}}",
           "map.enshrouded.locationGuide.facts.shrineSparks": "Kıvılcım toplamak için Alev ile etkileşime geç. Kıvılcımlar zamanla yenilenir; miktarı biyoma göre değişir."},
}


def main():
    draft = b.read(b.RESEARCH / "ui-context-review-draft.json")
    english = dict(b.translator.flatten(b.read(b.translator.LOCALES / "en.json")))
    source = b.read(b.PACKS / "source.json")
    for code, values in draft.items():
        path = b.translator.LOCALES / f"{code.lower()}.json"
        locale = b.read(path)
        flat = dict(b.translator.flatten(locale))
        values.update(MANUAL.get(code, {}))
        pack = b.read(b.PACKS / (b.LANGUAGES[code].replace("_", "-").lower() + ".json"))["values"]
        if code in ("ja", "ko", "th"):
            values["gameplayGuide.petNote"] = flat["gameplayGuide.petNote"].replace("Paw's Touch", pack[source["keys"].index("2873484443")])
        if code == "uk":
            values["map.enshrouded.groups.LoreVeilwaterBasin"] = "Історія світу: " + pack[source["keys"].index("3619607455")]
        if code == "tr":
            for key, value in flat.items():
                if key.startswith(("buildingGuide.", "craftingGuide.", "progressionGuide.", "wikiGuide.", "gameplayGuide.")) \
                        and "{{count}}" in value and "giriş" in value:
                    values[key] = value.replace("giriş", "kayıt")
        for key, value in values.items():
            original = english.get(key, english.get(re.sub(r"_(?:one|few|many)$", "_other", key)))
            if original is None or b.translator.placeholders(value) != b.translator.placeholders(original):
                raise ValueError(f"Changed reviewed UI interpolation: {code}:{key}")
            b.translator.set_value(locale, key, value)
        review_path = ROOT / "scripts/localization-overrides" / f"{code.lower()}.json"
        reviews = b.read(review_path)
        reviews.update(values)
        b.atomic_json(review_path, reviews)
        b.atomic_json(path, locale)
        print(f"{code}: applied {len(values)} contextual UI reviews", flush=True)
    b.atomic_json(ROOT / "scripts/reviewed-ui-contexts.json", draft)


if __name__ == "__main__":
    main()
