"""Shared import primitives; raw table dumps never enter the public bundle."""
import hashlib
import html
import json
import re
import os
import tempfile
from collections import defaultdict
from pathlib import Path

# Same verified basis-point stat units as the existing item catalog importer.
PERCENT_STATS = {'CombatSpeed', 'AmplifyAllDamage', 'AmplifyWeaponDamage', 'AdditionalHitRate', 'AbnormalAccuracy', 'AbnormalResistance', 'DecreaseWeaponBlock', 'DecreaseShieldBlock', 'DamageRatio', 'DefenseRatio', 'AmplifyCriticalDamage', 'DecreaseCriticalDamage', 'AmplifyHpHealGet', 'AdditionalHitResistRate', 'PvPAmplifyDamage', 'PvEAmplifyDamage', 'PvPDecreaseDamage', 'PvEDecreaseDamage', 'DecreaseWeaponDamage', 'DecreaseDamage', 'HpPotionRate'}


def value(cell):
    return cell.get('Value', 0) if isinstance(cell, dict) else cell


def human(text):
    text = str(text).split('::')[-1]
    return re.sub(r'(?<=[a-z])(?=[A-Z])', ' ', text).replace('_', ' ').strip()


def clean(text):
    text = re.sub(r'<br\s*/?>|\\n', '\n', str(text), flags=re.I)
    text = re.sub(r'<[^>]*>', '', text)
    return html.unescape(text).strip()


def write(path, data, *, indent=None):
    path.parent.mkdir(parents=True, exist_ok=True)
    # Replace complete files atomically; synced folders may reject truncating
    # a file while a reader or sync client holds it open.
    content = json.dumps(data, ensure_ascii=False, indent=indent,
                         separators=None if indent else (',', ':')) + ('\n' if indent else '')
    with tempfile.NamedTemporaryFile(mode='w', encoding='utf8', dir=path.parent,
                                     prefix=path.name + '.', suffix='.tmp', delete=False) as stream:
        temporary = stream.name
        stream.write(content)
    try:
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


class Context:
    def __init__(self, tables, localization, public):
        self.tables = Path(tables)
        self.public = Path(public)
        self.strings = json.loads(Path(localization).read_text('utf8'))['Entries']
        self.strings = {k.casefold(): v for k, v in self.strings.items()}
        self.cache = {}
        self.entries = {}
        self.aliases = {}
        self.labels = {}
        self.warnings = defaultdict(int)
        self.catalog = json.loads((self.public / 'data/items/catalog.json').read_text('utf8'))
        self.items = {i['id']: i for i in self.catalog['items']}
        self.item_names = {i['Name'].casefold(): str(value(i['ID'])) for i in self.rows('Item')}
        self.source_prefix = next(iter(self.items.values()))['source'].split('Item.dat')[0]
        self.item_sections = defaultdict(list)
        self.token_tables = None
        for row in self.rows('Item'):
            item = self.items.get(str(value(row['ID'])))
            if item and not item.get('nameVerified'):
                name = self.text(row.get('Desc'))
                if name and not name.startswith('#'):
                    item.update({'name': name, 'nameVerified': True})
                    item.pop('nameOrigin', None)

    def rows(self, name):
        if name not in self.cache:
            path = self.tables / (name + '.json')
            if not path.exists():
                raise FileNotFoundError(f'Required decoded table is missing: {path}')
            self.cache[name] = json.loads(path.read_text('utf8'))['Properties']['Data']
        return self.cache[name]

    def raw_text(self, key, fallback=''):
        if isinstance(key, dict):
            key = key.get('Key', '')
        if not key or key == 'None':
            return fallback
        key = str(key).casefold()
        result = self.strings.get(key) or self.strings.get('string_' + key + '_body')
        return clean(result) if result else fallback

    def text(self, key, fallback=''):
        raw = self.raw_text(key)
        return self.resolve_tokens(raw) if raw else fallback

    def resolve_tokens(self, text):
        if '{' not in text:
            return text
        if self.token_tables is None:
            self.token_tables = {kind: {str(value(row['ID'])): row for row in self.rows(table)} for kind, table in [('se', 'SkillEffect'), ('abe', 'SkillAbnormalEffect')]}

        def replace(match):
            parts = match.group(1).split(':')
            if len(parts) in (3, 4) and parts[0] in self.token_tables:
                row = self.token_tables[parts[0]].get(parts[1], {})
                field = re.fullmatch(r'(?:effect_)?value(\d+)', parts[2], re.I)
                vals = row.get('EffectValueList', row.get('Values', []))
                if field and 0 < int(field[1]) <= len(vals):
                    val = vals[int(field[1]) - 1]
                    try:
                        number = float(val)
                        mode = parts[3] if len(parts) == 4 else 'none'
                        if mode == 'time':
                            return f'{number / 1000:g} s'
                        if mode == 'divide100':
                            return f'{number / 100:g}'
                        if mode == 'divide10':
                            return f'{number / 10:g}'
                        if mode == 'divide1000':
                            return f'{number / 1000:g}'
                        if mode == 'divide100abs':
                            return f'{abs(number) / 100:g}'
                        if mode == 'noneabs':
                            return f'{abs(number):g}'
                        if mode == 'none':
                            return f'{number:g}'
                    except ValueError:
                        pass
            self.warnings['dynamic-description-values'] += 1
            return '…'
        return re.sub(r'\{([^{}]+)\}', replace, text)

    def label(self, label):
        key = re.sub(r'[^a-z0-9]+', '-', label.lower()).strip('-')
        self.labels[key] = label
        return 'reference.labels.' + key

    def fact(self, label, val):
        return {'label': self.label(label), 'value': val}

    def facts(self, row, fields):
        result = []
        for key, label in fields.items():
            val = row.get(key)
            if val is None or val == '' or val == 'None' or isinstance(val, (list, dict)):
                continue
            if isinstance(val, str):
                val = self.text(val, human(val))
            if key.startswith('Can') and val in (0, 1):
                val = bool(val)
            if key == 'MaxStackCount' and val == 0:
                continue
            result.append(self.fact(label, val))
        return result

    def entry(self, table, row, category, name=None, key=None, fields=None, description=None, group=None):
        identity = key if key is not None else value(row.get('ID', row.get('DataId', row.get('AchievementId', row.get('Name', '')))))
        if identity == '':
            raise ValueError(f'Missing identity for {table}')
        entry_id = table + ':' + str(identity)
        title = name or self.text(row.get('Desc'), '') or self.text(row.get('Title'), '') or human(row.get('Name', identity))
        entry = {'id': entry_id, 'category': category, 'name': title, 'facts': self.facts(row, fields or {}), 'sections': [], 'locations': [], 'source': self.source_prefix + table + '.dat#' + str(identity)}
        entry['unnamed'] = bool(re.fullmatch(r'[?\s.…\d]+', title))
        if description:
            entry['description'] = description
        if group:
            entry['group'] = group
            entry['subtitle'] = group
        self.entries[entry_id] = entry
        for alias in [identity, row.get('Name'), row.get('Group'), row.get('EventName'), row.get('GroupName')]:
            if alias is not None and alias != 'None':
                self.aliases[(table, str(alias).casefold())] = entry_id
        return entry

    def link(self, table, key, quantity=None, note=None):
        key = value(key)
        if key in (None, '', 'None', 0, '0'):
            return None
        if table == 'Item':
            item_id = str(key) if str(key) in self.items else self.item_names.get(str(key).casefold())
            record = self.items.get(item_id)
            if not record:
                self.warnings['unresolved-item-links'] += 1
                return None
            result = {'id': record['id'], 'category': 'items', 'name': record['name']}
            if record.get('icon'):
                result['icon'] = record['icon']
        else:
            entry_id = self.aliases.get((table, str(key).casefold()))
            record = self.entries.get(entry_id)
            if not record:
                self.warnings['unresolved-' + table + '-links'] += 1
                return None
            result = {k: record[k] for k in ['id', 'category', 'name']}
        if quantity is not None:
            result['quantity'] = quantity
        if note:
            result['note'] = note
        return result

    def item_links(self, values):
        result = []
        for row in values:
            if isinstance(row, str):
                row = {'Item': row}
            name = row.get('Item', row.get('ItemName', row.get('CostItemName', 'None')))
            if isinstance(name, dict):
                name = name.get('Item', 'None')
            quantity = row.get('Count', row.get('ItemCount', row.get('CostItemCount', row.get('ItemCountMin'))))
            note = None
            if row.get('ItemCountMax', quantity) != quantity:
                note = str(quantity) + '–' + str(row['ItemCountMax'])
            link = self.link('Item', name, quantity, note)
            if link:
                result.append(link)
        return result

    def section(self, entry, title, **content):
        data = {k: v for k, v in content.items() if v}
        if data:
            if title in ('Rewards', 'Choose a reward', 'Contents', 'Possible contents', 'Possible rewards', 'First-clear rewards', 'Repeat rewards', 'Progression rewards', 'Milestones', 'Faction rewards: Light', 'Faction rewards: Dark', 'Guaranteed rewards'):
                reward_links = data.get('links', []) + [link for row in data.get('rows', []) for link in row.get('links', [])]
                for link in reward_links:
                    if link['category'] == 'items':
                        self.item_section(link['id'], 'Additional acquisition sources', links=[{k: entry[k] for k in ('id', 'name', 'category')}])
            label = self.label(title)
            section = next((s for s in entry['sections'] if s['title'] == label), None)
            if section is None:
                entry['sections'].append({'title': label, **data})
            else:
                for key, val in data.items():
                    if isinstance(val, list):
                        section.setdefault(key, []).extend(val)
                    elif section.get(key) != val:
                        section[key] = '\n'.join(filter(None, [section.get(key), val]))

    def item_section(self, item_id, title, **content):
        if item_id not in self.items:
            return
        data = {k: v for k, v in content.items() if v}
        if data:
            self.item_sections[item_id].append({'title': self.label(title), **data})

    def stats(self, stats):
        result = []
        for stat in stats:
            key = stat.get('StatType', stat.get('Stat', stat.get('Key', '')))
            val = stat.get('StatValue', stat.get('Value'))
            if isinstance(val, (float, int)):
                label = self.text('StatName_' + str(key).split('::')[-1], human(key))
                if str(key).split('::')[-1] in PERCENT_STATS:
                    label += ' (%)'
                    val /= 100
                result.append(self.fact(label, val))
        return result

    def finalize(self):
        destination = self.public / 'data/reference'
        def refresh_links(node):
            if isinstance(node, list):
                for child in node:
                    refresh_links(child)
            elif isinstance(node, dict):
                if 'category' in node and 'id' in node and 'name' in node:
                    target = self.items.get(node['id']) if node['category'] == 'items' else self.entries.get(node['id'])
                    if target:
                        node['name'] = target['name']
                for key, child in node.items():
                    if isinstance(child, (dict, list)):
                        refresh_links(child)
        refresh_links(list(self.entries.values()))
        refresh_links(list(self.item_sections.values()))
        groups = defaultdict(list)
        for entry in self.entries.values():
            entry['locations'] = list({(r['mapId'], r['markerId']): r for r in entry['locations']}.values())
            for section in entry['sections']:
                for key in ('links', 'facts', 'rows'):
                    if key in section:
                        section[key] = list({json.dumps(v, sort_keys=True): v for v in section[key]}.values())
            groups[entry['category']].append(entry)
        summaries = []
        for category, entries in groups.items():
            entries.sort(key=lambda e: (e['unnamed'], e['name'].casefold(), e['id']))
            chunks = defaultdict(dict)
            for entry in entries:
                bucket = hashlib.sha256(entry['id'].encode()).hexdigest()[:2]
                summary = {**{k: v for k, v in entry.items() if k in ('id', 'category', 'name', 'subtitle', 'group', 'icon', 'unnamed', 'activity', 'travel', 'adventure', 'worldBoss')}, 'chunk': bucket}
                summaries.append(summary)
                chunks[bucket][entry['id']] = entry
            for bucket, records in chunks.items():
                write(destination / category / (bucket + '.json'), {'version': 1, 'entries': records})
        write(destination / 'index.json', {'version': 1, 'categories': [{'id': key, 'count': len(v)} for key, v in groups.items()], 'entries': summaries})
        chunks = defaultdict(dict)
        for item_id, sections in self.item_sections.items():
            merged = {}
            for section in sections:
                target = merged.setdefault(section['title'], {'title': section['title']})
                for key, content in section.items():
                    if isinstance(content, list):
                        target.setdefault(key, []).extend(content)
                    elif key != 'title':
                        target[key] = content
            for section in merged.values():
                for key in ('links', 'facts', 'rows'):
                    if key in section:
                        section[key] = list({json.dumps(v, sort_keys=True): v for v in section[key]}.values())
            chunks[item_id[:3]][item_id] = list(merged.values())
        for bucket, records in chunks.items():
            write(destination / 'items' / (bucket + '.json'), {'version': 1, 'items': records})
        write(self.public / 'data/items/catalog.json', self.catalog)
        return {key: len(v) for key, v in groups.items()}
