"""Apply source-bound terminology corrections for the map update's audited prose."""
import hashlib
import importlib.util
import json
from pathlib import Path
import re

ROOT=Path(__file__).resolve().parents[1]
def read(path):return json.loads(path.read_text(encoding='utf-8'))
def write(path,value):path.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
spec=importlib.util.spec_from_file_location('builder',ROOT/'scripts/build-content-locales.py')
b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
source=read(ROOT/'public/data/enshrouded/locales/source.json');index={k:i for i,k in enumerate(source['keys'])}
status=read(ROOT/'research/localization/status.json')
rows={r['key']:r for r in read(ROOT/'research/localization/content-translation-source.json')['rows']}
by_name={}
for tag,value in zip(source['keys'],source['values']):
    if value:by_name.setdefault(b.normalize(value),[]).append(tag)
terms={
    'Spark':'2259947478','Hollow Damned':'396958899','Drak Soulward Flask':'3406355146',
    'Albaneve Hollow Halls':'3244901071','Lunar New Year Bandit Notes':'114678955',
    'Searching For Hidden Tombs':'4069162615','Searching For Hidden Tomb':'4069162615',
    'Meldore':'733943462','Fell Striker':'2944970150','Loraine Crim':'2209023256','Nala':'4172153011',
    "Fisherman's Resolve":'2334173281','Fortification':'4091810268','Orindell':'312761069',
    'Hall Of Founders':'4012870769','Hall Founders':'4012870769','Spooky Grave':'403215392',
    'Imagine This':'2481772291','The Tower Must Reach The Sky':'3987081298',
    'It Crawls Beneath My Flesh':'2909740585','Northern Caravan':'979609854','Southern Caravan':'1105326475',
    'Underground Infestation':'3496351521',"Lover's Quarrel":'3384431762','Titan Edge':'208296151',
    'Mana Currents':'1773629684',
}
display=read(ROOT/'scripts/reviewed-display-overrides.json')
display.setdefault('Our Eye Towards The Stars, Forever Shut',{})['ko']='별을 향한 우리의 눈, 영원히 감기다'
write(ROOT/'scripts/reviewed-display-overrides.json',display)

for code,pack in status['content']['packs'].items():
    game=read(ROOT/'public/data/enshrouded/locales'/f'{b.LANGUAGES[code].replace("_","-").lower()}.json')['values']
    native=lambda tag:b.plain(game[index[tag]])
    def game_name(name):
        tags=by_name.get(b.normalize(name),[])
        if name in b.TAG_OVERRIDES:tags=[b.TAG_OVERRIDES[name]]
        values={native(t) for t in tags}
        return next(iter(values)) if len(values)==1 else name
    path=ROOT/'scripts/content-localization-overrides'/f'{code.lower()}.json'
    overrides=read(path) if path.exists() else {}
    changed=0
    for finding in pack['reviewCandidates']:
        key=finding['key'];row=rows[key];english=row['english'];value=finding['translated']
        if not any(english==r['text'] and r.get('textKey') for p in read(ROOT/'public/data/enshrouded/marker-panels.json')['markers'].values() for r in p['paragraphs']):
            for term,tag in sorted(terms.items(),key=lambda pair:-len(pair[0])):
                if term.casefold() not in english.casefold():continue
                variants={term}
                rendered=term
                for token in row['terms']:
                    if not token['literal']:
                        rendered=re.sub(re.escape(token['english']),lambda _:game_name(token['english']),rendered,flags=re.I)
                variants.add(rendered)
                for variant in sorted(variants,key=len,reverse=True):
                    value=re.sub(re.escape(variant),lambda _:native(tag).rstrip(': '),value,flags=re.I)
            if code in ['ja','uk']:
                value=re.sub(r'\bThe\s+(?='+re.escape(game_name('Flame'))+')','',value)
            if english.endswith('— Vorgoth Notes'):
                value=game_name(english.split('—')[0].strip())+' — '+native('226648571')
            if key=='1a4e9e7d293c1bf3b367e279':
                value=re.sub(r'\([^()]*2/2\)',lambda _:f'({game_name("A Rumble in the Catacombs")} 2/2)',value)
            if key=='c96b2b2a91f65e27e1a1715b':
                value=re.sub(r'\([^()]*1/1\)',lambda _:f'({native("114678955")} 1/1)',value)
                value=value.replace('Set List',{'fr':'liste des ensembles','ko':'세트 목록','th':'รายการชุด'}.get(code,'Set List'))
            if key=='f940931c259d4600a89b6172' and code=='ko':
                value=re.sub(r'^"[^"]+"',lambda _:f'"{native("3987081298")}"',value)
            if key=='b4a5103d6148b960c0ba8fb8' and code=='es':
                value=f'{game_name("Shroud Weaver")} se encuentra en un cofre cerca de {game_name("Low Tide")}. La entrada «{game_name("The Mysterious Wanderer Appears")} indica su ubicación.'
            if 'Widmanstätten' in value:
                value=value.replace('Widmanstätten',{'ko':'위드만스테텐','th':'วิดมันสเตตเทน'}.get(code,'Widmanstätten'))
            if key=='bc0c6f6662d825ca66b50e9e':
                value={
                    'th':f'แบบจำลองของ{game_name("Veilwater Basin")} พร้อมทะเลสาบระยิบระยับ เหล่า{game_name("Drak")}กระหายเลือด และ{native("127113952")} สวรรค์อันแสนอันตราย ชีวิตยังต้องการอะไรอีก?',
                    'uk':f'Модель регіону «{game_name("Veilwater Basin") }» з блискучими озерами, кровожерливими істотами «{game_name("Drak") }» і напоєм «{native("127113952") }». Підступний рай. Чого ще бажати від життя?',
                }.get(code,value)
            if code=='th':
                value=value.replace('Revelwoods',game_name('Revelwood')).replace('Mining Settlement','ชุมชนเหมืองแร่').replace('Lost Soul','วิญญาณที่หลงทาง')
            if code=='uk':
                value=value.replace('Striker '+game_name('Fell'),native('2944970150')).replace('Nebulous','Туманний')
            if 'Flaskto read' in english:
                value={
                    'ru':f'Последнее испытание (1/1). Чтобы прочитать запись, выпейте: {native("3406355146")}.',
                    'ja':f'最後の試練（1/1）。読むには「{native("3406355146")}」を飲む必要があります。',
                    'th':f'บททดสอบสุดท้าย (1/1) ต้องดื่ม{native("3406355146")}เพื่ออ่าน',
                    'zh-Hans':f'最后的试炼（1/1）。阅读前需要饮用{native("3406355146")}。',
                    'zh-Hant':f'最後的試煉（1/1）。閱讀前需要飲用{native("3406355146")}。',
                    'uk':f'Останнє випробування (1/1). Щоб прочитати запис, випийте: {native("3406355146")}.',
                }.get(code,value)
            if 'Library Foyeris' in english:
                value={'th':f'โถงทางเข้าห้องสมุดตั้งอยู่ในดันเจี้ยนนี้',
                       'zh-Hans':f'{native("2127820207")}位于这座地牢内。',
                       'zh-Hant':f'{native("2127820207")}位於這座地牢內。'}.get(code,value)
            if code=='zh-Hans':
                if english=='Fixed pickup.':value='固定拾取点。'
                elif english=='Flame Level 3':value='灵火等级 3'
                elif english=='Glacial':value='冰川'
                elif english=='Hollow Artifacts':value='空荡遗物'
                elif english.startswith('Found in Treetop'):value='位于'+game_name('Treetop Vukah Settlement')+'。'
                elif 'can be looted from a corpse in' in english:
                    value='可从'+game_name('Albaneve Summits Hollow Halls')+'的尸体上拾取'+game_name(english.split(' can be')[0])+'。'
                elif english.startswith('Drak Fishing (1/1)'):value='卓克钓鱼（1/1）。阅读前需要饮用'+native('3406355146')+'。'
            if value!=finding['translated']:
                overrides[key]={'english':english,'templateSha256':hashlib.sha256(row['template'].encode()).hexdigest(),
                    'translation':value,'reviewNote':'Map update terminology checked against official game tags and marker context.'}
                changed+=1
    write(path,overrides)
    print(code,changed,flush=True)
