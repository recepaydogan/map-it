"""Refresh published quest objective counts and remove numeric dungeon false links."""
import argparse
from collections import defaultdict
import hashlib
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent / 'reference-data'))
from context import human, value, write
from quests import objective_required_count


def refresh(tables, public):
    tables, public = Path(tables), Path(public)
    root = public / 'data/reference'
    manifest = json.loads((root / 'manifest.json').read_text('utf8'))
    hashes = {table['name']: table['sha256'] for table in manifest['tables']}
    for name in ('Quest', 'QuestStep'):
        actual = hashlib.sha256((tables / (name + '.json')).read_bytes()).hexdigest()
        if hashes.get(name) != actual:
            raise ValueError('Source snapshot mismatch: ' + name)

    quest_rows = {value(row['ID']): row for row in json.loads(
        (tables / 'Quest.json').read_text('utf8'))['Properties']['Data']}
    steps = defaultdict(list)
    for row in json.loads((tables / 'QuestStep.json').read_text('utf8'))['Properties']['Data']:
        steps[row['QuestName']].append(row)

    changed_chunks = removed_links = added_counts = 0
    unaligned = []
    for path in sorted((root / 'quests').glob('*.json')):
        chunk = json.loads(path.read_text('utf8'))
        changed = False
        for entry in chunk['entries'].values():
            quest_id = int(entry['id'].split(':', 1)[1])
            quest = quest_rows[quest_id]
            section = next((part for part in entry['sections']
                            if part['title'] == 'reference.labels.objectives'), None)
            objectives = section.get('rows', []) if section else []
            numeric_dungeons = {
                step['Order']: {'Dungeon:' + token.strip()
                                for goal in step['GoalList'] for cell in goal['Value']
                                for token in cell.split(',') if token.strip().isdigit()}
                for step in steps[quest['Name']]
            }
            for objective in objectives:
                links = objective.get('links', [])
                order = int(objective['name'].split(' ', 1)[0])
                invalid = numeric_dungeons.get(order, set())
                retained = [link for link in links
                            if not (link['category'] == 'dungeons' and link['id'] in invalid)]
                if len(retained) != len(links):
                    objective['links'] = retained
                    removed_links += len(links) - len(retained)
                    changed = True
            for step in sorted(steps[quest['Name']], key=lambda row: row['Order']):
                goal_groups = defaultdict(list)
                for goal in step['GoalList']:
                    goal_groups[human(goal['Type'])].append(goal)
                for label, goals in goal_groups.items():
                    matching = [objective for objective in objectives
                                if objective['name'] == str(step['Order']) + ' · ' + label]
                    counts = [objective_required_count(goal) for goal in goals]
                    if not any(count is not None for count in counts):
                        continue
                    if len(matching) == len(goals):
                        pairs = zip(matching, counts)
                    elif matching and len(set(counts)) == 1:
                        pairs = ((objective, counts[0]) for objective in matching)
                    else:
                        unaligned.append((entry['id'], step['Order'], label))
                        continue
                    for objective, count in pairs:
                        if count is None:
                            continue
                        facts = objective.setdefault('facts', [])
                        fact = next((fact for fact in facts
                                     if fact['label'] == 'reference.labels.required-count'), None)
                        if fact is None:
                            facts.append({'label': 'reference.labels.required-count', 'value': count})
                            added_counts += 1
                            changed = True
                        elif fact['value'] != count:
                            fact['value'] = count
                            changed = True
        if changed:
            write(path, chunk)
            changed_chunks += 1
    print(f'Updated {changed_chunks} quest chunks; removed {removed_links} false dungeon links; '
          f'added {added_counts} required counts.')
    if unaligned:
        print(f'Skipped count facts for {len(unaligned)} published steps with different goal counts: '
              + ', '.join(f'{quest_id}/step-{order}/{label}' for quest_id, order, label in unaligned[:12]))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tables', required=True)
    parser.add_argument('--public', default='public')
    args = parser.parse_args()
    refresh(args.tables, args.public)
