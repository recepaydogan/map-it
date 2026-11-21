"""Capture versioned map assets and linked content for the reviewed map update.

Only research files are written. Cached responses make interrupted runs resumable.
"""
from pathlib import Path
import hashlib
import html
import json
import re
import time
from urllib.parse import unquote, urljoin, urlparse
import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
AUDIT = ROOT / 'research/wiki-map-comparison-2026-11-16'
OUT = ROOT / 'research/map-update-2026-11-16'
BASE = 'https://enshrouded.wiki.gg'
SESSION = requests.Session()
SESSION.headers['User-Agent'] = 'Mozilla/5.0 (compatible; EnshroudedContentResearch/1.0)'

def read(path):
    return json.loads(path.read_text(encoding='utf-8'))

def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

def request(url, **kwargs):
    for attempt in range(5):
        time.sleep(1.2)
        response = SESSION.get(url,timeout=60,**kwargs)
        if response.status_code == 429 or response.status_code >= 500:
            delay = min(60,max(30,int(response.headers.get('Retry-After','30'))))
            print('Server backoff',response.status_code,delay,flush=True)
            time.sleep(delay)
            continue
        response.raise_for_status()
        return response
    raise RuntimeError('Server remained unavailable: '+url)

def api(name, **params):
    path = OUT / 'responses' / (name+'.json')
    if path.exists():
        return read(path)
    result = request(BASE+'/api.php',params={'format':'json','formatversion':2,**params}).json()
    if result.get('error'):
        raise RuntimeError(result['error'])
    write(path,result)
    return result

def main():
    OUT.mkdir(parents=True,exist_ok=True)
    markers = read(AUDIT/'live-markers.json')
    titles = {row['title'] for row in read(AUDIT/'linked-page-comparison.json')}
    collectible_groups = {'Fossil','Music_Sheet','FlameMosaic','DrakRelief','Miniature_Model','Painting','Meteorite','Orrery','Hollow_Artifact',
        'QueenPikemeadStatuePiece','AlchemistWallHanging','CyclopsSkeleton','WallTapestry','DragonsMapPiece'}
    for marker in markers:
        if marker['layers'] in collectible_groups:
            titles.add(marker['name'])
    titles = sorted(titles)
    pages = {}; redirects = {}
    for offset in range(0,len(titles),40):
        result = api('pages-'+str(offset//40),action='query',prop='revisions',rvprop='ids|timestamp|content',rvslots='main',
            redirects=1,titles='|'.join(titles[offset:offset+40]))
        for field in ['normalized','redirects']:
            redirects.update({r['from']:r['to'] for r in result['query'].get(field,[])})
        for page in result['query']['pages']:
            pages[page['title']] = page
        write(OUT/'pages.json',pages);write(OUT/'redirects.json',redirects)
        print('Article source',min(offset+40,len(titles)),'/',len(titles),flush=True)

    extra_titles=sorted({m['name'] for m in markers if m['layers'].startswith('Fixed_')} - set(titles))
    for offset in range(0,len(extra_titles),40):
        batch=extra_titles[offset:offset+40]
        result=api('extra-items-'+hashlib.sha256('|'.join(batch).encode()).hexdigest()[:16],action='query',prop='revisions',
            rvprop='ids|timestamp|content',rvslots='main',redirects=1,titles='|'.join(batch))
        for field in ['normalized','redirects']:
            redirects.update({r['from']:r['to'] for r in result['query'].get(field,[])})
        for page in result['query']['pages']:pages[page['title']]=page
        write(OUT/'pages.json',pages);write(OUT/'redirects.json',redirects)
        print('Additional item pages',min(offset+40,len(extra_titles)),'/',len(extra_titles),flush=True)

    # Reviewed spelling variants and item pages behind generic map links.
    supplement = read(OUT/'item-candidate-pages.json')
    for page in supplement['query']['pages']:
        pages[page['title']] = page
    write(OUT/'pages.json',pages)

    # Render quest templates through MediaWiki, preserving objectives/rewards.
    quest_titles = sorted({m['article'].split('#')[0] for m in markers if m.get('article','').startswith('Quests/')})
    rendered = {}
    for title in quest_titles:
        canonical = redirects.get(title,title)
        if pages.get(canonical,{}).get('missing'):
            continue
        result = api('quest-'+hashlib.sha256(title.encode()).hexdigest()[:16],action='parse',page=title,prop='text|revid')
        rendered[title] = result['parse']
        write(OUT/'rendered-quests.json',rendered)
        print('Quest panels',len(rendered),'/',len(quest_titles),flush=True)

    # Every changed map asset is keyed by the full versioned URL, never filename alone.
    old = read(ROOT/'research/enshrouded-wiki/asset-manifest.json')['files']
    urls = {}
    configs = read(AUDIT/'live-config.json')['maps']
    for item in configs:
        for bg in item['config']['backgrounds']:
            for overlay in bg.get('overlays',[]):
                urls[urljoin(BASE,overlay['image'])] = 'terrain'
        for group in item['config']['groups'].values():
            if group.get('markerIcon'):
                urls[urljoin(BASE,group['markerIcon'])] = 'icon'
    for marker in markers:
        if marker.get('panelImage'):
            urls[marker['panelImage']['url']] = 'panel'

    # Item icons and lore screenshots missing from DataMaps are resolved separately.
    file_names = set()
    for title,page in pages.items():
        source = page.get('revisions',[{}])[0].get('slots',{}).get('main',{}).get('content','')
        match = re.search(r'^\s*\|\s*images\s*=\s*([^\n|]+)',source,re.I|re.M)
        if match:
            name = match[1].strip().replace('{{PAGENAME}}',title).replace('{{SUBPAGENAME}}',title.split('/')[-1])
            if re.search(r'\.(png|jpg|jpeg|webp)$',name,re.I):file_names.add(html.unescape(name).replace('_',' '))
        if title.startswith('Lore/'):
            for name in re.findall(r'(?:File:|Image:)([^\n|\]]+\.(?:png|jpg|jpeg|webp))',source,re.I):
                file_names.add(name.replace('_',' ').strip())
    images = {}
    for offset in range(0,len(file_names),40):
        batch = sorted(file_names)[offset:offset+40]
        result = api('images-'+hashlib.sha256('|'.join(batch).encode()).hexdigest()[:16],action='query',prop='imageinfo',iiprop='url|sha1|size',iiurlwidth=640,titles='|'.join('File:'+n for n in batch))
        for page in result['query']['pages']:
            info = page.get('imageinfo',[{}])[0]
            if info:
                images[page['title'].removeprefix('File:')] = info
        write(OUT/'images.json',images)
        print('Article image metadata',min(offset+40,len(file_names)),'/',len(file_names),flush=True)
    # Download only item icons not already bundled plus new lore images needed by new pins.
    icon_names = set()
    catalogs = read(ROOT/'public/data/enshrouded/wiki-catalog.json')['records']
    known_icons = {r['id'].casefold():r.get('icon') for r in catalogs}
    missing_marker_ids = {m['id'] for m in read(AUDIT/'missing-after-aliases.json')}
    new_lore_titles = {m.get('article','').split('#')[0] for m in markers if m['id'] in missing_marker_ids and m['layers'].startswith('Lore')}
    for title,page in pages.items():
        source = page.get('revisions',[{}])[0].get('slots',{}).get('main',{}).get('content','')
        match = re.search(r'^\s*\|\s*images\s*=\s*([^\n|]+)',source,re.I|re.M)
        if match and not known_icons.get(title.casefold()):
            icon_names.add(html.unescape(match[1].strip().replace('{{PAGENAME}}',title).replace('{{SUBPAGENAME}}',title.split('/')[-1])).replace('_',' '))
        if title in new_lore_titles:
            icon_names.update(n.replace('_',' ').strip() for n in re.findall(r'(?:File:|Image:)([^\n|\]]+\.(?:png|jpg|jpeg|webp))',source,re.I))
    for name in icon_names:
        info = images.get(name)
        if info:urls[info.get('thumburl') or info['url']] = 'article'
    manifest_path = OUT/'asset-manifest.json'
    manifest = read(manifest_path) if manifest_path.exists() else {}
    for index,(url,kind) in enumerate(urls.items(),1):
        if url in manifest and (ROOT/manifest[url]['path']).is_file():continue
        old_row = old.get(url)
        old_path = ROOT/'research/enshrouded-wiki'/old_row['path'] if old_row else None
        if old_path and old_path.is_file() and hashlib.sha256(old_path.read_bytes()).hexdigest()==old_row['sha256']:
            target = old_path
        else:
            suffix = Path(unquote(urlparse(url).path)).suffix.lower()
            target = OUT/'assets'/(hashlib.sha256(url.encode()).hexdigest()[:20]+suffix)
            if not target.exists():
                response = request(url)
                if not response.headers.get('Content-Type','').startswith('image/'):
                    raise RuntimeError('Expected image: '+url)
                target.parent.mkdir(parents=True,exist_ok=True)
                target.write_bytes(response.content)
        payload = target.read_bytes()
        manifest[url] = {'path':target.relative_to(ROOT).as_posix(),'sha256':hashlib.sha256(payload).hexdigest(),'kind':kind}
        write(manifest_path,manifest)
        if index%10==0:print('Assets',index,'/',len(urls),flush=True)
    print('Captured',len(pages),'article pages,',len(rendered),'quest panels,',len(manifest),'assets',flush=True)

if __name__ == '__main__':main()
