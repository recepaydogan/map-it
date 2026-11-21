"""Inspect an OPK without installing it; compare every byte with the release build."""
import hashlib
import json
import posixpath
import re
import zipfile
from pathlib import Path, PurePosixPath

root = Path(__file__).resolve().parent.parent
read = lambda path: json.loads(path.read_text(encoding='utf-8'))
digest = lambda data: hashlib.sha256(data).hexdigest()
package = read(root/'package.json')
version = package['version']
archive = root/f"{package['name']}-{version}.opk"
build = root/'.release-dist'
with zipfile.ZipFile(archive) as zipped:
    assert zipped.testzip() is None, 'ZIP CRC failure'
    files = [item for item in zipped.infolist() if not item.is_dir()]
    names = [item.filename for item in files]
    assert len(names) == len({name.casefold() for name in names}), 'Duplicate paths'
    assert all(not name.startswith(('/', './')) and '\\' not in name and '..' not in PurePosixPath(name).parts for name in names)
    expected = {path.relative_to(build).as_posix() for path in build.rglob('*') if path.is_file()}
    assert set(names) == expected, 'Archive inventory differs from the release build'
    inventory = []
    excluded = {'.git', 'node_modules', 'research', '.codex', 'src', 'scripts', 'artifacts'}
    for item in files:
        data = zipped.read(item)
        assert data == (build/item.filename).read_bytes(), item.filename
        assert not excluded.intersection(PurePosixPath(item.filename).parts), item.filename
        assert not PurePosixPath(item.filename).name.startswith('.env'), item.filename
        inventory.append({'path': item.filename, 'bytes': len(data), 'sha256': digest(data)})
    policy = read(root/'src/content-delivery.json')
    remote = [name for name in names if any(name.startswith(prefix) for prefix in policy['remoteRoots'])
        and not any(re.search(pattern, name) for pattern in policy['bundledPatterns'])]
    assert not remote, remote
    manifest = json.loads(zipped.read('manifest.json'))
    release = json.loads(zipped.read('content-release.json'))
    assert release == read(root/'content-release.json')
    lock = read(root/'package-lock.json')
    assert manifest['meta']['version'] == version == lock['version'] == lock['packages']['']['version']
    assert (root/'src/features/updates/updates-release.ts').read_text().strip() == f'export const UPDATES_VERSION = "{version}";'
    references = [manifest['meta'][key] for key in ['icon', 'icon_gray', 'launcher_icon', 'tray_icon', 'window_icon']]
    references += [window['file'] for window in manifest['data']['windows'].values()]
    references += [manifest['data']['uninstall_window']['file']]
    assert all(name in names for name in references)
    native = []
    for key, item in manifest['data']['extra-objects'].items():
        data = zipped.read(item['file'])
        assert data[:2] == b'MZ' and data == (root/'public'/item['file']).read_bytes()
        native.append({'object': key, **item, 'bytes': len(data), 'sha256': digest(data)})
    texts = {name: zipped.read(name).decode('utf-8') for name in names if name.endswith(('.js', '.css', '.html'))}
    urls = sorted({url for text in texts.values() for url in re.findall(r'https://pzb\.ingredientassets\.com/releases/[a-f0-9]{24}', text)})
    assert urls == [release['baseUrl']], 'Compiled application selects a different CDN'
    for name, text in texts.items():
        if not name.endswith('.html'): continue
        for reference in re.findall(r'(?:src|href)="([^"]+)"', text):
            if reference.startswith(('https:', 'http:', 'data:', '#')): continue
            target = posixpath.normpath(reference.lstrip('/') if reference.startswith('/') else posixpath.join(posixpath.dirname(name), reference))
            assert target in names, (name, reference)
    for name in ['icon.png', 'icon_gray.png']:
        data = zipped.read(name)
        assert data[:8] == b'\x89PNG\r\n\x1a\n' and len(data) <= 30*1024
    assert len(zipped.read('launcher_icon.ico')) <= 150*1024
    report = {'status': 'passed', 'appName': manifest['meta']['name'], 'version': version, 'package': str(archive), 'packageBytes': archive.stat().st_size,
        'packageSha256': digest(archive.read_bytes()), 'fileCount': len(files), 'uncompressedBytes': sum(item.file_size for item in files),
        'cdnRelease': release, 'gameTargeting': manifest['data']['game_targeting'], 'windows': list(manifest['data']['windows']),
        'hotkeys': list(manifest['data']['hotkeys']), 'nativePlugins': native,
        'bundledGameFiles': [name for name in names if name.startswith('data/')],
        'foreignUiLocaleFiles': [name for name in names if name.startswith('locales/')], 'remoteContentFiles': remote,
        'excludedDirectories': sorted(excluded), 'runtimeInstalledOrTested': False,
        'checks': ['zip-crc', 'safe-unique-paths', 'every-file-matches-release-build', 'version-parity', 'manifest-references',
            'native-dll-source-identity', 'english-only-bundled-content', 'single-current-cdn', 'html-references', 'icon-size-limits'],
        'inventory': inventory}
    output = root/f'artifacts/opk-{version}-verification.json'
    output.parent.mkdir(exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(json.dumps({key: value for key, value in report.items() if key not in ['inventory', 'package', 'checks', 'cdnRelease']}))
    print(f'Report: {output.name}')
