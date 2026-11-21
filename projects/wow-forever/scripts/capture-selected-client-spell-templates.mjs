/** Capture a small, explicit set of spell tooltip templates from the installed client. */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as casc from '@jamiephan/casclib';
import { readLocalWdc5 } from './lib/read-local-wdc5.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const idsArgument = process.argv.slice(2).find((argument) => argument.startsWith('--ids='));
if (process.argv.length !== 3 || !idsArgument) throw new Error('Use --ids=123,456');
const ids = [...new Set(idsArgument.slice(6).split(',').map(Number))];
if (!ids.length || ids.length > 100 || ids.some((id) => !Number.isSafeInteger(id) || id < 1)) {
  throw new Error('Expected 1-100 positive spell IDs');
}
const installDir = process.env.CASC_INSTALL_DIR ?? 'C:/Program Files (x86)/World of Warcraft';
const tableCatalog = JSON.parse(await readFile(join(root, 'data/client-research/db2-table-names.json'), 'utf8'));
const registration = tableCatalog.identified.find(({ name }) => name === 'Spell');
if (!registration) throw new Error('Missing installed-client Spell table registration');
const filename = `FILE${registration.fileDataId.toString(16).toUpperCase().padStart(8, '0')}.dat`;
const locales = ['enUS', 'deDE', 'esES', 'esMX', 'frFR', 'koKR', 'ptBR', 'zhCN', 'zhTW'];
const output = join(root, 'data/site-research/client-selected-spell-templates.json');
let previous = { version: 1, clientBuild: null, templates: {} };
try {
  previous = JSON.parse(await readFile(output, 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const templates = { ...previous.templates };
let clientBuild;

for (const locale of locales) {
  const storage = casc.Storage.openEx(installDir, {
    codeName: 'wow_classic_beta', region: 'us',
    localeMask: casc[`CASC_LOCALE_${locale.toUpperCase()}`], online: false,
  });
  try {
    clientBuild ??= storage.getProductInfo().buildNumber;
    if (storage.getProductInfo().buildNumber !== clientBuild) throw new Error('Client build changed during capture');
    const reader = readLocalWdc5(storage.readFile(filename)).reader;
    for (const id of ids) {
      const row = reader.getRowData(id);
      let tooltip = null;
      if (row?.type === 'sparse' && Buffer.isBuffer(row.data)) {
        let start = 0;
        for (let field = 0; field < 3; field++) {
          const end = row.data.indexOf(0, start);
          if (end < 0) break;
          if (field === 1) tooltip = row.data.subarray(start, end).toString('utf8');
          start = end + 1;
        }
      }
      templates[id] ??= {};
      templates[id][locale] = tooltip;
    }
  } finally {
    storage.close();
  }
}

if (previous.clientBuild && previous.clientBuild !== clientBuild) {
  throw new Error(`Previous capture build ${previous.clientBuild} differs from current build ${clientBuild}`);
}
await writeFile(output, `${JSON.stringify({ version: 1, clientBuild, templates }, null, 2)}\n`);
console.log(`Captured ${ids.length} spell IDs in ${locales.length} locales from client build ${clientBuild}.`);
for (const id of ids) {
  console.log(`${id}: ${locales.filter((locale) => !!templates[id][locale]).length}/${locales.length} templates`);
}
