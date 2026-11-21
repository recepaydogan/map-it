"""Apply independently captured item hotfixes and contextual guide translations."""
from pathlib import Path
import html, json, re
from bs4 import BeautifulSoup
import importlib.util
spec=importlib.util.spec_from_file_location('merge',Path(__file__).with_name('apply-november-16-map-update.py'))
merge=importlib.util.module_from_spec(spec);spec.loader.exec_module(merge)
ROOT,OUT,read,save,baseline=merge.ROOT,merge.OUT,merge.read,merge.save,merge.baseline
LOCALES=merge.LANGUAGES

def tooltip(kind,id,locale='enUS'):
    p=OUT/f'pages/{kind}-{id}-{locale}.txt'
    if not p.exists():return None
    try:return json.loads(p.read_text(encoding='utf8').split('Markdown Content:',1)[1])
    except (ValueError,IndexError):return None

def effects(tip):
    soup=BeautifulSoup(tip['tooltip'],'html.parser');result=[]
    for span in soup.select('span.q2'):
        if span.find_parent('span',class_='q2'):continue
        value=span.get_text(' ',strip=True)
        # Keep the actual effect, without localized Use/Equip prefixes.
        value=re.sub(r'^[^:：]{1,25}[:：]\s*','',value)
        if not value:continue
        result.append(value)
    return result

def item_update():
    catalog=read('public/data/items/catalog.json');items={i['id']:i for i in catalog['items']}
    enrichment=read('public/data/items/foreverdb-enrichment.json')
    changed=[];effect_pairs={l:{} for l in LOCALES.values()};names={}
    for file in sorted((OUT/'pages').glob('item-*-enUS.txt')):
        id=file.name.split('-')[1];tip=tooltip('item',id)
        if not tip:continue
        original=items.get(id)
        item=json.loads(json.dumps(original)) if original else dict(id=id,name=tip['name'],category='Armor · Miscellaneous',grade={0:'Poor',1:'Common',2:'Uncommon',3:'Rare',4:'Epic'}[tip['quality']],icon=f"data/items/site-icons/{tip['icon']}.jpg",nameVerified=True,forever=True,sections=[],enhancements=[],hasReference=False)
        raw=tip['tooltip'];plain=BeautifulSoup(raw,'html.parser').get_text(' ',strip=True)
        item['name']=tip['name'];item['source']='wowhead-2026-11-16'
        price=BeautifulSoup(raw,'html.parser').select_one('.whtt-sellprice')
        if price:
            copper=sum(int(part.get_text(strip=True))*factor for cls,factor in [('moneygold',10000),('moneysilver',100),('moneycopper',1)] for part in price.select('.'+cls))
            item.setdefault('clientDetails',{})['sellPriceCopper']=copper
        for field,pattern in [('itemLevel',r'Item Level\s+(\d+)'),('usageLevel',r'Requires Level\s+(\d+)')]:
            match=re.search(pattern,plain)
            if match:item[field]=int(match[1])
        stats=[dict(s) for section in item.get('sections',[]) for s in section.get('stats',[])]
        def set_stat(label,value):
            nonlocal stats
            stats=[s for s in stats if s['label']!=label]
            stats.append(dict(key='nov16-'+re.sub(r'[^a-z0-9]+','-',label.lower()),label=label,value=value))
        if id=='272407':stats=[s for s in stats if s['label']!='Hit Rating']
        elif id=='272406':
            stats=[s for s in stats if s['label']!='Spirit'];set_stat('Spell Power','+9')
        elif id=='260212':
            stats=[s for s in stats if s['label'] not in ['Shadow Spell Damage','Shadow Damage Done']];set_stat('database.clientItem.stat.armor','65')
        elif id in ['272068','272069','272070','272071']:
            for s in stats:
                if 'mana' in s['label'].lower():s['value']='+'+{'272068':'4','272069':'3','272070':'3','272071':'2'}[id]
        elif id=='284097':
            item['slot']='Neck';set_stat('Stamina','+13');set_stat('Spirit','+14');set_stat('Hit Rating','+10')
        elif id=='274749':item['slot']='Neck';set_stat('Stamina','+10')
        elif id=='2915':
            item.update(category='Weapon · Two-Handed Mace',slot='Two-Hand')
            item.setdefault('clientDetails',{}).update(inventoryType=17,itemDelayMs=3800,bonding=2)
            set_stat('Stamina','+14');set_stat('database.clientItem.damage','151–227');set_stat('database.clientItem.dps','49.74')
        elif id=='282007':
            item.update(category='Weapon · Staff',slot='Two-Hand')
            item.setdefault('clientDetails',{}).update(inventoryType=17,itemDelayMs=3000,bonding=1)
            set_stat('Intellect','+19');set_stat('Spirit','+19');set_stat('Spell Power','+56')
            set_stat('database.clientItem.damage','76–114');set_stat('database.clientItem.dps','31.67')
        elif id=='279471':item.update(category='Miscellaneous · Other',clientDetails={'bonding':1})
        if id=='10418':
            # This trinket requires Blacksmithing, not proficiency in Mail.
            item['category']='Armor · Miscellaneous';item['slot']='Trinket'
            set_stat('Armor','+100')
            item.setdefault('clientDetails',{})['requiredProfession']={'id':'blacksmithing','skill':225}
            for key in ['requiredArmor','requiredArmorType','armorRequirement']:
                item.get('clientDetails',{}).pop(key,None)
        item['sections']=[{'key':'base','stats':stats}] if stats else []
        english_effects=effects(tip)
        if id in ['867','10418','279471','2915','274749'] or id.startswith('27207') or id in ['272068','272069']:
            selected=english_effects
            if id=='867':selected=[s for s in selected if 'when landing a harmful' in s]
            if id in ['272068','272069','272070','272071']:selected=[s for s in selected if 'mana per 5 sec' in s]
            if id=='274749':selected=[s for s in selected if 'health per 5 sec' in s]
            if id=='2915':selected=[s for s in selected if 'Hurls a fiery ball' in s or 'Two-Handed Maces' in s]
            item['siteEffects']=[{'kind':'use' if id in ['10418','279471'] else 'equip','text':s} for s in selected]
        entry=enrichment['entries'].get(id)
        if entry:
            if 'stats' in entry:entry['stats']=stats
            if 'stats' in entry.get('current',{}):entry['current']['stats']=stats
        if not original:catalog['items'].append(item)
        else:original.clear();original.update(item)
        changed.append(id);names[id]={'english':tip['name'],'locales':{}}
        for locale in LOCALES.values():
            localized=tooltip('item',id,locale)
            if not localized:continue
            name=localized['name']
            if name and not name.startswith('['):names[id]['locales'][locale]=name
            localized_effects=effects(localized)
            if len(localized_effects)!=len(english_effects):continue
            for en,value in zip(english_effects,localized_effects):
                if value!=en and not value.startswith('['):effect_pairs[locale][en]=value
    save('public/data/items/catalog.json',catalog);save('public/data/items/foreverdb-enrichment.json',enrichment)
    for locale,pairs in effect_pairs.items():
        path=f'public/data/locales/wow-forever/item-effects-wowhead-{locale}.json';pack=read(path)
        pack['translations'].update(pairs);save(path,pack)
    # Extend the existing identity dictionary; never label authored names as client names.
    # The provenance of these exact-ID translations is kept in the research receipt.
    path='public/data/locales/wow-forever/source.json';source=read(path)
    packs={l:read(f'public/data/locales/wow-forever/{l}.json') for l in LOCALES.values()}
    positions={k:i for i,k in enumerate(source['keys'])}
    for id,row in names.items():
        key=f'ItemSparse:{id}:4'
        if key not in positions:
            positions[key]=len(source['keys']);source['keys'].append(key);source['values'].append(row['english'])
            for p in packs.values():p['values'].append('')
        index=positions[key]
        if source['values'][index]!=row['english']:continue
        for locale,value in row['locales'].items():
            if value!=row['english']:packs[locale]['values'][index]=value
    save(path,source)
    for l,p in packs.items():save(f'public/data/locales/wow-forever/{l}.json',p)
    (OUT/'item-changes.json').write_text(json.dumps({'ids':changed,'names':names,'effectTranslations':{l:len(v) for l,v in effect_pairs.items()}},ensure_ascii=False,indent=2),encoding='utf8')
    return names

def guide_update(names):
    authored=read('data/update-localization/november-16.json');keys=authored['keys']
    source=read('public/data/locales/wow-forever/source.json');english=source['values']
    journal=read('public/data/dungeons/journal.json')
    class_path='public/data/classes/guides/class-guides.json';classes=baseline(class_path)
    en_notes=dict(zip(keys,authored['en']))
    notes_by_lang={}
    for app,locale in [('en',None),*LOCALES.items()]:
        notes=dict(zip(keys,authored[app]));glossary={}
        if locale:
            values=read(f'public/data/locales/wow-forever/{locale}.json')['values']
            glossary={en:value for en,value in zip(english,values) if value and value!=en and not value.startswith('[')}
            localized=read(f'data/site-research/update-2026-11-16/world-map-{locale}.json')['data']
            for section,identity in [('pois','npc'),('places','area')]:
                local={str(p.get(identity)):p.get('name') for p in localized[section] if p.get(identity)}
                for p in merge.S[section]:
                    name=local.get(str(p.get(identity)))
                    if name and not name.startswith('['):glossary[p['name']]=name
            quests={str(q[0]):q[1] for p in localized['pois'] for q in p.get('quests',[])}
            for p in merge.S['pois']:
                for q in p.get('quests',[]):
                    value=quests.get(str(q[0]))
                    if value and not value.startswith('['):glossary[q[1]]=value
            for row in names.values():
                if row['locales'].get(locale):glossary[row['english']]=row['locales'][locale]
            for id in ['5214','96335','96076']:
                en_tip=tooltip('quest',id);local_tip=tooltip('quest',id,locale)
                if en_tip and local_tip and not local_tip['name'].startswith('['):glossary[en_tip['name']]=local_tip['name']
            if glossary.get('Fractured Insignia'):glossary['Fractured Insignias']=glossary['Fractured Insignia']
            entities=['The Questioner','The Man in the Iron Chains','Moonbrook','Stormwind','Booty Bay','Fractured Insignias','Alcaz Operative Insignia','Ring of Law',"Traveler's Symbols",'Student Fodder',"Premo's Poise-Demanding Uniform",'In Demand - Ancient Elven Curiosities','Pix Xizzix','Alzzin the Wildshaper','Prince Tortheldrin','King Gordok','Undermine Satchel','The End of the Dark Horde','Might of Stormwind',"Krol'dok Battlegear",'Blessed Band of Light',"Channeler's Ring",'Wild Growth','Frost Nova','Blizzard','Judgement of Command','The Quick and the Dead','Divine Spirit','Windfury Totem','Whirlwind','Mutilate','Siphon Life','Berserker Rage','Sap']
            pattern=re.compile(r'(?<![A-Za-z])(?:'+'|'.join(re.escape(k) for k in sorted(entities,key=len,reverse=True) if k in glossary)+r')(?![A-Za-z])')
            notes={k:pattern.sub(lambda m:glossary[m[0]],value) for k,value in notes.items()}
            if app=='ko':
                particles={'무법항로':'무법항으로','스톰윈드의 힘를':'스톰윈드의 힘을','역술사의 반지으로':'역술사의 반지로','지휘의 심판는':'지휘의 심판은','혼절시키기을':'혼절시키기를'}
                for key,value in notes.items():
                    for old,new in particles.items():value=value.replace(old,new)
                    notes[key]=value
        notes_by_lang[app]=notes
        path=f'src/i18n/locales/{app}.json';ui=read(path)
        prep=ui['dungeonPreparation']
        # Do not duplicate a note on subsequent runs.
        old_notes=ui.get('map',{}).get('november16Notes',{})
        for id in journal['suggestedLevels']:
            entry=prep['entries'].setdefault(id,{})
            requirements=entry.setdefault('requirements',[])
            requirements[:]=[v for v in requirements if v!=old_notes.get('xp')]
            if notes['xp'] not in requirements:requirements.append(notes['xp'])
        for id,key in [('949855','drowned'),('949860','alcaz'),('949916','brd'),('949923','diremaul'),('949919','spire'),('949858','krol')]:
            rows=prep.setdefault('encounterNotes',{}).setdefault('mapgenie-instance-'+id,[])
            rows[:]=[v for v in rows if v!=old_notes.get(key)]
            if notes[key] not in rows:rows.append(notes[key])
        ui['map']['november16Notes']=notes
        save(path,ui)
    for cls in ['druid','mage','paladin','priest','shaman','warlock','warrior']:
        entry=classes['classes'][cls.title()]
        for i,specialization in enumerate(entry['specs']):
            old=specialization.get('forever','');new=(old+' '+en_notes[cls]+' '+en_notes['stuns']).strip()
            specialization['forever']=new
            for app in LOCALES:
                path=f'public/data/classes/guides/locales/{app}/{cls}.json';pack=baseline(path)
                # Apply all spec edits together below; keep prior edits from this run.
                if i:pack=read(path)
                edit=next((e for e in pack['edits'] if [str(v) for v in e['path']]==['guide','specs',str(i),'forever']),None)
                localized=(edit['text'] if edit else old)+' '+notes_by_lang[app][cls]+' '+notes_by_lang[app]['stuns']
                if edit:edit.update(source=new,text=localized.strip());edit.pop('sources',None)
                else:pack['edits'].append({'path':['guide','specs',str(i),'forever'],'source':new,'text':localized.strip()})
                save(path,pack)
        for app in ['en',*LOCALES]:
            path=f'public/data/guides/{"" if app=="en" else "locales/"+app+"/"}leveling-{cls}.json'
            guide=baseline(path);text=notes_by_lang[app][cls]+' '+notes_by_lang[app]['stuns']
            guide['html']='<p>'+html.escape(text)+'</p>'+guide['html'];save(path,guide)
    save(class_path,classes)
    quests=journal['quests'].setdefault('mapgenie-instance-949923',[])
    if not any(q['id']=='96076' for q in quests):quests.append({'id':'96076','giver':{'id':'227853','name':'Pix Xizzix','where':'Booty Bay'}})
    quests=journal['quests'].setdefault('mapgenie-instance-949860',[])
    if not any(q['id']=='96335' for q in quests):quests.append({'id':'96335','giver':{'name':'Man in the Iron Chains','where':'Alcaz Prison'}})
    save('public/data/dungeons/journal.json',journal)
    for f in read('data/site-research/marker-audit-2026-11-16/local-marker-inventory.json')['files']:
        path='public/maps/world-atlas/'+f;d=read(path)
        for p in d['locations']:
            if p.get('entityId')=='227853':p['descriptionKey']='map.november16Notes.ring'
        save(path,d)

if __name__=='__main__':
    names=item_update();guide_update(names)
    print('Applied verified item stats, localized effects, dungeon notes and class guide hotfixes.')
