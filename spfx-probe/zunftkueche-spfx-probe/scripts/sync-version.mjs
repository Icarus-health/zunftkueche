import {readFile,writeFile} from 'node:fs/promises';
const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
if(!/^\d+\.\d+\.\d+$/.test(pkg.version))throw new Error('Release version must have three numeric components.');
const path=new URL('../config/package-solution.json',import.meta.url),config=JSON.parse(await readFile(path,'utf8'));
config.solution.version=pkg.version+'.0';for(const feature of config.solution.features||[])feature.version=pkg.version+'.0';
await writeFile(path,JSON.stringify(config,null,2)+'\n');
await writeFile(new URL('../src/kitchen/release.ts',import.meta.url),'// Generated from package.json by scripts/sync-version.mjs.\nexport const APP_VERSION = '+JSON.stringify(pkg.version)+';\n');
