"""Link quest map-event goals to exact, named dungeon event sources."""
import argparse
from collections import defaultdict
import hashlib
import json
from pathlib import Path
import re
import sys

sys.path.insert(0, str(Path(__file__).parent / 'reference-data'))
from context import value, write


def unavailable(text):
    return not text or bool(re.fullmatch(r'[\s?？.…]+', text))


def refresh(tables, public, check):
    tables = Path(tables)
    reference = Path(public) / 'data/reference'
    manifest = json.loads((reference / 'manifest.json').read_text('utf8'))
    hashes = {row['name']: row['sha256'] for row in manifest['tables']}
    for name in ('Quest', 'QuestStep'):
        actual = hashlib.sha256((tables / f'{name}.json').read_bytes()).hexdigest()
        if actual != hashes.get(name):
            raise ValueError(f'Source snapshot mismatch: {name}')

    audit = json.loads((reference / 'dungeon-boss-audit.json').read_text('utf8'))
    audit_hashes = {row['name']: row['sha256'] for row in audit['tables']}
    if audit_hashes.get('Dungeon') != hashes.get('Dungeon'):
        raise ValueError('Dungeon event audit does not match the reference catalog.')
    index = json.loads((reference / 'index.json').read_text('utf8'))
    summaries = {entry['id']: entry for entry in index['entries']}
    events = defaultdict(dict)
    for dungeon in audit['dungeons']:
        summary = summaries.get(dungeon['id'])
        if not summary or summary['category'] != 'dungeons' or summary['name'] != dungeon['name']:
            raise ValueError(f'Dungeon event audit identity mismatch: {dungeon["id"]}')
        for source in dungeon.get('eventSources', []):
            events[Path(source['asset']).stem][dungeon['id']] = summary['name']

    quests = {str(value(row['ID'])): row for row in json.loads(
        (tables / 'Quest.json').read_text('utf8'))['Properties']['Data']}
    steps = defaultdict(list)
    for row in json.loads((tables / 'QuestStep.json').read_text('utf8'))['Properties']['Data']:
        steps[row['QuestName']].append(row)

    matched = unchanged = unresolved = 0
    for path in sorted((reference / 'quests').glob('*.json')):
        chunk = json.loads(path.read_text('utf8'))
        changed = False
        for entry in chunk['entries'].values():
            source = quests[entry['id'].split(':', 1)[1]]
            goals = [(step['Order'], goal) for step in sorted(steps[source['Name']], key=lambda row: row['Order'])
                     for goal in step['GoalList'] if goal['Type'].endswith('::ClearMapEvent')]
            objectives = [row for section in entry['sections'] if section['title'] == 'reference.labels.objectives'
                          for row in section.get('rows', []) if row['name'].split(' · ', 1)[-1] == 'Clear Map Event']
            if len(goals) != len(objectives):
                raise ValueError(f'Map-event objective count mismatch: {entry["id"]}')
            for (order, goal), objective in zip(goals, objectives):
                if not objective['name'].startswith(f'{order} · '):
                    raise ValueError(f'Map-event objective order mismatch: {entry["id"]}/{order}')
                if not unavailable(objective.get('description')):
                    continue
                event = goal['Value'][0] if goal.get('Value') else ''
                targets = events.get(event, {})
                if len(targets) != 1:
                    unresolved += 1
                    continue
                dungeon_id, name = next(iter(targets.items()))
                link = {'id': dungeon_id, 'category': 'dungeons', 'name': name}
                links = objective.get('links', [])
                if any(item['id'] == dungeon_id for item in links):
                    unchanged += 1
                    continue
                if check:
                    raise ValueError(f'Missing map-event link: {entry["id"]}/{order} -> {dungeon_id}')
                objective['links'] = [*links, link]
                matched += 1
                changed = True
        if changed:
            write(path, chunk)
    print(f'Map-event objectives: {matched} linked, {unchanged} already linked, {unresolved} without a unique named dungeon.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tables', required=True, help='Decoded tables matching the published reference manifest')
    parser.add_argument('--public', default='public')
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    refresh(args.tables, args.public, args.check)
