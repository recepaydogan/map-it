"""Merge reviewed public map observations without deleting unverified old spawns."""
from pathlib import Path
import collections, copy, json, math, re, time

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'data/site-research/update-2026-11-16'
LANGUAGES = dict(zip(['de','es','es-MX','fr','ko','pt-BR','zh-Hans','zh-Hant'], ['deDE','esES','esMX','frFR','koKR','ptBR','zhCN','zhTW']))
def read(path): return json.loads((ROOT/path).read_text(encoding='utf-8-sig'))
def baseline(path):
    p=OUT/'before'/path
    return json.loads(p.read_text(encoding='utf-8-sig')) if p.exists() else read(path)
def save(path, data):
    target = ROOT/path
    if target.exists() and read(path) == data: return
    backup = OUT/'before'/path
    backup.parent.mkdir(parents=True, exist_ok=True)
    if not backup.exists(): backup.write_bytes(target.read_bytes() if target.exists() else b'null\n')
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary=target.with_name(target.name+'.nov16.tmp')
    temporary.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf8')
    for attempt in range(10):
        try:temporary.replace(target);break
        except PermissionError:
            if attempt==9:raise
            time.sleep(.3)
def source():
    return {m[1]:json.loads(m[2]) for line in (ROOT/'data/site-research/marker-audit-2026-11-16/world-map.js').read_text(encoding='utf8').splitlines()
            if (m:=re.fullmatch(r'WH.setPageData\("wow.worldMap.classicplus.([^\"]+)",(.*)\);',line))}
S=source()
A=read('public/maps/world-atlas/metadata.json')
zones=[p for p in S['places'] if p.get('kind') in ['zone','capital'] and p.get('rect') and p.get('uiMap')]
def project(x,y):
    c=next(c for c in S['config']['continents'] if c['canvasX']<=x<c['canvasX']+c['width'] and c['canvasY']<=y<c['canvasY']+c['height'])
    layer=next(l for l in A['terrainLayers'] if l['source'].get('mapId')==c['map'])
    dx,dy=x-c['canvasX'],y-c['canvasY']
    if layer['source'].get('placement')=='overview-inset':
        dx+=(c['originCol']-layer['source']['grid']['minX'])*c['pxPerChunk'];dy+=(c['originRow']-layer['source']['grid']['minY'])*c['pxPerChunk']
    contains=lambda z:z['rect'][0][0]<=x<=z['rect'][1][0] and z['rect'][0][1]<=y<=z['rect'][1][1]
    candidates=sorted([z for z in zones if contains(z)],key=lambda z:(z['rect'][1][0]-z['rect'][0][0])*(z['rect'][1][1]-z['rect'][0][1]))
    if not candidates: raise ValueError(f'No verified zone: {x}, {y}')
    z=candidates[0]
    raster=next((r for r in S['zones'] if r['map']==c['map']),None)
    if raster:
        row=math.floor((y-raster['y'])/raster['cell']);col=math.floor((x-raster['x'])/raster['cell'])
        span=next((s for s in raster['rows'] if s[0]==row),[])
        for i in range(1,len(span)-2,2):
            if span[i]<=col<span[i+2]:
                z=next((v for v in candidates if v.get('area')==span[i+1]),z);break
    return dict(x=round(layer['originX']+dx*layer['scaleX'],3),y=round(layer['originY']+dy*layer['scaleY'],3),regionId='',region=z['name'],
                referenceCoordinates=dict(x=round((x-z['rect'][0][0])/(z['rect'][1][0]-z['rect'][0][0])*100,3),y=round((y-z['rect'][0][1])/(z['rect'][1][1]-z['rect'][0][1])*100,3)))

def main():
    prefix='public/maps/world-atlas/'
    inventory=read('data/site-research/marker-audit-2026-11-16/local-marker-inventory.json')
    files={f:baseline(prefix+f) for f in inventory['files']}
    file_ids={f:{p['id'] for p in d['locations']} for f,d in files.items()}
    all_points=[p for d in files.values() for p in d['locations']]+A.get('locations',[])
    by_npc=collections.defaultdict(list)
    by_name=collections.defaultdict(list);english_ui=read('src/i18n/locales/en.json')
    for p in all_points:
        name=p.get('name')
        if not name and p.get('nameKey'):
            name=english_ui
            for key in p['nameKey'].split('.'):name=name.get(key,{}) if isinstance(name,dict) else {}
        if isinstance(name,str) and name:by_name[name.casefold()].append(p)
        if p.get('entityId') and not p['category'].startswith('gatherable-') and p['category'] not in ['book','ley-line','elemental-convergence']:
            by_npc[str(p['entityId'])].append(p)
    added=collections.Counter(); changed=collections.Counter(); identities={}; quest_names={}; exclusions=[]
    def append(file,p):
        if p['id'] in file_ids[file]: return
        file_ids[file].add(p['id'])
        files[file]['locations'].append(p);all_points.append(p);added[p['category']]+=1
        if p.get('entityId') and not p['category'].startswith('gatherable-'): by_npc[p['entityId']].append(p)
    def point(p,category=None):
        cat=category or p['category']
        return dict(id=f"forever-20261116-{p['category']}-{p.get('npc','point')}-{round(p['x']*10)}-{round(p['y']*10)}",name=p['name'],category=cat,label='',subtype=p['category'],**({'entityId':str(p['npc'])} if p.get('npc') else {}),**project(p['x'],p['y']))
    for p in S['pois']:
        if p.get('npc'):identities[str(p['npc'])]=p['name']
        cat=p['category']; npc=str(p.get('npc','')); existing=by_npc.get(npc,[])
        if npc:
            matches=[v for v in by_name.get(p['name'].casefold(),[]) if (not v.get('entityId') or v['entityId']==npc) and not v['category'].startswith('gatherable-')]
            try:pos=project(p['x'],p['y'])
            except ValueError:pos=None
            # Exact identity and a nearby existing named marker, not generic role names.
            for v in matches:
                if pos and (len(matches)==1 or math.hypot(v['x']-pos['x'],v['y']-pos['y'])<150) and v not in existing:
                    v['entityId']=npc;by_npc[npc].append(v)
            existing=by_npc.get(npc,[])
        if cat in ['rare','rare-elite'] and npc in ['249238','256830','263935','1063'] and not any(v['category']==cat for v in existing):
            append('locations-forever-all-rares.json',point(p))
        elif cat.startswith('hunter-pet-'):
            if npc=='165189':exclusions.append({'npc':npc,'reason':'Generic Hunter Pet placeholder'});continue
            pets=[v for v in existing if v['category'].startswith('hunter-pet-')]
            if not pets:
                q=point(p);q['labelKey']='map.hunterPets.'+cat.removeprefix('hunter-pet-')
                if p.get('levels'):q['petLevels']=str(p['levels'])
                # Family abilities are not inferred from an unrelated creature.
                append('locations-forever-hunter-pets.json',q)
            elif npc in ['258922','259263','263315','266862'] and p.get('levels'):
                for q in pets:
                    if q.get('petLevels')!=str(p['levels']):q['petLevels']=str(p['levels']);changed['petLevels']+=1
        elif cat in ['ley-line','elemental-convergence']:
            q=point(p)
            if not any(v['category']==cat and math.hypot(v['x']-q['x'],v['y']-q['y'])<2 for v in all_points):append('locations-forever-all-updates.json',q)
        elif cat=='vendor':
            # Preserve a single existing NPC identity when it already has another role.
            if not existing:append('locations-forever-vendors.json',point(p,'merchant'))
        elif cat in ['innkeeper','stable-master','banker','auctioneer','battlemaster'] or cat.startswith(('class-trainer-','profession-trainer-')):
            kind='class-trainer' if cat.startswith('class-trainer-') else 'profession-trainer' if cat.startswith('profession-trainer-') else cat
            if not any(v['category']==kind for v in existing):
                q=point(p,kind)
                if cat.startswith('profession-trainer-'):q['trainerTitleKey']='map.professionTrainerTypes.'+cat.removeprefix('profession-trainer-')
                if cat.startswith('class-trainer-'):q.update(trainerClass=cat.removeprefix('class-trainer-').title())
                if p.get('side') in [1,2]:q['trainerFaction']=['Neutral','Alliance','Horde'][p['side']]
                append('locations-forever-all-new-trainers.json' if kind.endswith('trainer') else 'locations-forever-all-updates.json',q)

    # Source observations add locations; absence in this snapshot is not a removal.
    cats={c['key']:c for c in S['categories']}
    for node in S['nodes']:
        cat=cats[node['category']];group=cat['group']
        file='locations-forever-all-gatherables.json' if group in ['herbalism','mining'] else 'locations-forever-all-new-gathering.json'
        old=[p for p in files[file]['locations'] if p['subtype']==node['category']]
        buckets=collections.defaultdict(list)
        for p in old:buckets[(int(p['x']//2),int(p['y']//2))].append(p)
        for coords in node['points']:
            pos=project(*coords[:2])
            bx,by=int(pos['x']//2),int(pos['y']//2)
            nearby=[p for dx in [-1,0,1] for dy in [-1,0,1] for p in buckets.get((bx+dx,by+dy),[])]
            if any(math.hypot(p['x']-pos['x'],p['y']-pos['y'])<2 for p in nearby):continue
            q=dict(id=f"forever-20261116-{node['category']}-{round(coords[0]*10)}-{round(coords[1]*10)}",name=cat['name'],category='gatherable-'+node['category'],label='',subtype=node['category'],iconPath=f"data/items/site-icons/{cat['image']}.jpg",**pos)
            q['itemId' if cat.get('item') else 'entityId']=str(cat.get('item') or cat['object'])
            if len(coords)>3 and coords[3]:q['droppedBy']=[dict(id=str(v[0]),name=v[1]) for v in coords[3]]
            append(file,q);old.append(q);buckets[(bx,by)].append(q)

    details=baseline('public/data/quests/quest-details.json')
    quest_file=files['locations-forever-all-quests.json'];quest_pairs={(p.get('questGiverMarkerId'),p.get('questId')):p for p in quest_file['locations']}
    for p in S['pois']:
        if not p.get('quests'):continue
        pos=project(p['x'],p['y']);npc=str(p.get('npc',''))
        givers=[v for v in by_npc.get(npc,[]) if v.get('questOffers')]
        giver=min(givers,key=lambda v:math.hypot(v['x']-pos['x'],v['y']-pos['y'])) if givers else None
        offers=[q for q in p['quests'] if not re.search(r'NYI|<TXT>|\[DNT\]|\[PH\]|Deprecated|Test Quest',q[1],re.I)]
        exclusions.extend({'quest':str(q[0]),'reason':'Unreleased/test title'} for q in p['quests'] if q not in offers)
        if not offers:continue
        if not giver:
            giver=point(p,'npc');giver['questOffers']=[];giver['questInfo']={'faction':['Neutral','Alliance','Horde'][p.get('side',0)]}
            append('locations-forever-all-new-quest-givers.json',giver)
        kind='dungeon' if p['category']=='dungeon-quest-giver' else 'repeatable' if p['category']=='repeatable-quest-giver' else 'normal'
        for qid,title,level,*_ in offers:
            qid=str(qid);quest_names[qid]=title
            offer=next((q for q in giver['questOffers'] if q['id']==qid),None)
            if not offer:
                offer=dict(id=qid,name=title,level=level,kind=kind);giver['questOffers'].append(offer);changed['questOffersAdded']+=1
            elif qid in ['5214','3518','98070','98155']:
                if (offer['name'],offer['level'])!=(title,level):changed['questOffersUpdated']+=1
                offer.update(name=title,level=level)
            if qid not in details['quests']:
                details['quests'][qid]=dict(id=qid,title=title,level=level,startsAt=giver['name'],faction=giver.get('questInfo',{}).get('faction','Neutral'))
                changed['questDetailsAdded']+=1
            elif qid in ['5214','3518','98070','98155']:details['quests'][qid].update(title=title,level=level)
            pair=(giver['id'],qid)
            if pair not in quest_pairs:
                q=dict(id=f"forever-all-quest-{qid}-{giver['id']}",name=offer['name'],category={'normal':'quest','dungeon':'dungeon-quest','repeatable':'repeatable-quest'}[offer['kind']],label='',subtype='forever-all-quest',questId=qid,questLevel=offer['level'],questGiverMarkerId=giver['id'],questGiverName=giver['name'],questInfo=giver.get('questInfo',{}),**{k:giver[k] for k in ['x','y','regionId','region','referenceCoordinates']})
                append('locations-forever-all-quests.json',q);quest_pairs[pair]=q
            else:
                q=quest_pairs[pair];q.update(name=offer['name'],questLevel=offer['level'])
            details['markerQuestIds'][quest_pairs[pair]['id']]=qid
    save('public/data/quests/quest-details.json',details)

    # Add captured panel facts without replacing complete loot tables with previews.
    rare=baseline('public/data/rares/details.json');entries={str(e['id']):e for e in rare['entries']}
    items={i['id']:i for i in read('public/data/items/catalog.json')['items']}
    for cap in read('data/site-research/marker-audit-2026-11-16/panel-captures.json'):
        nid=str(cap['params'].get('id'));d=cap.get('response',{}).get('details') or {}
        if cap['params'].get('type')!='npc' or (nid not in entries and nid not in ['249238','256830','263935','1063']):continue
        if nid not in entries:
            entry={'id':int(nid),'classification':d.get('classification','').lower(),'type':d.get('type','').lower(),'drops':[]}
            if str(d.get('level','')).isdigit():entry['level']=int(d['level'])
            rare['entries'].append(entry);entries[nid]=entry
        entry=entries[nid];known={v['id'] for v in entry.get('drops',[])}
        for drop in d.get('drops',[]):
            if str(drop['id']) in known:continue
            new=dict(id=str(drop['id']),name=drop['name'],icon=f"data/items/site-icons/{drop['icon']}.jpg",inItemCatalog=str(drop['id']) in items)
            if 'chance' in drop:new['percent']=drop['chance']
            entry.setdefault('drops',[]).append(new);changed['rareDropsAdded']+=1
    save('public/data/rares/details.json',rare)

    # Names are joined by numeric identity, never by translated name or list position.
    locale_coverage={}
    for app,locale in LANGUAGES.items():
        localized=read(f'data/site-research/update-2026-11-16/world-map-{locale}.json')
        lp=localized['data']['pois']; ln={str(p['npc']):p['name'] for p in lp if p.get('npc')};lq={str(q[0]):q[1] for p in lp for q in p.get('quests',[])}
        for filename,field,english,translated in [('marker-creature','creatures',identities,ln),('quest-offer','quests',quest_names,lq)]:
            path=f'public/data/locales/wow-forever/{filename}-{locale}.json';pack=read(path)
            count=0
            for key,name in english.items():
                value=translated.get(key)
                if value and value!=name and not value.startswith('['):
                    pack[field][key]={'english':name,'name':value,'url':localized['url']};count+=1
            save(path,pack);locale_coverage.setdefault(locale,{})[field]=count
        ui=read(f'src/i18n/locales/{app}.json');lc={c['key']:c['name'] for c in localized['data']['categories']}
        for key in ['ore-heavy-thorium-vein','fish-whimsyfin']:ui['map']['gatherableTypes'][key]=lc[key]
        save(f'src/i18n/locales/{app}.json',ui)
    ui=read('src/i18n/locales/en.json')
    for key in ['ore-heavy-thorium-vein','fish-whimsyfin']:ui['map']['gatherableTypes'][key]=cats[key]['name']
    save('src/i18n/locales/en.json',ui)
    for file,data in files.items():
        assert len({p['id'] for p in data['locations']})==len(data['locations']),file
        save(prefix+file,data)
    # Search data must expose the same additions and changed offer titles.
    search=baseline('public/data/map-search/index.json');points={p['id']:p for p in all_points};seen=set()
    for entry in search['locations']:
        key=entry['point']['id'];seen.add(key)
        if key in points:entry['point'].update({k:v for k,v in points[key].items() if k!='droppedBy'})
    for key,p in points.items():
        if key not in seen and key.startswith('forever-'):
            search['locations'].append(dict(mapId='azeroth',mapName='Azeroth',point={k:v for k,v in p.items() if k!='droppedBy'},count=1))
    search['source']['markerCount']=len(search['locations']);save('public/data/map-search/index.json',search)
    report=dict(added=dict(added),changed=dict(changed),localeCoverage=locale_coverage,excluded=exclusions,
                rule='Additive observed map locations, not an assertion that each is a new game spawn. Existing unconfirmed positions are retained. Generic pet and NYI quests excluded.')
    (OUT/'map-merge-result.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
    print(json.dumps(report,ensure_ascii=True))

if __name__=='__main__':main()
