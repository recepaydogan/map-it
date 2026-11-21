"""Inventory readable summaries and unresolved or technical reference data."""
from collections import Counter
import json
from pathlib import Path

root = Path(__file__).resolve().parent.parent
public = root / 'public/data'
counts = Counter()
categories = {}
technical_fields = Counter()
examples = []
catalog = json.loads((public / 'items/catalog.json').read_text('utf8'))
items = {item['id']: item for item in catalog['items']}

for path in (public / 'reference/items').glob('*.json'):
    for item_id, sections in json.loads(path.read_text('utf8'))['items'].items():
        for section in sections:
            if section['title'] != 'reference.labels.use-effect':
                continue
            counts['Use-effect items'] += 1
            if section.get('text') or section.get('summary'):
                counts['Use-effect items with readable descriptions'] += 1
            if section.get('summary'):
                counts['Compact verified shield summaries'] += 1
            if '…' in section.get('text', ''):
                counts['Use-effect descriptions with unresolved values'] += 1
                if len(examples) < 8:
                    examples.append((item_id, items[item_id]['name'], section['text']))

for folder in sorted((public / 'reference').iterdir()):
    if not folder.is_dir() or folder.name == 'items':
        continue
    category = Counter()
    for path in folder.glob('*.json'):
        for entry in json.loads(path.read_text('utf8')).get('entries', {}).values():
            category['entries'] += 1
            if not entry.get('description'):
                category['no_description'] += 1
            if '…' in entry.get('description', ''):
                category['unresolved'] += 1
            facts = list(entry.get('facts', []))
            for section in entry.get('sections', []):
                facts += section.get('facts', [])
                for row in section.get('rows', []):
                    facts += row.get('facts', [])
            technical = [fact for fact in facts if fact['label'].endswith(('table-units', 'table-order', 'client-index'))]
            if technical:
                category['technical'] += 1
            technical_fields.update(fact['label'] for fact in technical)
    categories[folder.name] = category

lines = ['# Reference readability audit', '',
         'Reproduce with `python scripts/audit-reference-readability.py`.', '',
         'Counts describe exported client records, including variants and internal records. '
         'Technical data is retained behind disclosures; its presence is not a claim that it is understandable or verified.', '',
         '## Item use effects', '', '| Measure | Count |', '| --- | ---: |']
lines += [f'| {key} | {value:,} |' for key, value in counts.items()]
lines += ['', '## Reference categories', '',
          'A missing prose description is an audit signal, not necessarily a defect: recipes, rewards and boards may already explain themselves through structured data.', '',
          '| Category | Records | No prose description | Unresolved prose | Technical fields |',
          '| --- | ---: | ---: | ---: | ---: |']
lines += [f'| {name} | {c["entries"]:,} | {c["no_description"]:,} | {c["unresolved"]:,} | {c["technical"]:,} |' for name, c in categories.items()]
lines += ['', '## Most common technical fields', '', '| Field | Occurrences |', '| --- | ---: |']
lines += [f'| `{key}` | {count:,} |' for key, count in technical_fields.most_common()]
lines += ['', '## Unresolved item examples', '', '| Item ID | Item | Available description |', '| --- | --- | --- |']
lines += [f'| {id} | {name} | {description.replace(chr(10), " ")} |' for id, name, description in examples]
lines += ['', '## Evidence and resolution rules', '',
          '- Direct `se` and `abe` tokens identify a table row and a numbered parameter. Explicit `time`, `divide100`, `none`, `divide100abs` and `noneabs` formats are supported; an omitted format means the direct value.',
          '- The shield description explicitly identifies `SkillEffect:221200111`, parameter 1 = 60000 milliseconds, and `SkillAbnormalEffect:221200111`, parameter 2 = 350 damage per hit. Those yield the verified 60-second / 350-damage summary.',
          '- `HpBarrierTotal`, damage ranges, heal totals, tick totals and `StatchangeTotal` invoke additional formulas. Parameter values or similar-looking IDs do not establish those formulas. They remain unresolved.',
          '- Skill abnormal links use only the designated reference slot: slot 3 for Abnormal / Abnormal_True / Abnormal_Cc and slot 1 for Abnormal_Passive. Durations, percentages and damage numbers never become links. Unsupported effect types do not receive guessed abnormal links.',
          '- The source description remains in the data even when a compact summary is displayed. Unknown shield capacity is stated explicitly.',
          '', '## Remaining investigation priorities', '',
          '1. Recover client formula semantics or obtain matching in-game tooltips for unresolved shield, healing and stat-change totals. A value from another client version is not sufficient evidence.',
          '2. Audit board-node links in `scripts/reference-data/skills.py` and reciprocal unlock-item links in `scripts/reference-data/additional-rules.py`; these still scan untyped parameter arrays and need a separate typed relationship audit.',
          '3. Add readable effect-family summaries for skill/effect records without prose. Do not translate a raw parameter list into gameplay behavior without verifying each parameter.',
          '4. Establish units for cooldown, casting, movement speed, schedules and resets before showing converted values. A millisecond format on one token does not prove units for every table field.',
          '', '## Source research boundary', '',
          'The matching local client tables and localization are the primary evidence. Public searches for the shield formula did not establish its total-capacity calculation; no external numeric values were imported.', '']
report = root / 'docs/reference-readability-audit.md'
report.write_text('\n'.join(lines), encoding='utf8')
print(json.dumps({'items': counts, 'skills': categories['skills'], 'effects': categories['effects'], 'report': str(report)}, indent=2))
