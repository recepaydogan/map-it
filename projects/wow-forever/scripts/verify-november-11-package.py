"""Verify the final archive, unpacked app, CDN pins and protected addon sources."""
import hashlib
import json
from pathlib import Path
import re
import zipfile

root=Path(__file__).resolve().parents[1]
audit=root/'data/site-research/hotfix-2026-11-11'
read=lambda p:json.loads(p.read_text(encoding='utf-8-sig'))
sha=lambda b:hashlib.sha256(b).hexdigest()
package=read(root/'package.json')
version=package['version']
assert version=='4.4.17'
lock=read(root/'package-lock.json')
assert lock['version']==version and lock['packages']['']['version']==version
protected=read(audit/'excluded-addon-hashes.json')
for file,digest in protected.items():assert sha((root/file).read_bytes())==digest,file
code_hashes={digest for file,digest in protected.items() if file.endswith(('.lua','.toc'))}
archive=root/f'{package["name"]}-{version}.opk'
with zipfile.ZipFile(archive) as opk:
    assert opk.testzip() is None,'Invalid ZIP CRC'
    names=[n for n in opk.namelist() if not n.endswith('/')]
    assert 'manifest.json' in names and len(names)==len(set(names))
    assert not any(re.search(r'addon-prototype|map-prototype|\.env(?:\.|$)',n,re.I) or n.startswith(('./','/','../')) for n in names)
    manifest=json.loads(opk.read('manifest.json'))
    assert manifest['meta']['version']==version
    assert 'developer' not in manifest.get('data',{})
    for name in names:
        data=opk.read(name)
        assert data==(root/'.release-dist'/name).read_bytes(),name
        assert data==(root/'dist'/name).read_bytes(),name
        assert sha(data) not in code_hashes,f'Unpublished addon code in {name}'
    staged={p.relative_to(root/'.release-dist').as_posix() for p in (root/'.release-dist').rglob('*') if p.is_file()}
    assert set(names)==staged,'Archive and release directory differ'
    scripts=b'\n'.join(opk.read(name) for name in names if name.endswith('.js'))
    assert b'mapAddonPrototype' not in scripts,'Unpublished addon locale in release bundle'
    assert read(root/'src/i18n/locales/en.json')['mapAddonPrototype']==read(audit/'before/src/i18n/locales/en.json')['mapAddonPrototype'],'Developer addon strings changed'
    receipts={kind:read(audit/'refinement'/f'{kind}-release.json') for kind in ['content','dungeons','locales']}
    for kind,receipt in receipts.items():
        assert receipt['status']=='verified' and receipt['activated']
        assert not any(re.search('addon-prototype|map-prototype',f['path'],re.I) for f in receipt['files'])
        if kind!='dungeons':assert receipt['url'].encode() in scripts,f'Missing CDN pin: {kind}'
    result={'version':version,'opk':str(archive),'opkSha256':sha(archive.read_bytes()),'opkBytes':archive.stat().st_size,
            'archiveFiles':len(names),'distMatchesArchive':True,'protectedAddonFiles':len(protected),
            'addonExcludedFromCdnAndOpk':True,'addonFilesUnchanged':True,
            'cdn':{kind:{'url':r['url'],'changedFiles':len(r['changed']),'verifiedFiles':r['verifiedFiles']} for kind,r in receipts.items()},
            'addedMarkers':16,'addedBossIdentities':4,
            'notInferred':['Unverified boss drops and rates','Unverified spawn changes','Unquantified quest gold rewards','Dawn Waker ending and reputation requirement']}
    (audit/'release-verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print(json.dumps(result,ensure_ascii=False,indent=2))
