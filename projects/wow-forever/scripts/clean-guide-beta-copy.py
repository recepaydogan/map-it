"""Remove obsolete beta framing from guide prose without changing game records."""
import json
import re
from pathlib import Path
from bs4 import BeautifulSoup, NavigableString

ROOT = Path(__file__).resolve().parents[1]
AUDIT = ROOT / 'data/site-research/guide-beta-cleanup-2026-11-16'
BETA = re.compile(r'beta|bêta|베타|测试|測試|封测|封測', re.I)
STALE = re.compile(r"beta|bêta|베타|测试|測試|封测|封測|(?:above|beyond|past) the cap|cap will (?:rise|increase)|when (?:it|the cap) will rise|before the game launches|hasn.t said when|Blizzard hat.*(?:nicht|keinen).*Obergrenze|Blizzard n.a pas.*(?:plafond|limite)|Blizzard no ha.*(?:límite|aument)|Blizzard ainda não.*(?:limite|aument)|블리자드는.*(?:발표하지|밝히지).*|暴雪.*尚未.*上限", re.I)
STALE = re.compile(STALE.pattern + r'|current (?:level 30 )?cap|level 30 cap|cap (?:is 30|rises again)|(?:reach|hit) the cap|later level cap|(?:aktuell|derzeitig)\w* (?:Stufen|Level)?(?:grenze|obergrenze)|Grenze von Stufe 30|(?:límite|limite|plafond) (?:actual |actuel |atual )?(?:de )?(?:nivel|niveau|nível) 30|(?:현재 )?30레벨 (?:상한|제한)|(?:当前|目前)\s*30\s*[级級]上限', re.I)
CHANGED = []
REMOVED = []

def read(file):
    baseline = AUDIT / 'before' / file.relative_to(ROOT)
    return json.loads((baseline if baseline.exists() else file).read_text(encoding='utf-8-sig'))
def save(file, data):
    if read(file) == data: return
    name = file.relative_to(ROOT).as_posix()
    before = AUDIT / 'before' / name
    before.parent.mkdir(parents=True, exist_ok=True)
    if not before.exists(): before.write_bytes(file.read_bytes())
    file.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf8')
    CHANGED.append(name)

# Remove inline qualifications while keeping the level and the actual advice.
REPLACEMENTS = [
    (r", the current (?:WoW Forever )?beta cap", ''),
    (r", the beta's cap since the 1 October build,", ','),
    (r"(?:the )?(?:level 30 beta cap|beta's level 30 cap)", 'level 30'),
    (r', der aktuellen Beta-Obergrenze,', ','),
    (r', dem Betalimit seit dem Build vom 1\. Oktober,', ','),
    (r', seit dem Build vom 1\. Oktober die Beta-Obergrenze,', ','),
    (r'(?:bis )?zur aktuellen Beta-(?:Obergrenze|Grenze) von 30', 'bis Stufe 30'),
    (r'(?:bis )?zur derzeitigen Beta-Grenze von 30', 'bis Stufe 30'),
    (r'(?:bis )?zur (?:aktuellen )?Beta-Grenze von Stufe 30', 'bis Stufe 30'),
    (r', el límite (?:actual de la beta|de la beta desde la versión del 1 de octubre)', ''),
    (r'(?:el )?límite (?:actual de |de )?nivel 30 de la beta', 'nivel 30'),
    (r'el límite actual de la beta, el 30', 'el nivel 30'),
    (r', (?:le )?plafond (?:actuel de la bêta|de la bêta depuis la version du 1er octobre)', ''),
    (r'la limite de niveau 30 de la bêta', 'niveau 30'),
    (r'la limite actuelle de la bêta, le niveau 30', 'niveau 30'),
    (r', (?:o )?limite (?:atual d[ao] beta|d[ao] beta desde a versão de 1º de outubro)', ''),
    (r'(?:o )?limite (?:atual de |de )?nível 30 da versão beta', 'nível 30'),
    (r'o limite atual da beta, o 30', 'o nível 30'),
    (r'(?:10월 1일 빌드부터 )?(?:현재 )?베타 최고 레벨인 ', ''),
    (r'베타 상한인 ', ''),
    (r'，也就是(?:当前|目前) Beta 等[级級]上限[时時]', ''),
    (r'(?:当前|目前)(?:测试|測試)上限\s*', ''),
    (r'(?:测试|測試)版(?:(?:当前|目前)的?)?30([级級])上限', r'30\1'),
    (r'自 10 月 1 日版本起，(?:测试|測試)等[级級]上限[为為] 30；', ''),
    (r'30 ([级級])是自 10 月 1 日版本起的(?:测试|測試)服等[级級]上限，', r'30 \1时，'),
]

def clauses(text):
    for pattern, replacement in REPLACEMENTS:
        text = re.sub(pattern, replacement, text, flags=re.I)
    return text.replace('anível 30','ao nível 30')

def sentence_ranges(text):
    # Do not split version numbers, decimal values, or dates such as "1. Oktober".
    protected = re.sub(r'(?<=\d)\.(?=\s*(?:Oktober|November|Dezember|Januar))', '·', text)
    start = 0
    for m in re.finditer(r'[。！？]|[.!?](?=\s+|$)', protected):
        yield start, m.end()
        start = m.end()
    if start < len(text): yield start, len(text)

def prose(text):
    text = clauses(text)
    parts = []
    for a,b in sentence_ranges(text):
        sentence = text[a:b]
        if STALE.search(sentence): REMOVED.append(sentence.strip())
        else: parts.append(sentence.strip())
    return ' '.join(p for p in parts if p)

HEADINGS = {
 'en': ['Where should I level from 1 to 30?', 'How do I reach level 30?'],
 'de': ['Wo sollte ich von Stufe 1 bis 30 leveln?', 'Wie erreiche ich Stufe 30?'],
 'es': ['¿Dónde debería subir del nivel 1 al 30?', '¿Cómo alcanzo el nivel 30?'],
 'es-MX': ['¿Dónde debería subir del nivel 1 al 30?', '¿Cómo alcanzo el nivel 30?'],
 'fr': ['Où progresser du niveau 1 au niveau 30 ?', 'Comment atteindre le niveau 30 ?'],
 'pt-BR': ['Onde devo subir do nível 1 ao 30?', 'Como chego ao nível 30?'],
 'ko': ['1레벨부터 30레벨까지 어디서 레벨을 올리나요?', '30레벨까지 어떻게 성장하나요?'],
 'zh-Hans': ['从1级到30级该去哪里升级？', '怎样升到30级？'],
 'zh-Hant': ['從1級到30級該去哪裡升級？', '如何升到30級？'],
}

def html(text, lang):
    if not STALE.search(text): return text
    soup = BeautifulSoup(text, 'html.parser')
    first_heading = soup.find(re.compile('^h[2-4]$'))
    if first_heading:
        for node in list(first_heading.previous_siblings):
            if getattr(node,'name',None) and BETA.search(node.get_text()):
                REMOVED.append(node.get_text())
                node.decompose()
    for node in list(soup.find_all(['p','li','blockquote','td','th','figcaption','small'])):
        if node.parent is None or node.find(['p','li','blockquote','td','th']): continue
        strings = list(node.find_all(string=True))
        full = ''.join(str(s) for s in strings)
        if not STALE.search(full): continue
        # Delete whole sentence spans across inline tags without flattening links.
        spans = [(a,b) for a,b in sentence_ranges(full) if STALE.search(full[a:b])]
        pos = 0
        for s in strings:
            end = pos + len(s)
            keep = ''.join(c for i,c in enumerate(str(s),pos) if not any(a <= i < b for a,b in spans))
            if keep != str(s): s.replace_with(NavigableString(keep))
            pos = end
        REMOVED.extend(full[a:b].strip() for a,b in spans)
    for h in soup.find_all(re.compile('^h[2-4]$')):
        if h.get('id') in ['above-the-current-cap','at-the-level-30-cap']:
            labels = {
              'en':['Higher-level abilities','At level 30'], 'de':['Fähigkeiten für höhere Stufen','Auf Stufe 30'],
              'es':['Habilidades de niveles superiores','Al nivel 30'], 'es-MX':['Habilidades de niveles superiores','Al nivel 30'],
              'fr':['Compétences de niveau supérieur','Au niveau 30'], 'pt-BR':['Habilidades de níveis mais altos','No nível 30'],
              'ko':['상위 레벨 능력','30레벨에 할 일'], 'zh-Hans':['更高等级的技能','到达30级'], 'zh-Hant':['更高等級的技能','達到30級'],
            }
            h.string=labels[lang][int(h['id']=='at-the-level-30-cap')]
        if BETA.search(h.get_text()):
            identifier = h.get('id','')
            if identifier in ['where-should-i-go-to-level-from-1-to-30-in-the-beta','where-do-i-go-to-level-to-the-30-cap-in-the-beta']:
                h.string = HEADINGS[lang][int(identifier.startswith('where-do-'))]
            else:
                clean = prose(h.get_text())
                if clean: h.string = clean
                else: h.decompose()
    for node in reversed(list(soup.find_all(['p','li','blockquote','b','strong','em','small','cite','a','ul','ol']))):
        if node.parent is not None and not node.get_text(strip=True) and not node.find('img'): node.decompose()
    return str(soup)

def transform(value):
    if isinstance(value, dict): return {k: transform(v) if k not in ['id','path','icon','sourceUrl','url'] else v for k,v in value.items()}
    if isinstance(value, list): return [transform(v) for v in value]
    if isinstance(value, str) and STALE.search(value) and not value.startswith('http'): return prose(value)
    return value

def run():
    directory = ROOT / 'public/data/classes/guides'
    for file in directory.glob('*.json'):
        if file.name in ['game-build.json','manifest.json','changes.json']: continue
        save(file, transform(read(file)))
    for file in (directory/'locales').glob('*/*.json'):
        data = read(file)
        for edit in data['edits']:
            old = edit['source']
            edit['source'] = prose(old) if STALE.search(old) else old
            edit['text'] = prose(edit['text']) if STALE.search(edit['text']) else edit['text']
            if edit['source'] != old: edit['sources'] = list(dict.fromkeys([*edit.get('sources',[]),old]))
            if not edit['text'].strip(): raise ValueError(f'Empty translation: {file} {edit["path"]}')
        save(file,data)
    # Keep authoring translations aligned so a later generation cannot reintroduce beta copy.
    for file in (ROOT/'data/class-guide-localization').glob('*.json'):
        data=read(file)
        for edit in data.get('edits',[]):
            edit['source']=prose(edit['source']) if STALE.search(edit['source']) else edit['source']
            for lang,text in edit.get('translations',{}).items():
                edit['translations'][lang]=prose(text) if STALE.search(text) else text
        save(file,data)
    directory = ROOT/'public/data/guides'
    articles={}
    for file in [*directory.glob('*.json'), *directory.glob('locales/*/*.json')]:
        data=read(file)
        if 'html' not in data: continue
        lang=file.parent.name if file.parent.parent.name=='locales' else 'en'
        before=data.copy()
        data['html']=html(data['html'],lang)
        data['intro']=prose(data['intro']) if STALE.search(data['intro']) else data['intro']
        if data['id']=='leveling':
            if lang=='fr': data['intro']='Un itinéraire de niveau 1 à 30, zone par zone, pour l’Alliance et la Horde. Avec les villes, les maîtres de vol et les donjons sur le trajet.'
            if lang=='ko': data['intro']='얼라이언스와 호드의 1~30레벨 지역별 성장 경로를 안내합니다. 이동 중 들를 마을과 비행 조련사, 도전할 수 있는 던전도 함께 다룹니다.'
        if not data['intro']:
            original=clauses(before['intro'])
            # Keep the existing topic list when the introductory beta sentence was its only sentence.
            parts=re.split(r'[:：]\s*',original,maxsplit=1)
            if len(parts)==2 and not STALE.search(parts[1]): data['intro']=parts[1][0].upper()+parts[1][1:]
            else: raise ValueError(f'Intro needs editorial review: {file}')
        soup=BeautifulSoup(data['html'],'html.parser')
        data['headings']=[{'id':h['id'],'title':h.get_text(),'depth':int(h.name[1])} for h in soup.find_all(re.compile('^h[2-4]$')) if h.get('id')]
        articles[(lang,data['id'])]=data
        save(file,data)
    for file in [directory/'index.json',*directory.glob('locales/*/index*.json')]:
        data=read(file);lang=file.parent.name if file.parent.parent.name=='locales' else 'en'
        if 'guides' in data:
            for entry in data['guides']:
                article=articles.get((lang,entry['id']))
                if article:
                    for key in ['intro','headings']: entry[key]=article[key]
        if 'summaries' in data:
            for identifier,entry in data['summaries'].items():
                article=articles.get((lang,identifier))
                if article:entry['intro']=article['intro']
        save(file,data)
    cautions={'en':'Check this location','de':'Diesen Standort prüfen','es':'Comprueba esta ubicación','es-MX':'Comprueba esta ubicación','fr':'Vérifiez cet emplacement','pt-BR':'Confira este local','ko':'이 위치를 확인하세요','zh-Hans':'确认此位置','zh-Hant':'確認此位置'}
    for lang,label in cautions.items():
        file=ROOT/f'src/i18n/locales/{lang}.json';data=read(file)
        data['classGuide']['full'].pop('betaNotice',None)
        data['classGuide']['gear'].pop('future',None)
        data['classGuide']['gear']['clientSource']='WoW Forever'
        data['guides']['mapCoordinateCaution']=label
        save(file,data)
    (AUDIT/'scope.json').write_text(json.dumps({'version':1,'paths':CHANGED},indent=2)+'\n',encoding='utf8')
    (AUDIT/'removed-sentences.json').write_text(json.dumps(sorted(set(REMOVED)),ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print('Changed',len(CHANGED),'files; removed',len(set(REMOVED)),'distinct sentences.')

if __name__=='__main__':
    import sys
    if len(sys.argv)==3 and sys.argv[1]=='--html':
        print(html(sys.stdin.read(),sys.argv[2]),end='')
    else:run()
