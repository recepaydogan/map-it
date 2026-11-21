"""Capture the same public world-map snapshot in the supported languages."""
from pathlib import Path
import json, re, time, urllib.request

OUT=Path(__file__).resolve().parents[1]/'data/site-research/update-2026-11-16'
OUT.mkdir(parents=True,exist_ok=True)
for code,lang in [('deDE','de'),('esES','es'),('esMX','mx'),('frFR','fr'),('koKR','ko'),('ptBR','pt'),('zhCN','cn'),('zhTW','tw')]:
    path=OUT/f'world-map-{code}.json'
    if path.exists():continue
    url=f'https://nether.wowhead.com/forever/{lang}/data/world-map'
    try:
        raw=urllib.request.urlopen('https://r.jina.ai/'+url,timeout=50).read().decode()
        data={m[1]:json.loads(m[2]) for line in raw.splitlines() if (m:=re.fullmatch(r'WH.setPageData\("wow.worldMap.classicplus.([^\"]+)",(.*)\);',line))}
        if not data.get('pois') or not data.get('categories'):raise ValueError('Incomplete world-map response')
        path.write_text(json.dumps({'url':url,'locale':code,'data':data},ensure_ascii=False),encoding='utf8')
        print(code,len(data['pois']),flush=True)
    except Exception as e:print(code,'FAILED',str(e),flush=True)
    time.sleep(4)
