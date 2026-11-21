import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const version = process.argv[2];

if (!version) {
  console.error('Usage: node scripts/bump-version.mjs <version>');
  console.error('Example: node scripts/bump-version.mjs 1.0.0');
  process.exit(1);
}

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`Invalid version format: "${version}". Expected semver like 1.0.0`);
  process.exit(1);
}

const files = [
  { path: path.join(ROOT, 'package.json'), key: ['version'] },
  { path: path.join(ROOT, 'public', 'manifest.json'), key: ['meta', 'version'] },
];

for (const file of files) {
  const rel = path.relative(ROOT, file.path);
  if (!fs.existsSync(file.path)) {
    console.warn(`  SKIP  ${rel} (not found)`);
    continue;
  }

  const json = JSON.parse(fs.readFileSync(file.path, 'utf-8'));
  let obj = json;
  for (let i = 0; i < file.key.length - 1; i++) {
    obj = obj[file.key[i]];
  }
  const lastKey = file.key[file.key.length - 1];
  const oldVersion = obj[lastKey];
  obj[lastKey] = version;

  fs.writeFileSync(file.path, JSON.stringify(json, null, 2) + '\n');
  console.log(`  ${rel}  ${oldVersion} -> ${version}`);
}

console.log(`\nVersion bumped to ${version}`);
