"""Join captured quest objectives, locale packs and searchable marker details."""
from pathlib import Path
import importlib.util, json, re, collections
from bs4 import BeautifulSoup
spec=importlib.util.spec_from_file_location('content',Path(__file__).with_name('apply-november-16-content.py'))
c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
ROOT,OUT,read,save=c.ROOT,c.OUT,c.read,c.save

def objective(tip):
    soup=BeautifulSoup(tip['tooltip'],'html.parser');tables=soup.find_all('table',recursive=False)
    if len(tables)<2:return ''
    body=tables[-1]
    # The localized Requirements heading and its bullets are separate from the objective.
    heading=body.find('span',class_='q')
    requirements=''
    if heading:
        requirements=''.join(str(n) for n in heading.next_siblings)
        for following in list(heading.next_siblings):following.extract()
        heading.extract()
    for br in body.find_all('br'):br.replace_with('\n')
    text=re.sub(r'[ \t]+',' ',body.get_text()).strip()
    if text:return text
    # Some repeatable quests supply only an explicit checklist. Show that exact
    # checklist rather than inventing a narrative or leaving an empty panel.
    required=BeautifulSoup(requirements,'html.parser')
    for br in required.find_all('br'):br.replace_with('\n')
    return '\n'.join(line.strip().removeprefix('- ').strip() for line in required.get_text().splitlines() if line.strip())

def main():
    for id in ['408120','1238214','1238215']:
        path=f'public/data/spells/foreverdb/{int(id)%64}.json';data=read(path)
        spell=data[id]
        assert spell['n']=='Wild Growth' and spell['sp'] in [.033,.066]
        spell['sp']=.066
        for effect in spell.get('ef',[]):
            if effect.get('sp')==.033:effect['sp']=.066
        save(path,data)
    details=read('public/data/quests/quest-details.json');captured=[];mismatch=[]
    for file in (OUT/'pages').glob('quest-*-enUS.txt'):
        id=file.name.split('-')[1];tip=c.tooltip('quest',id);text=objective(tip) if tip else ''
        if not tip or not text:continue
        row=details['quests'].get(id)
        if row and not (row['title']==tip['name'] or row['title'].startswith(tip['name']+' (')):
            mismatch.append(id);continue
        if not row:
            if id!='96335':continue
            row={'id':id,'title':tip['name'],'level':53};details['quests'][id]=row
        row['title']=tip['name'];row['objective']=text;captured.append(id)
    # The live quest page independently confirms Ezra in the unchanged narrative.
    row=details['quests']['5214']
    row['description']=row.get('description','').replace('Fras','Ezra')
    save('public/data/quests/quest-details.json',details)

    # Invalidate old Fras Siabi prose before adding current localized objectives.
    base='public/data/locales/wow-forever/'
    invalidated={'5214:objective','5214:description','96076:objective','96335:objective'}
    source=read(base+'quest-text-source.json');indices=[i for i,k in enumerate(source['keys']) if k in invalidated]
    for i in indices:
        id,field=source['keys'][i].split(':');source['values'][i]=details['quests'][id][field]
    save(base+'quest-text-source.json',source)
    for locale in c.LOCALES.values():
        path=base+f'quest-text-{locale}.json';pack=read(path)
        for i in indices:pack['values'][i]=None
        save(path,pack)
    fallback=ROOT/(base+'quest-text-app-fallbacks.json')
    if fallback.exists():
        data=read(base+'quest-text-app-fallbacks.json')
        for values in data.get('locales',{}).values():
            for key in invalidated:values.pop(key,None)
        save(base+'quest-text-app-fallbacks.json',data)
    for file in [*(ROOT/base).glob('quest-prose-wowhead*.json'),*(ROOT/base).glob('quest-objective-wowhead-*.json')]:
        data=read(file)
        for key in invalidated:
            id,field=key.split(':');entry=data.get('quests',{}).get(id)
            if not entry:continue
            entry['english'].pop(field,None)
            for values in entry.get('locales',{}).values():values.pop(field,None)
            if not entry['english']:del data['quests'][id]
        save(str(file.relative_to(ROOT)),data)

    translations={};stale=[]
    prefixes=dict(zip(c.LOCALES.values(),['de','es','mx','fr','ko','pt','cn','tw']))
    for locale in c.LOCALES.values():
        pack_path=base+f'quest-prose-wowhead-{locale}.json';pack=read(pack_path)
        name_path=base+f'quest-offer-{locale}.json';names=read(name_path)
        names['quests'].pop('5214',None)
        for id in ['5214','96335','96076']:
            tip=c.tooltip('quest',id,locale);en=c.tooltip('quest',id)
            if not tip or not en:continue
            value=objective(tip);english=details['quests'][id]['objective']
            # Several localized Wowhead caches still refer to the removed NPC identity.
            obsolete=id=='5214' and re.search(r'Fras|Siabi|프라스|샤비|弗拉斯|希亚比|希亞比',tip['name']+' '+value,re.I)
            if obsolete:stale.append({'quest':id,'locale':locale});continue
            if tip['name']!=en['name'] and not tip['name'].startswith('['):
                names['quests'][id]={'english':en['name'],'name':tip['name'],'url':f'https://nether.wowhead.com/forever/{prefixes[locale]}/tooltip/quest/{id}'}
            if value and value!=english and not value.startswith('['):
                entry=pack['quests'].setdefault(id,{'sourceUrl':f'https://www.wowhead.com/forever/quest={id}','localeUrls':{},'english':{},'locales':{}})
                entry['localeUrls'][locale]=f'https://www.wowhead.com/forever/{prefixes[locale]}/quest={id}'
                entry['english']['objective']=english;entry['locales'].setdefault(locale,{})['objective']=value
                translations.setdefault(locale,[]).append(id)
        # Canonical quest names have no map-only parenthesized dungeon suffix.
        for id in captured:
            value=names['quests'].get(id)
            if value and value['english'].startswith(details['quests'][id]['title']+' ('):
                suffix=value['english'][len(details['quests'][id]['title']):]
                value['english']=details['quests'][id]['title']
                if value['name'].endswith(suffix):value['name']=value['name'][:-len(suffix)]
        save(name_path,names);save(pack_path,pack)

    files=read('data/site-research/marker-audit-2026-11-16/local-marker-inventory.json')['files']
    points=[]
    for file in files:
        path='public/maps/world-atlas/'+file;data=read(path)
        for p in data['locations']:
            id=p.get('questId')
            if id in captured:p['name']=details['quests'][id]['title']
            for offer in p.get('questOffers',[]):
                if offer['id'] in captured:offer['name']=details['quests'][offer['id']]['title']
                if offer['id']=='96076':offer['kind']='repeatable'
            if id=='96076':p['category']='repeatable-quest'
            points.append(p)
        save(path,data)
    rares=read('public/data/rares/details.json')
    catalog={i['id'] for i in read('public/data/items/catalog.json')['items']}
    for entry in rares['entries']:
        if entry.get('classification')=='rare elite':entry['classification']='rare-elite'
        if entry['id'] in [249238,256830,263935,1063]:entry['partial']=True
        for drop in entry.get('drops',[]):
            if drop['id'] in catalog:drop['inItemCatalog']=True
    save('public/data/rares/details.json',rares)

    # Rebuild gathering links, retaining all reviewed and legacy observations.
    groups={}
    for p in points:
        if not p['category'].startswith('gatherable-') or not p.get('itemId'):continue
        item=groups.setdefault(p['itemId'],dict(group=p['subtype'].split('-')[0],regions={},creatures={}))
        region=item['regions'].setdefault(p['region'],dict(name=p['region'],markerId=p['id'],count=0));region['count']+=1
        for creature in p.get('droppedBy',[]):
            row=item['creatures'].setdefault(creature['id'],dict(id=creature['id'],name=creature['name'],regions=[]))
            if p['region'] not in row['regions']:row['regions'].append(p['region'])
    gathering=read('public/data/items/forever-gathering-sources.json')
    for id,row in groups.items():row['regions']=sorted(row['regions'].values(),key=lambda v:(-v['count'],v['name']));row['creatures']=list(row['creatures'].values());gathering['items'][id]=row
    save('public/data/items/forever-gathering-sources.json',gathering)
    trainers=read('public/data/professions/map-trainers.json');known={v['markerId'] for v in trainers['trainers']}
    for p in points:
        if p['id'].startswith('forever-20261116') and p['category']=='profession-trainer' and p['id'] not in known:
            trainers['trainers'].append(dict(profession=p['subtype'].removeprefix('profession-trainer-'),markerId=p['id'],npc=int(p['entityId']),n=p['name'],zone=p['region'],**({'side':p['trainerFaction']} if p.get('trainerFaction') else {})))
    save('public/data/professions/map-trainers.json',trainers)
    search=read('public/data/map-search/index.json');by_id={p['id']:p for p in points}
    for entry in search['locations']:
        p=by_id.get(entry['point']['id'])
        if p:entry['point'].update({k:v for k,v in p.items() if k!='droppedBy'})
    save('public/data/map-search/index.json',search)
    for app in c.LOCALES:
        path=f'src/i18n/locales/{app}.json';ui=read(path)
        value=ui['map']['gatherableTypes']['ore-heavy-thorium-vein']
        if value.startswith('['):ui['map']['gatherableTypes']['ore-heavy-thorium-vein']=value.strip('[]')
        save(path,ui)
    expected={str(q[0]) for q in read('data/site-research/marker-audit-2026-11-16/comparison.json')['missingQuestDetails']}
    missing=[q['id'] for q in details['quests'].values() if q['id'] in expected and not q.get('objective')]
    report={'capturedObjectives':len(captured),'identityMismatches':mismatch,'missingObjectives':missing,'localizedKeyObjectives':translations,'rejectedStaleLocaleTitles':stale,'fullQuestNarratives':'Not supplied by the world-map/tooltip endpoint; no invented narratives or rewards.'}
    (OUT/'quest-result.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(report,ensure_ascii=True))

if __name__=='__main__':main()
