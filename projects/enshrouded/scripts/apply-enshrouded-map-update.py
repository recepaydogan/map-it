"""Apply the captured Wiki update while retaining app IDs and native corrections.

Run fetch-enshrouded-map-update.py first. No publication is performed.
"""
from pathlib import Path
import collections
import copy
import hashlib
import html
import importlib.util
import io
import json
import math
import re
import shutil
import sys
import uuid
from urllib.parse import unquote, urljoin
from bs4 import BeautifulSoup
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
AUDIT = ROOT/'research/wiki-map-comparison-2026-11-16'
SOURCE = ROOT/'research/map-update-2026-11-16'
DATA = ROOT/'public/data/enshrouded'
MAP = ROOT/'public/maps/enshrouded'
BASE = 'https://enshrouded.wiki.gg'
read = lambda path:json.loads(path.read_text(encoding='utf-8'))

def write(path,value):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(value,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')

def module(name):
    spec = importlib.util.spec_from_file_location(name,ROOT/'scripts'/f'{name}.py')
    mod = importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
    return mod

normalize = lambda value:re.sub(r'[^\w]+','',html.unescape(value).replace('_',' ').casefold())
key = lambda value:value.replace('_',' ').strip().casefold()
ITEM_ALIASES = {
    'Archaic Essence I':'Archaic Essence (5)',
    'Yellow Cymbidum Flower':'Yellow Cymbidum Flower Pot',
    'Pink Lily Flower':'Pink Lily Flower Pot',
    'Queen Pikemead Statue Piece (Torso)':'Queen Pikemead Statue Piece (Bust)',
    '"Cowlick" Wig Head':'Cowlick Wig Head',
    '"Braid" Wig Head':'Braid Wig Head',
    '"Hanfu Ponytail" Wig Head':'Hanfu Ponytail Wig Head',
    '"Slick Fade" Wig Head':'Slick Fade Wig Head',
    '"Afro" Wig Head':'“Afro” Wig Head',
}

def plain(source, title=''):
    source = re.sub(r'<!--.*?-->','',source,flags=re.S)
    source = source.replace('{{PAGENAME}}',title).replace('{{SUBPAGENAME}}',title.split('/')[-1])
    def template(match):
        parts = [s.strip() for s in match[1].split('|')]
        name = parts[0].lower().replace('_',' ')
        values = [v for v in parts[1:] if '=' not in v]
        if name.startswith(('item+','quest+','lore+')) and values:return values[0]
        if name=='maplink' and values:return values[-1] if len(values)>1 else ''
        return ''
    for _ in range(10):
        updated = re.sub(r'\{\{([^{}]*)\}\}',template,source)
        if updated==source:break
        source=updated
    source = re.sub(r'\[\[(?:File|Image|Category|[a-z]{2,3}):[^]]*\]\]','',source,flags=re.I)
    source = re.sub(r'\[\[(?:[^]|]*\|)?([^]]+)\]\]',r'\1',source)
    source = re.sub(r"'{2,}",'',source)
    source = re.sub(r'<br\s*/?>','\n',source,flags=re.I)
    source = BeautifulSoup(source,'html.parser').get_text()
    return re.sub(r'\n\s*\n\s*\n','\n\n',html.unescape(source)).strip()

def lore_text(source,name):
    name={'If Mother Were Here':'If Mother Was Here'}.get(name,name)
    for title,body in re.findall(r'\|-\|\s*(.*?)\s*=\s*(.*?)(?=\|-\||</tabber>)',source,re.S):
        title = re.sub(r'\s*\(?\d+/\d+\)?\s*$','',title)
        if normalize(title)==normalize(name):
            text=plain(body)
            return text if len(text)>15 and text.casefold() not in {'todo','placeholder'} else ''
    return ''

def main():
    markers = read(AUDIT/'live-markers.json')
    configs = read(AUDIT/'live-config.json')['maps']
    aliases = {r['wikiId']:r['appId'] for r in read(AUDIT/'id-aliases.json')}
    canonical_id = lambda value:aliases.get(value,value)
    # Preserve a baseline for repeatability without overwriting previous user edits.
    baseline = SOURCE/'baseline'
    files = ['wiki-catalog.json','crafting-catalog.json','building-catalog.json','progression-catalog.json',
        'marker-source-links.json','wiki-map-links.json','wiki-obtaining-map-links.json','material-locations.json']
    for name in files:
        target = baseline/name
        if not target.exists():
            target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(DATA/name,target)
    if not (baseline/'metadata.json').exists():shutil.copyfile(MAP/'metadata.json',baseline/'metadata.json')
    original = read(baseline/'metadata.json')
    old_points = {p['id']:p for p in original['locations']}
    native = {r['id'] for r in read(DATA/'map-source-corrections.json')['markerUpdates']}
    pages = read(SOURCE/'pages.json');redirects=read(SOURCE/'redirects.json')
    native_lore = read(ROOT/'research/game-map-verification-2026-10-23/native-labeled-placements.json')
    game_text = read(DATA/'locales/source.json')
    labels=dict(zip(game_text['keys'],game_text['values']))
    reviewed_lore=read(SOURCE/'reviewed-lore-transcripts.json')
    def game_tag(guid):
        value=2166136261
        for byte in uuid.UUID(guid).bytes_le:value=((value^byte)*16777619)&0xffffffff
        return str(value)
    # Some readable objects have no placement in the prior scene scan.
    # Their template still links an exact name to a current official transcript.
    template_lore=collections.defaultdict(list)
    for guid,template in read(ROOT/'research/game-map-verification-2026-10-23/template-semantics.json').items():
        lore=template['components'].get('LoreReading',{})
        if lore.get('entryName') and lore.get('description'):
            name=labels.get(game_tag(lore['entryName']));tag=game_tag(lore['description']);text=labels.get(tag)
            if name and text:template_lore[normalize(name)].append((guid,tag,text))
    normalize_text = lambda value:re.sub(r'\s+',' ',html.unescape(re.sub(r'<[^>]*>','',value or ''))).strip().casefold()
    text_tags = collections.defaultdict(list)
    for tag,value in zip(game_text['keys'],game_text['values']):
        if value:text_tags[normalize_text(value)].append(tag)
    pages_by_key = {key(title):title for title in pages}
    def resolve(title):
        title=title.split('#')[0].replace('_',' ')
        visited=set()
        while title in redirects and title not in visited:
            visited.add(title);title=redirects[title]
        return pages_by_key.get(key(title),title)
    def page_source(title):
        page=pages.get(resolve(title),{})
        return page.get('revisions',[{}])[0].get('slots',{}).get('main',{}).get('content','')
    manifest = read(SOURCE/'asset-manifest.json');images=read(SOURCE/'images.json')
    images_by_key = {key(title):info for title,info in images.items()}
    def asset(url,kind='icon'):
        row=manifest.get(url)
        if not row:return None
        source=ROOT/row['path']
        if hashlib.sha256(source.read_bytes()).hexdigest()!=row['sha256']:
            raise ValueError('Asset changed: '+str(source))
        folder='marker-photos' if kind=='panel' else 'marker-icons'
        filename=row['sha256'][:20]+'.webp'
        target=MAP/folder/filename
        if not target.exists():
            target.parent.mkdir(parents=True,exist_ok=True)
            with Image.open(source) as original_image:
                im=original_image.convert('RGBA');im.thumbnail((960,960) if kind=='panel' else (160,160),Image.Resampling.LANCZOS)
                im.save(target,'WEBP',quality=90,method=4)
        return target.relative_to(ROOT/'public').as_posix()
    def file_asset(name,kind='icon'):
        info=images_by_key.get(key(html.unescape(name)))
        return asset(info.get('thumburl') or info['url'],kind) if info else None

    groups={}
    for config in configs:
        for name,g in config['config']['groups'].items():
            if name in groups:continue
            icon=asset(urljoin(BASE,g['markerIcon'])) if g.get('markerIcon') else None
            if g.get('markerIcon') and not icon:raise ValueError('Missing category image: '+name)
            groups[name]={'name':g['name'],'icon':icon,'size':g.get('size',[25,25])}
    # Category text remains compatible with the already reviewed translations.
    groups['FlameMosaic']['name']='Flame Mosaic Piece'

    next_parser=module('prepare-enshrouded-next')
    catalog_parser=module('build-enshrouded-wiki-catalog')
    progression_parser=module('build-enshrouded-progression')
    progression_parser.MAP_MARKER_ALIASES.update(aliases)
    wiki=read(baseline/'wiki-catalog.json')
    crafting=read(baseline/'crafting-catalog.json')
    building=read(baseline/'building-catalog.json')
    progression=read(baseline/'progression-catalog.json')
    wiki_by_key={key(r['id']):r for r in wiki['records']}
    known_elsewhere={key(r['sourcePage']) for r in building['records']}
    known_elsewhere.update(key(r['page']) for group in ['items','materials','stations'] for r in crafting[group])
    known_elsewhere.update(key(r['id']) for group in ['npcs','quests','sets','setItems'] for r in progression[group])
    item_groups={'Fossil','Music_Sheet','FlameMosaic','DrakRelief','Miniature_Model','Painting','Meteorite','Orrery','Hollow_Artifact',
        'QueenPikemeadStatuePiece','AlchemistWallHanging','CyclopsSkeleton','WallTapestry','DragonsMapPiece'}
    requested_items={resolve(m['name']) for m in markers if m['layers'] in item_groups}
    requested_items.update(resolve(m.get('article') or m['name']) for m in markers if m['layers'].startswith('Fixed_'))
    requested_items.update(resolve(m['name']) for m in markers if m['layers'].startswith('Fixed_'))
    requested_items.update(ITEM_ALIASES.values())
    native_items=read(SOURCE/'native-item-evidence.json')
    refreshed=[];added=[]
    for title,page in pages.items():
        source=page_source(title);templates=next_parser.templates(source)
        info=next((t['fields'] for t in templates if t['template'].lower().endswith('infobox')),None)
        if not info and title=='“Afro” Wig Head':
            native_item=next(r for r in native_items if r['englishName']=='"Afro" Wig Head')
            info={'description':native_item['englishDescription'],'type':'Furniture','rarity':native_item['rarity'],
                  'stack size':str(native_item['maxStackSize'])}
        if not info:continue
        record=wiki_by_key.get(key(title))
        if record is None:
            if title not in requested_items or key(title) in known_elsewhere:continue
            if not (info.get('type') or info.get('description')):continue
            collectible=any(resolve(m['name'])==title and m['layers'] in item_groups for m in markers)
            record={'id':title,'name':plain(info.get('title') or title,title),'catalog':'collectibles' if collectible else 'equipment',
                'groups':['Collectibles' if collectible else 'Equipment'],'section':'Collectibles' if collectible else 'Equipment',
                'icon':None,'description':None,'type':None,'rarity':None,'level':None,'stackSize':None,'comfort':None,
                'obtaining':None,'attributes':[],'stats':[],'recipes':[],'related':[]}
            wiki['records'].append(record);wiki_by_key[key(title)]=record;added.append(title)
        for field,dest in [('description','description'),('type','type'),('rarity','rarity'),('level','level'),('stack size','stackSize'),('comfort','comfort')]:
            if info.get(field):record[dest]=plain(info[field],title)
        obtaining=catalog_parser.article_obtaining(source,title) or catalog_parser.article_lead_obtaining(source,title)
        # The Afro article's acquisition paragraph incorrectly names Slick Fade.
        if title=='“Afro” Wig Head':obtaining=''
        if obtaining:record['obtaining']=obtaining
        elif info.get('source'):record['obtaining']=plain(info['source'],title)
        stats=catalog_parser.clean_stats([t for t in templates if t['template'].lower().endswith('stats')])
        if stats:record['stats']=stats
        image=next_parser.image_name(info.get('images'),title)
        if image and not record.get('icon'):record['icon']=file_asset(image)
        record['sourceRevision']=page.get('revisions',[{}])[0].get('revid')
        refreshed.append(title)
    # Update descriptions/acquisition in the existing building and crafting schemas.
    for records,field,obtaining_key in [(building['records'],'sourcePage','obtainingText')]+[(crafting[g],'page','obtaining') for g in ['items','materials','stations']]:
        for record in records:
            title=resolve(record[field]);source=page_source(title)
            if not source:continue
            templates=next_parser.templates(source)
            info=next((t['fields'] for t in templates if t['template'].lower().endswith('infobox')), {})
            if info.get('description'):record['description']=plain(info['description'],title)
            obtaining=catalog_parser.article_obtaining(source,title) or catalog_parser.article_lead_obtaining(source,title)
            if obtaining:record[obtaining_key]=obtaining
    quest_by_id={r['id']:r for r in progression['quests']}
    for title,p in read(SOURCE/'rendered-quests.json').items():
        soup=BeautifulSoup(p['text'],'html.parser')
        # The wiki uses both legacy h1 and modern heading wrappers.
        for wrapper in soup.select('div.mw-heading'):
            wrapper.unwrap()
        for heading in soup.find_all('h1'):heading.name='h2'
        sections=progression_parser.sections(soup)
        if not sections:raise ValueError('Empty quest panel: '+title)
        record=quest_by_id.get(title)
        if record is None:
            record={'id':title,'name':title.removeprefix('Quests/'),'group':'Other Quests'}
            progression['quests'].append(record);quest_by_id[title]=record
        record.update(sections=sections,revision=p['revid'])

    # Match every item/quest link to a real existing detail panel.
    entry_index={}
    for catalog,records,field in [('wiki',wiki['records'],'id'),('building',building['records'],'sourcePage'),
            ('crafting',[r for g in ['items','materials','stations'] for r in crafting[g]],'page'),
            ('progression',[r for g in ['npcs','quests','sets','setItems'] for r in progression[g]],'id'),
            ('bestiary',read(DATA/'bestiary-catalog.json')['records'],'wikiArticle')]:
        for row in records:
            target={'page':row[field],'catalog':catalog}
            for name in [row[field],row.get('name','')]:
                if name:entry_index.setdefault(key(name),target)
    def target(title):
        title=ITEM_ALIASES.get(title,title)
        return entry_index.get(key(title)) or entry_index.get(key(resolve(title)))
    source_links=read(baseline/'marker-source-links.json')
    wiki_links=read(baseline/'wiki-map-links.json')
    material_links=read(baseline/'material-locations.json')
    panels={};locations=[];unresolved=[];lore_missing=[];deferred=[]
    for marker in markers:
        uid=canonical_id(marker['id']);old=old_points.get(uid)
        g=next(g for g in marker['layers'].split() if g in groups)
        article=marker.get('article') or ''
        source=page_source(article)
        description=re.sub(r'\s*\(TODO[^)]*\)\.?','',marker.get('description','')).strip()
        panel={'sourcePage':resolve(article),'sourceRevision':pages.get(resolve(article),{}).get('revisions',[{}])[0].get('revid'),
            'entries':[],'paragraphs':[]}
        primary=(target(marker['name']) or target(article)) if g in item_groups or g.startswith('Fixed_') else target(article)
        if primary is None and g in item_groups:
            curated=[target(page) for page,ids in wiki_links.items() if uid in ids and target(page)]
            if len(curated)==1:primary=curated[0]
        if primary:panel['entries'].append(primary)
        for anchor in BeautifulSoup(marker.get('descriptionHtml',''),'html.parser').select('a[href]'):
            href=anchor['href']
            if '/wiki/' not in href:continue
            linked=target(unquote(href.split('/wiki/',1)[1].split('#')[0]).replace('_',' '))
            if linked and linked not in panel['entries']:panel['entries'].append(linked)
        photo=asset(marker['panelImage']['url'],'panel') if marker.get('panelImage') else None
        if marker.get('panelImage') and not photo:raise ValueError('Missing marker image: '+marker['id'])
        if g.startswith('Lore') or g=='Physical_Inscription':
            text=lore_text(source,marker['name'])
            official_templates=template_lore.get(normalize(marker['name']),[])
            if uid in reviewed_lore:
                reviewed=reviewed_lore[uid];tag=reviewed['gameTextTag']
                wiki_body=re.split(r'\n\s*LOCATION\b',text)[0].strip()
                if hashlib.sha256(wiki_body.encode()).hexdigest()!=reviewed['wikiTextSha256'] or hashlib.sha256(labels[tag].encode()).hexdigest()!=reviewed['nativeTextSha256']:
                    raise ValueError('Reviewed lore transcript changed: '+uid)
                panel['paragraphs']=[{'text':plain(labels[tag]),'kind':'lore','textKey':tag}]
                panel['nativeEvidence']={'gameTextTag':tag,'match':'reviewed-transcript'}
            elif len({r[1] for r in official_templates})==1:
                # Exact unique titles identify the current game transcript and
                # its official translations, avoiding stale wiki transcriptions.
                guid,tag,text=official_templates[0]
                panel['paragraphs']=[{'text':plain(text),'kind':'lore','textKey':tag}]
                panel['nativeEvidence']={'templateGuid':guid,'gameTextTag':tag}
            elif text:panel['paragraphs']=[{'text':text,'kind':'lore'}]
            else:
                candidates=[r for r in native_lore if r.get('loreText') and normalize(r.get('englishName') or '')==normalize(marker['name'])]
                # Interior notes may be pinned at an overworld entrance. Transfer text,
                # never coordinates, only when the exact title has one unique transcript.
                if len({normalize_text(r['loreText']) for r in candidates})==1:
                    candidate=min(candidates,key=lambda r:math.hypot(r['x']-marker['x'],r['z']-marker['y']))
                    tags=text_tags.get(normalize_text(candidate['loreText']),[])
                    if len(tags)==1:
                        panel['paragraphs']=[{'text':plain(candidate['loreText']),'kind':'lore','textKey':tags[0]}]
                        panel['nativeEvidence']={'templateGuid':candidate['templateGuid'],'gameTextTag':tags[0],
                            'distance':math.hypot(candidate['x']-marker['x'],candidate['z']-marker['y'])}
                if not panel['paragraphs']:
                    templates=template_lore.get(normalize(marker['name']),[])
                    if len({r[1] for r in templates})==1:
                        guid,tag,text=templates[0]
                        panel['paragraphs']=[{'text':plain(text),'kind':'lore','textKey':tag}]
                        panel['nativeEvidence']={'templateGuid':guid,'gameTextTag':tag}
                if not panel['paragraphs'] and g!='Lore_Acquisition':lore_missing.append({'id':uid,'name':marker['name'],'article':article})
            if not photo:
                for filename,caption in re.findall(r'(?:File:|Image:)([^\n|]+)\|([^\n]+)',source):
                    if normalize(caption)==normalize(marker['name']):
                        photo=file_asset(filename.strip(),'panel')
                        if photo:break
        elif not primary and marker['name']=='Paper Lantern I':
            native_item=next(r for r in native_items if r['englishName']==marker['name'])
            panel['paragraphs']=[{'text':plain(native_item['englishDescription']),'kind':'overview'}]
            panel['nativeEvidence']={'itemGuid':native_item['$guid'],'gameNameTag':native_item['nameTag']}
        elif not primary and marker['name']=='Fern':
            # The game has several same-name fern variants. Do not assign a size.
            panel['paragraphs']=[{'text':'A potted plant to beautify your home.','kind':'overview'}]
            panel['nativeEvidence']={'itemGuids':[r['$guid'] for r in native_items if r['englishName']=='Fern'],
                                     'variantUnspecified':True}
        elif not primary and not description and source:
            # Only a short article lead; never dump an entire region/index onto a pin.
            lead=re.split(r'^={1,6}[^=]',source,maxsplit=1,flags=re.M)[0]
            lead=plain(lead,resolve(article))
            if lead and len(lead)<1000 and not any(s in lead for s in ['{|','|-','|}']):
                panel['paragraphs']=[{'text':lead,'kind':'overview'}]
        if g.startswith('Fixed_') and not primary and not panel['paragraphs']:
            unresolved.append({'id':uid,'name':marker['name'],'article':article,'reason':'No resolvable primary item'})
        if g in item_groups and not primary:
            unresolved.append({'id':uid,'name':marker['name'],'article':article,'reason':'No resolvable collectible'})
        if g=='QuestLocation' and article.startswith('Quests/') and not primary:
            unresolved.append({'id':uid,'name':marker['name'],'article':article,'reason':'No resolvable quest'})
        if not old and g=='Physical_Inscription' and not description and not panel['entries'] and not panel['paragraphs'] and not photo:
            deferred.append({'id':uid,'name':marker['name'],'reason':'Upstream supplies only a name and coordinates; no verified panel content'})
            continue
        point={**(old or {}),'id':uid,'name':marker['name'],'category':'wiki-'+g.lower(),'label':groups[g]['name'],'subtype':g,
            'regionId':'embervale','region':'Embervale','x':marker['x'],'y':10240-marker['y'],
            'referenceCoordinates':{'x':marker['x'],'y':marker['y']},'description':description,
            'iconPath':groups[g]['icon'],'artworkPath':photo or (old or {}).get('artworkPath'),
            'wikiArticle':article,'sourceLayers':marker['presentOn'],'relatedPages':[{'page':e['page'],'label':e['page']} for e in panel['entries']]}
        if uid!=marker['id']:point['aliasIds']=sorted(set(point.get('aliasIds',[])+[marker['id']]))
        if old and (uid in native or uid!=marker['id']):
            for field in ['x','y','referenceCoordinates']:point[field]=old[field]
        locations.append(point)
        # Link primary sources to existing rich panels and preserve curated related links.
        for entry in panel['entries']:
            found=entry==primary and (g.startswith('Fixed_') or g in item_groups)
            row={'page':entry['page'],'catalogs':[entry['catalog']],'relation':'found' if found else 'related'}
            existing=source_links.setdefault(uid,[])
            existing[:]=[r for r in existing if key(r['page'])!=key(row['page'])]
            existing.append(row)
            if found and entry['catalog']=='wiki':
                ids=wiki_links.setdefault(entry['page'],[])
                if uid not in ids:ids.append(uid)
            if found and entry['catalog'] in ['building','crafting']:
                places=material_links.setdefault(entry['page'],[])
                if not any(r['id']==uid for r in places):places.append({'id':uid,'name':point['name']})
        panels[uid]=panel
    if len(locations)+len(deferred)!=1667 or len({p['id'] for p in locations})!=len(locations):raise ValueError('Unexpected map size or duplicate IDs')
    if not set(old_points)<= {p['id'] for p in locations}:raise ValueError('Existing saved marker IDs would be lost')
    write(SOURCE/'unresolved-primary-panels.json',unresolved)
    write(SOURCE/'lore-without-transcript.json',lore_missing)
    write(SOURCE/'deferred-markers.json',deferred)
    if unresolved:print('Primary entries needing review:',len(unresolved),flush=True)
    # Rebuild all four tile levels with the existing projection and codec settings.
    build=module('build-enshrouded-content');build.SOURCE=ROOT;build.MAP=MAP
    tiles=[]
    for overlay in configs[0]['config']['backgrounds'][0]['overlays']:
        url=urljoin(BASE,overlay['image']);row=manifest.get(url)
        if not row:raise ValueError('Missing terrain: '+url)
        filename=unquote(url.split('/images/',1)[1].split('?')[0])
        tiles.append({'name':filename,'path':row['path']})
    if '--skip-tiles' not in sys.argv:build.build_tiles(tiles)
    write(MAP/'metadata.json',{**original,'description':'Enshrouded Wiki map snapshot, 2026-11-16','locations':locations})
    write(DATA/'map-groups.json',groups)
    write(DATA/'marker-panels.json',{'schemaVersion':1,'markers':panels})
    for name,value in [('wiki-catalog.json',wiki),('crafting-catalog.json',crafting),('building-catalog.json',building),
        ('progression-catalog.json',progression),('marker-source-links.json',source_links),('wiki-map-links.json',wiki_links),
        ('material-locations.json',material_links)]:write(DATA/name,value)
    write(DATA/'wiki-page-index.json',[r['id'] for r in wiki['records']])
    write(DATA/'wiki-page-catalog-index.json',{r['id']:r['catalog'] for r in wiki['records']})
    write(DATA/'wiki-obtaining-index.json',{r['id']:r['obtaining'] for r in wiki['records'] if r.get('obtaining')})
    write(DATA/'progression-page-index.json',{g:[{'id':r['id'],'name':r['name'],**({'role':r['role']} if g=='npcs' else {})}
        for r in progression[g]] for g in ['quests','sets','npcs','setItems']})
    summary={'markers':len(locations),'retainedExistingIds':len(old_points),'newMarkers':len(locations)-len(old_points),'categories':len(groups),
        'refreshedWikiItems':len(refreshed),'newWikiItems':added,'questPages':len(read(SOURCE/'rendered-quests.json')),
        'panelsWithEntries':sum(bool(p['entries']) for p in panels.values()),'loreTranscripts':sum(bool(p['paragraphs']) for p in panels.values()),
        'unresolvedPrimaryEntries':len(unresolved),'deferredMarkersWithoutContent':len(deferred),
        'loreWithoutTranscript':len(lore_missing),'loreTranscripts':sum(any(r['kind']=='lore' for r in p['paragraphs']) for p in panels.values())}
    write(SOURCE/'build-summary.json',summary);print(json.dumps(summary,ensure_ascii=False,indent=2),flush=True)

if __name__=='__main__':main()
