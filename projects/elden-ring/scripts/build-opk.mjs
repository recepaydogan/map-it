import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'dist');
const MANIFEST = path.join(DIST, 'manifest.json');

function cleanDist() {
  if (!fs.existsSync(DIST)) return;
  for (const entry of fs.readdirSync(DIST)) {
    fs.rmSync(path.join(DIST, entry), { recursive: true, force: true });
  }
}

function deleteMapFiles(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const stats = fs.statSync(fullPath);
    if (stats.isDirectory()) {
      deleteMapFiles(fullPath);
    } else if (entry.endsWith('.map')) {
      fs.unlinkSync(fullPath);
      console.log(`   Deleted: ${path.relative(DIST, fullPath)}`);
    }
  }
}

// Load VITE_ASSET_BASE (and any other VITE_* vars) from the .env files so a single
// local file drives both the Vite bundle and the OPK strip step below. Vite reads
// these for the bundle itself; this mirrors them into process.env so
// stripCdnAssets() sees the same value. Precedence matches Vite: .env first, then
// .env.production overrides it; an already-set shell var wins over both.
function loadProductionEnv() {
  const fromShell = new Set(Object.keys(process.env)); // wins over any .env file
  for (const file of ['.env', '.env.production']) {     // .env.production overrides .env
    const envPath = path.join(ROOT, file);
    if (!fs.existsSync(envPath)) continue;
    for (const line of fs.readFileSync(envPath, 'utf-8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m || fromShell.has(m[1])) continue;
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

function dirSizeMB(dir) {
  let bytes = 0;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else bytes += fs.statSync(p).size;
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return bytes / (1024 * 1024);
}

// CDN release: when VITE_ASSET_BASE is set, the ~78MB extracted item-icon set and
// the boss + enemy portrait sets are served from the CDN, so they must NOT be
// bundled in the OPK. The build keeps the local fallback icons (_fallback),
// world-map symbols, Nightreign and poi-icons.
function stripCdnAssets() {
  const base = process.env.VITE_ASSET_BASE;
  if (!base) {
    console.log('   VITE_ASSET_BASE not set — bundling item icons locally (no CDN).');
    return;
  }
  console.log(`   CDN base: ${base}`);
  for (const dir of ['items', 'bosses', 'enemies']) {
    const target = path.join(DIST, 'icons', 'elden-ring', dir);
    const saved = dirSizeMB(target);
    fs.rmSync(target, { recursive: true, force: true });
    console.log(`   Removed dist/icons/elden-ring/${dir} from OPK (~${saved.toFixed(1)} MB → served from CDN).`);
  }
}

async function buildOpk() {
  loadProductionEnv();

  console.log('0. Cleaning dist/...');
  cleanDist();

  console.log('\n1. Building app with Vite...');
  execSync('npm run build:overwolf', { cwd: ROOT, stdio: 'inherit' });

  console.log('\n2. Removing source maps...');
  deleteMapFiles(DIST);

  console.log('\n2b. Applying CDN asset policy...');
  stripCdnAssets();

  console.log('\n3. Building icons...');
  execSync('node scripts/build-icons.mjs', { cwd: ROOT, stdio: 'inherit' });

  console.log('\n4. Verifying package structure...');
  if (!fs.existsSync(MANIFEST)) {
    console.error('ERROR: manifest.json not found at dist root!');
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf-8'));
  console.log(`   App: ${manifest.meta.name} v${manifest.meta.version}`);

  const requiredFiles = [
    manifest.meta.icon,
    manifest.meta.icon_gray,
    manifest.meta.launcher_icon,
  ];
  for (const file of requiredFiles) {
    const filePath = path.join(DIST, file);
    if (!fs.existsSync(filePath)) {
      console.error(`ERROR: Required file missing: ${file}`);
      process.exit(1);
    }
    const stats = fs.statSync(filePath);
    console.log(`   ${file}: ${(stats.size / 1024).toFixed(1)} KB`);
  }

  console.log('\n5. Creating OPK package...');
  const version = manifest.meta.version;
  const appName = manifest.meta.name.toLowerCase().replace(/\s+/g, '-');
  const opkName = `${appName}-${version}.opk`;
  const opkPath = path.join(ROOT, opkName);
  const zipPath = opkPath.replace('.opk', '.zip');

  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
  if (fs.existsSync(opkPath)) fs.unlinkSync(opkPath);

  // An .opk is just a ZIP with manifest.json at the root. Compress dist/* so the
  // manifest lands at the archive root (not nested under a dist/ folder).
  execSync(
    `powershell -NoProfile -Command "Compress-Archive -Path '${DIST}\\*' -DestinationPath '${zipPath}' -CompressionLevel Optimal"`,
    { cwd: ROOT, stdio: 'inherit' }
  );

  if (!fs.existsSync(zipPath)) {
    console.error('ERROR: ZIP file was not created.');
    process.exit(1);
  }

  fs.renameSync(zipPath, opkPath);

  const opkMB = (fs.statSync(opkPath).size / (1024 * 1024)).toFixed(2);
  console.log(`\nOPK created: ${opkName} (${opkMB} MB)`);
  console.log(`Location: ${opkPath}`);
  console.log('\nDone! Ready for Overwolf submission.');
}

buildOpk().catch((err) => {
  console.error('OPK build failed:', err);
  process.exit(1);
});
