"""Finish cross-catalog links and verified boss identities; never infer loot tables."""
import importlib.util
import json
spec=importlib.util.spec_from_file_location('hotfix',__file__.replace('finalize-','apply-'))
h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)

# Rune remnants are not the playable Forever talents. Preserve their historical text.
for sid in [409946,415713,410100,416055]:
    p=f'public/data/spells/foreverdb/{sid%64}.json'
    data=h.read(p);data[str(sid)]=h.baseline(p)[str(sid)];h.save(p,data)
p=f'public/data/spells/foreverdb/{1310077%64}.json'
data=h.read(p);data['1310077']['n']='Holy Power';h.save(p,data)
p='public/data/spells/foreverdb/index.json'
data=h.read(p)
next(row for row in data if row[0]==1310077)[1]='Holy Power';h.save(p,data)
p='public/data/items/foreverdb-enrichment.json'
data=h.read(p)
def rename(v):
    if isinstance(v,list):
        for x in v:rename(x)
    if isinstance(v,dict):
        if str(v.get('id'))=='1310077' and 'name' in v:v['name']='Holy Power'
        for x in v.values():rename(x)
rename(data);h.save(p,data)
# Search names have a separate localized overlay.
p='public/data/locales/wow-forever/source.json';data=h.read(p)
for key,value in [('ItemSparse:21547:0','Recipe: Elixir of Holy Power'),('SpellName:1310077:0','Holy Power')]:
    data['values'][data['keys'].index(key)]=value
h.save(p,data)
holy={'de':'Heilige Macht','es':'Poder sagrado','es-MX':'Poder sagrado','fr':'Puissance sacrée',
      'ko':'신성한 힘','pt-BR':'Poder Sagrado','zh-Hans':'神圣能量','zh-Hant':'神聖能量'}
for lang,locale in h.LANGUAGES.items():
    p=f'public/data/locales/wow-forever/{locale}.json';pack=h.read(p)
    pack['values'][data['keys'].index('SpellName:1310077:0')]=holy[lang];h.save(p,pack)

tips={
 'en':'Use the Archival Panel to summon Cinder.',
 'de':'Benutzt die Archivkonsole, um Cinder zu beschwören.',
 'es':'Usa el panel de archivo para invocar a Cinder.',
 'es-MX':'Usa el panel de archivo para invocar a Cinder.',
 'fr':'Utilisez le panneau des archives pour invoquer Cinder.',
 'ko':'기록 보관 패널을 사용해 Cinder를 소환하세요.',
 'pt-BR':'Use o painel de arquivos para invocar Cinder.',
 'zh-Hans':'使用档案控制面板召唤Cinder。',
 'zh-Hant':'使用檔案控制面板召喚Cinder。'}
p='public/data/dungeons/boss-guides.json';data=h.read(p)
for dungeon, bosses in [('mapgenie-instance-949860',[('Zarla Ober',255707)]),
                        ('mapgenie-instance-949862',[('Vitrix',272561),('Snowtalon',262297),('Cinder',261974)])]:
    data['entries'][dungeon]={'bosses':[{'name':name,'npcId':str(sid),'loot':[],
        **({'tipKey':'bossGuide.shaper.cinder.tip'} if name=='Cinder' else {})} for name,sid in bosses]}
h.save(p,data)
# Every objective overlay must match the new canonical source, otherwise the
# strict locale loader rejects the complete quest pack.
qs=h.read('public/data/locales/wow-forever/quest-text-source.json')
qi=qs['keys'].index('97968:objective')
objective=qs['values'][qi]
for file in (h.ROOT/'public/data/locales/wow-forever').glob('quest-*wowhead*.json'):
    p=file.relative_to(h.ROOT).as_posix();pack=h.read(p)
    entry=pack.get('quests',{}).get('97968')
    if not entry or 'objective' not in entry.get('english',{}):continue
    entry['english']['objective']=objective
    for locale,fields in entry.get('locales',{}).items():
        if 'objective' in fields:
            fields['objective']=h.read(f'public/data/locales/wow-forever/quest-text-{locale}.json')['values'][qi]
    entry['hotfixReview']={'source':'https://worldofwarcraft.blizzard.com/en-us/news/24315281/wow-forever-hotfixes-november-10-2026','translation':'contextual'}
    h.save(p,pack)
for lang,text in tips.items():
    p=f'src/i18n/locales/{lang}.json';data=h.read(p)
    data.setdefault('bossGuide',{}).setdefault('shaper',{}).setdefault('cinder',{})['tip']=text
    h.save(p,data)
(h.AUDIT/'boss-evidence.json').write_text(__import__('json').dumps({
    '255707':'https://www.wowhead.com/forever/npc=255707/zarla-ober',
    '272561':'https://www.wowhead.com/forever/npc=272561/vitrix',
    '262297':'https://www.wowhead.com/forever/npc=262297/snowtalon',
    '261974':'https://www.wowhead.com/forever/npc=261974/cinder',
    'note':'NPC identities and dungeon association confirmed. Outfit is not a loot table. No drop IDs, rates or coordinates inferred.'},indent=2),encoding='utf8')
h.receipt()
