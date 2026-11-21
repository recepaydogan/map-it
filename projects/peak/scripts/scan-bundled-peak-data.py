"""Developer-only, bounded extraction for PEAK's streamed scene bundles."""
import argparse
import gc
import hashlib
import json
import re
import runpy
import struct
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.request import urlopen

import UnityPy
from UnityPy.helpers import TypeTreeHelper
from UnityPy.streams import EndianBinaryReader

ROOT = Path(__file__).resolve().parent
legacy = runpy.run_path(str(ROOT / 'scan-peak-game-data.py'))
SceneBundle = runpy.run_path(str(ROOT / 'peak-data/scene-bundles.py'))['SceneBundle']


class BundledScanner(legacy['GameDataScanner']):
    def __init__(self, game_root, output_path):
        self.environments = {}
        self.file_names = {}
        self.script_cache = {}
        self.indexed_prefabs = set()
        self.item_classes = set()
        self.item_display_ids = {}
        self.scene_entries = {}
        self.bundle_paths = {}
        for path in sorted((game_root / 'PEAK_Data/StreamingAssets/maps').glob('*.assetbundle')):
            bundle = SceneBundle(path)
            for name in bundle.entries:
                if name in self.scene_entries:
                    raise ValueError(f'Duplicate scene bundle entry: {name}')
                self.scene_entries[name] = bundle
                self.bundle_paths[name] = path.relative_to(game_root).as_posix()
        if not self.scene_entries:
            raise ValueError('No streamed map bundles found')
        super().__init__(game_root, output_path)

    def load_asset(self, name):
        if name in self.environments:
            return self.environments[name]
        if name in self.scene_entries:
            environment = UnityPy.load(self.scene_entries[name].read(name))
        elif name in ('unity default resources', 'unity_builtin_extra'):
            environment = UnityPy.load(str(self.data_root / 'Resources' / name))
        else:
            environment = super().load_asset(name)
        if not environment.objects:
            raise ValueError(f'Empty serialized asset: {name}')
        self.file_names[id(environment.objects[0].assets_file)] = name
        self.environments[name] = environment
        return environment

    def class_for_object(self, obj):
        if obj.type.name != 'MonoBehaviour':
            return None
        raw = obj.get_raw_data()
        if len(raw) < 28:
            raise ValueError('Truncated MonoBehaviour')
        file_id, path_id = struct.unpack_from('<iq', raw, 16)
        if not path_id:
            return None
        source_name = self.file_names[id(obj.assets_file)]
        script_file = source_name if file_id == 0 else self.external_name(obj.assets_file, file_id)
        key = (script_file, path_id)
        if key not in self.script_cache:
            if not script_file:
                raise ValueError('Missing script asset binding')
            environment = self.load_asset(script_file)
            reader = environment.objects[0].assets_file.objects.get(path_id)
            if reader is None or reader.type.name != 'MonoScript':
                raise ValueError(f'Invalid script pointer: {key}')
            self.script_cache[key] = legacy['script_name'](reader.read())
        return self.script_cache[key]

    def resolve_reader(self, current, ptr):
        file_id, path_id = legacy['pointer'](ptr)
        if not path_id:
            return None
        target_name = current.name if file_id == 0 else self.external_name(current.file, file_id)
        if not target_name:
            raise ValueError('Missing external asset binding')
        if target_name not in self.asset_contexts:
            self.asset_contexts[target_name] = legacy['AssetContext'](target_name, self.load_asset(target_name))
        resolved = super().resolve_reader(current, ptr)
        if resolved and resolved[1].type.name == 'GameObject' and self.item_classes:
            key = (resolved[0], resolved[1].path_id)
            if key not in self.indexed_prefabs:
                self.indexed_prefabs.add(key)
                context = self.asset_contexts[resolved[0]]
                for entry in resolved[1].read_typetree()['m_Component']:
                    component = self.resolve_reader(context, entry['component'])
                    if not component:
                        continue
                    name = self.class_for_object(component[1])
                    if name in self.item_classes:
                        data = component[1].read_typetree(nodes=self.nodes(name))
                        display_id = int(data['itemID'])
                        if display_id not in self.item_display_ids:
                            raise ValueError(f'Unregistered bundled item: {display_id}')
                        self.item_by_game_object[key] = self.item_display_ids[display_id]
        return resolved

    def extract_items(self):
        items = super().extract_items()
        self.item_display_ids = {item['displayId']: item['id'] for item in items}
        self.item_classes = {self.class_for_object(self.resources.objects[item['id']]) for item in items}
        return items

    def derive_levels(self):
        candidates = [obj for context in list(self.asset_contexts.values())
                      for obj in context.environment.objects if self.class_for_object(obj) == 'MapBaker']
        if len(candidates) != 1:
            raise ValueError('Expected one authoritative MapBaker')
        nodes = self.nodes('MapBaker')
        stack = [nodes]
        while stack:
            node = stack.pop()
            if (node.m_Type == 'string' and node.m_Children and node.m_Children[0].m_Type == 'Array'
                    and node.m_Children[0].m_Children[-1].m_Type != 'char'):
                node.m_Type = 'vector'
            stack.extend(node.m_Children)
        # UnityPy's accelerated reader confuses string vectors with strings in
        # generated trees. The reference reader checks the entire byte payload.
        reader = EndianBinaryReader(candidates[0].get_raw_data(), endian='<')
        data = TypeTreeHelper.read_value(nodes, reader, TypeTreeHelper.TypeTreeConfig(True, candidates[0].assets_file, False))
        if reader.Position != len(candidates[0].get_raw_data()):
            raise ValueError('Incomplete MapBaker decode')
        paths = data['ScenePaths']
        daily = []
        for index, path in enumerate(paths):
            scene = Path(path).stem
            name = 'BuildPlayer-' + scene
            if scene != f'Level_{index}' or name not in self.scene_entries:
                raise ValueError(f'Unverified rotation scene binding: {index}')
            daily.append({'index': index, 'number': index + 1, 'scene': scene,
                          'assetFile': name, 'assetBundle': self.bundle_paths[name], 'kind': 'daily'})
        bundled_scenes = {name for name in self.scene_entries if re.fullmatch(r'BuildPlayer-Level_\d+', name)}
        if bundled_scenes != {entry['assetFile'] for entry in daily}:
            raise ValueError('MapBaker and scene bundle coverage disagree')
        return daily

    def release_scene(self, name):
        environment = self.environments.pop(name, None)
        if environment:
            self.file_names.pop(id(environment.objects[0].assets_file), None)
        self.asset_contexts.pop(name, None)
        gc.collect()

    def run_bounded(self):
        lock_path = ROOT.parent / 'artifacts/peak-maintenance.lock'
        lock_path.parent.mkdir(parents=True, exist_ok=True)
        lock = lock_path.open('x')
        try:
            return self._run_bounded()
        finally:
            lock.close()
            lock_path.unlink()

    def _run_bounded(self):
        daily = self.derive_levels()
        version = '.'.join(self.game_version.split('.')[:2])
        with urlopen(f'https://peaklogin3.azurewebsites.net/api/VersionCheck?version={version}', timeout=30) as response:
            server_time = parsedate_to_datetime(response.headers['Date'])
            rotation = json.load(response)
        if not rotation.get('VersionOkay') or type(rotation.get('LevelIndex')) is not int:
            raise ValueError('Official rotation is unavailable')
        raw_index = rotation['LevelIndex']
        indices = [(raw_index + offset) % len(daily) for offset in range(7)]
        remaining = sum(rotation[key] * multiplier for key, multiplier in
                        [('HoursUntilLevel', 3600), ('MinutesUntilLevel', 60), ('SecondsUntilLevel', 1)])
        anchor = server_time + timedelta(seconds=remaining) - timedelta(days=raw_index + 1)
        items = self.extract_items()
        loot_pools = self.extract_loot_pools()
        badges = self.extract_badges()
        guidebook = self.extract_guidebook()
        levels, finals = [], []
        for index in indices:
            definition = daily[index]
            print(f'Scanning bounded scene {definition["scene"]}...', flush=True)
            levels.append(self.scan_level(definition))
            finals.append(self.scan_level({**definition, 'index': None, 'number': None,
                'kind': 'final', 'title': 'The Final Ascent', 'captureRootComponent': 'Peak.VoidBiome'}))
            print(f'  daily={len(levels[-1]["markers"])} final={len(finals[-1]["markers"])}', flush=True)
            self.release_scene(definition['assetFile'])
        build = legacy['build_id']()
        for entry in levels + finals:
            entry['mapBuildId'] = build
            entry['mapImage'] = entry['mapImage'].replace('.webp', f'-{build}.webp')
            if 'Caldera' in entry['biomes'] and self.config.get('calderaMapRevision'):
                entry['mapRevision'] = self.config['calderaMapRevision']
                entry['mapImage'] = entry['mapImage'].replace('.webp', f'-{entry["mapRevision"]}.webp')
        catalog = {'schemaVersion': 4, 'source': {'steamAppId': 3527290, 'overwolfGameId': 26092,
            'buildId': build, 'gameVersion': self.game_version, 'revision': self.revision,
            'assemblySha256': hashlib.sha256((self.data_root / 'Managed/Assembly-CSharp.dll').read_bytes()).hexdigest(),
            'scanner': 'scan-bundled-peak-data.py'},
            'rotation': {'anchorUtc': anchor.astimezone(timezone.utc).isoformat().replace('+00:00', 'Z'),
                         'durationHours': 24, 'levelCount': len(daily)},
            'rotationEvidence': {'serverIndex': raw_index, 'serverDate': server_time.isoformat(),
                                 'sceneOrder': [entry['scene'] for entry in daily]},
            'markerIcons': legacy['MARKER_ICONS'], 'items': items,
            'itemIconCoverage': {'withSprites': sum(item['icon'] is not None for item in items),
                                'withoutSprites': sorted(item['displayId'] for item in items if item['icon'] is None)},
            'lootPools': loot_pools, 'achievements': badges, 'guidebook': guidebook,
            'levels': levels, 'specialLevels': finals,
            'dailyWindow': {'levelIndices': indices, 'days': 7}, 'finalWindow': {'levelIndices': indices, 'days': 7}}
        self.output_path.write_text(json.dumps(catalog, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
        print(f'Prepared seven daily and final maps for build {build}, indices {indices}.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--game-root', type=Path, default=legacy['DEFAULT_GAME_ROOT'])
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    BundledScanner(args.game_root, args.output).run_bounded()
