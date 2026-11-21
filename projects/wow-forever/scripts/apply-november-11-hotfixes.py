"""Apply the reviewed Nov 9-10 data delta, retaining publication baselines."""
import copy
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AUDIT = ROOT / 'data/site-research/hotfix-2026-11-11'
LANGUAGES = dict(zip(['de', 'es', 'es-MX', 'fr', 'ko', 'pt-BR', 'zh-Hans', 'zh-Hant'],
                     ['deDE', 'esES', 'esMX', 'frFR', 'koKR', 'ptBR', 'zhCN', 'zhTW']))

def read(path):
    return json.loads((ROOT / path).read_text(encoding='utf-8-sig'))

def baseline(path):
    saved = AUDIT / 'before' / path
    return json.loads(saved.read_text(encoding='utf-8-sig')) if saved.exists() else read(path)

def save(path, data):
    target = ROOT / path
    if target.exists() and read(path) == data:
        return
    before = AUDIT / 'before' / path
    before.parent.mkdir(parents=True, exist_ok=True)
    if not before.exists():
        before.write_bytes(target.read_bytes() if target.exists() else b'null\n')
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf8')

def receipt():
    paths = sorted(p.relative_to(AUDIT / 'before').as_posix() for p in (AUDIT / 'before').rglob('*.json'))
    (AUDIT / 'changes.json').write_text(json.dumps({
        'version': 1, 'date': '2026-11-11', 'paths': paths,
        'sources': ['https://www.wowhead.com/forever/news/hunter-pet-nerf-and-enhancement-shaman-changes-wow-forever-hotfixes-for-november-383837',
                    'https://worldofwarcraft.blizzard.com/en-us/news/24315281/wow-forever-hotfixes-november-10-2026',
                    'https://www.wowhead.com/forever/guide/dawn-waker-secret-walkthrough',
                    'https://www.wowhead.com/forever/news/vendor-price-changes-on-wow-forever-iron-grenade-shuffle-nerfed-383828'],
        'excluded': ['Unpublished map addon', 'Unverified boss item IDs and drop rates',
                     'Unverified creature population coordinates and counts', 'Unconfirmed Dawn Waker ending and reputation requirement',
                     'Unquantified quest gold rewards', 'Unconfirmed Coarse Grinding Stone skill thresholds']
    }, indent=2) + '\n', encoding='utf8')
    print(json.dumps({'reviewedFiles': len(paths)}))

def walk(value, replacements):
    if isinstance(value, str):
        # One pass: 50 -> 33, 100 -> 66, 150 -> 100 must not cascade.
        if value in replacements:
            return replacements[value]
        for old, new in sorted(replacements.items(), key=lambda x: -len(x[0])):
            if old in value:
                return value.replace(old, new)
        return value
    if isinstance(value, list):
        return [walk(x, replacements) for x in value]
    if isinstance(value, dict):
        return {k: v if k in ['old', 'was', 'source', 'sources'] else walk(v, replacements) for k, v in value.items()}
    return value

def main():
    shards = [baseline(f'public/data/spells/foreverdb/{i}.json') for i in range(64)]
    spells = {k: v for shard in shards for k, v in shard.items()}
    replacements = {}
    rank_changes = {}
    for sid in [17364, 415140, 408498, 17804, 1316697]:
        old = spells[str(sid)]
        ranks = old.get('rk', [old['d']])
        if sid == 17364:
            new = [text.replace('150%', '100%') for text in ranks]
        elif sid == 415140:
            new = [re.sub(r'\d+%', f'{percent}%', text) for text, percent in zip(ranks, [33, 66, 100])]
        elif sid == 408498:
            new = [re.sub(r'by \d+%', 'by 20%', text) + f' Activates approximately {ppm} times per minute; chance per swing depends on main-hand weapon speed.' for text, ppm in zip(ranks, range(6, 11))]
        elif sid == 17804:
            new = [text.replace('other Affliction effects', 'Corruption, Siphon Life, and Bane of Agony effects') for text in ranks]
        else:
            new = ['Tears the target apart from within for 6 sec, inflicting 25.2 Shadow damage every 1 sec, increasing by 1.75 per level up to 60 at level 60. While channeling, your Siphon Life, Corruption, and Bane of Agony effects on the target deal their periodic damage 100% faster.']
        rank_changes[str(sid)] = new
        replacements.update(zip(ranks, new))
        replacements[old['d']] = new[0]
    replacements.update({
        'makes your other shadow DoTs 10% stronger': 'makes Corruption, Siphon Life and Bane of Agony tick 100% faster while channeling',
        'Wrack, the tier 7 Affliction talent, is a new DoT': 'Wrack, the tier 7 Affliction talent, is a channeled spell',
        'per active Affliction effect': 'per active Corruption, Siphon Life or Bane of Agony effect',
        'for each of your other Affliction effects on the target': 'for each of your Corruption, Siphon Life and Bane of Agony effects on the target',
        'Wrack makes it hit harder while Wrack is on the target': 'Wrack makes it tick 100% faster while you channel',
    })
    # Apply replacements from immutable baselines so rerunning cannot shift ranks.
    for folder in ['public/data/classes', 'public/data/spells']:
        for file in (ROOT / folder).rglob('*.json'):
            if 'locales' in file.parts:
                continue
            path = file.relative_to(ROOT).as_posix()
            data = baseline(path)
            updated = walk(data, replacements)
            # Multiple independent prose corrections may occur in the same paragraph.
            for old, new in list(replacements.items())[-5:]:
                updated = walk(updated, {old: new})
            save(path, updated)
    for sid in [17364, 415140, 408498, 17804, 1316697]:
        path = f'public/data/spells/foreverdb/{sid % 64}.json'
        data = read(path)
        entry = data[str(sid)]
        entry['rk'] = rank_changes[str(sid)]
        entry['d'] = entry['rk'][0]
        if sid == 17364:
            entry['cd'] = 8000
        if sid == 1316697:
            entry['a'] = 'Inflicts Shadow damage every 1 sec. While channeling, the caster\'s Siphon Life, Corruption, and Bane of Agony effects deal periodic damage 100% faster.'
            entry['ef'][0].update(v=25.2, pl=1.75)
            # The obsolete +10% aura is no longer valid. Do not invent a client aura enum.
            entry['ef'] = [entry['ef'][0]]
        save(path, data)
    for sid in [3044, *range(14281, 14288), 1293241, 1293525, 1293526, 1293527]:
        path = f'public/data/spells/foreverdb/{sid % 64}.json'
        data = read(path)
        data[str(sid)]['co'] = [[11, 'Mana', 1]]
        save(path, data)
    path = 'public/data/items/catalog.json'
    data = read(path)
    for item in data['items']:
        sid = str(item['id'])
        if sid in ['4390', '247754']:
            item.setdefault('clientDetails', {})['sellPriceCopper'] = {'4390': 125, '247754': 5}[sid]
        if sid in ['274387', '274388']:
            item['clientDetails']['bonding'] = 0
    save(path, data)
    path = 'public/data/items/foreverdb-enrichment.json'
    data = read(path)
    entry = data['entries']['280604']
    for stats in [entry['stats'], entry['current']['stats']]:
        for stat in stats:
            if stat['key'] == 'fd-damage': stat['value'] = '102–154'
            if stat['key'] == 'fd-stat-5': stat.update(key='fd-stat-4', label='Strength', value='+16')
    save(path, data)
    # These names refer to the renamed recipe/effect; the crafted item was already correct.
    for folder in ['public/data/items', 'public/data/spells', 'public/data/professions', 'public/data/map-search']:
        for file in (ROOT / folder).rglob('*.json'):
            if 'locales' in file.parts: continue
            path = file.relative_to(ROOT).as_posix()
            data = read(path)
            updated = walk(data, {'Recipe: Elixir of Greater Firepower': 'Recipe: Elixir of Holy Power',
                                  'Elixir of Greater Firepower': 'Elixir of Holy Power'})
            save(path, updated)
    path = 'public/data/professions/details/enchanting.json'
    data = read(path)
    next(row for row in data['recipes'] if row['s'] == 1263056)['tools'] = ['Runed Golden Rod']
    save(path, data)
    # Only the confirmed destination changes; keep the quest giver and map position untouched.
    path = 'public/data/quests/quest-details.json'
    data = read(path)
    data['quests']['97968']['objective'] = "Travel to Shen'dar Village to learn to craft a camping item for Herbalism once you have shown proficiency in your skill."
    save(path, data)
    (AUDIT / 'spell-changes.json').write_text(json.dumps({'ranks': rank_changes, 'replacements': replacements}, ensure_ascii=False, indent=2), encoding='utf8')
    receipt()

if __name__ == '__main__':
    main()
