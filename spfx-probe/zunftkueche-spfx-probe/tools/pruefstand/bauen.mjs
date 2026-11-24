// Baut den Prüfstand als eine einzige Datei. Aufruf: node bauen.mjs <daten.json> <ausgabe.html>
// esbuild wird nicht mit der App ausgeliefert: ESBUILD_FROM zeigt auf einen Ordner, in dem es installiert ist.
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const [dataPath, outPath] = process.argv.slice(2);
if (!dataPath || !outPath) throw new Error('Aufruf: node bauen.mjs <daten.json> <ausgabe.html>');
const require = createRequire(resolve(process.env.ESBUILD_FROM || here, 'x.js'));
const { build } = require('esbuild');
const data = JSON.parse(await readFile(dataPath, 'utf8'));
for (const key of ['title', 'context', 'dictations', 'bills'])
  if (!(key in data)) throw new Error('In den Daten fehlt: ' + key);
const result = await build({
  entryPoints: [join(here, 'main.ts')],
  bundle: true,
  format: 'iife',
  target: 'es2020',
  write: false,
  legalComments: 'none'
});
const code = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const json = JSON.stringify(data).replace(/</g, '\\u003c');
const page = (await readFile(join(here, 'seite.html'), 'utf8'))
  .replace('/*DATA*/', () => 'const PRUEFSTAND_DATA = ' + json + ';')
  .replace('/*CODE*/', () => code);
await writeFile(outPath, page);
console.log(
  'Prüfstand geschrieben: ' +
    outPath +
    ' (' +
    Math.round(page.length / 1024) +
    ' KB, ' +
    data.dictations.length +
    ' Diktate)'
);
