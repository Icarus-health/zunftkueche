import JSZip from 'jszip';
import type { Workspace, Stored } from '../model';
import type { Entity, WwStore } from './store';
import { withOriginal } from './model.ts';
import { sha256 } from '../imports/identity.ts';

type Manifest = {format: string; version: number; exportedAt: string; files: Record<string,string>};
const encoder = new TextEncoder();
const decoder = new TextDecoder();
export async function createBackup(workspace: Workspace, store: WwStore, reload?: () => Promise<Workspace>): Promise<Uint8Array> {
    const journal = await store.loadAll(), zip = new JSZip(), files: Record<string,string> = {};
    const add = async (name: string, bytes: Uint8Array): Promise<void> => { zip.file(name, bytes); files[name] = await sha256(bytes); };
    await add('workspace.json', encoder.encode(JSON.stringify(workspace)));
    await add('journal.json', encoder.encode(JSON.stringify(journal)));
    for (const row of journal) if (withOriginal(row.value) && row.value.attachment) {
        const bytes = await store.readOriginal(row as Stored<import('./model').WwDocument>);
        if (await sha256(bytes) !== row.value.fileHash) throw new Error('Prüfsumme eines Datei-Originals stimmt nicht. Sicherung abgebrochen.');
        await add('originals/' + row.value.id + '.' + row.value.attachment.split('.').pop(), bytes);
    }
    const again = await store.loadAll();
    if (JSON.stringify(journal) !== JSON.stringify(again) || (reload && JSON.stringify(workspace) !== JSON.stringify(await reload()))) throw new Error('Daten wurden während der Sicherung geändert. Bitte erneut sichern, wenn niemand arbeitet.');
    const manifest: Manifest = {format: 'zunftkueche-backup', version: 1, exportedAt: new Date().toISOString(), files};
    zip.file('manifest.json', JSON.stringify(manifest));
    return zip.generateAsync({type:'uint8array', compression:'DEFLATE'});
}
export async function verifyBackup(data: Uint8Array): Promise<{workspace: Workspace; journal: Stored<Entity>[]; originals: Record<string,Uint8Array>}> {
    const zip = await JSZip.loadAsync(data, {checkCRC32:true}), file = zip.file('manifest.json');
    if (!file) throw new Error('Sicherungsverzeichnis fehlt.');
    const manifest = JSON.parse(await file.async('string')) as Manifest;
    if (manifest.format !== 'zunftkueche-backup' || manifest.version !== 1 || !manifest.files || !manifest.files['workspace.json'] || !manifest.files['journal.json']) throw new Error('Sicherungsformat ungültig.');
    const read = async (name: string): Promise<Uint8Array> => { const f=zip.file(name); if (!f) throw new Error('Sicherungsdatei fehlt: '+name); const bytes=await f.async('uint8array'); if (await sha256(bytes)!==manifest.files[name]) throw new Error('Prüfsumme stimmt nicht: '+name); return bytes; };
    const workspace=JSON.parse(decoder.decode(await read('workspace.json'))) as Workspace;
    const journal=JSON.parse(decoder.decode(await read('journal.json'))) as Stored<Entity>[];
    const originals: Record<string,Uint8Array> = {};
    for (const row of journal) if (withOriginal(row.value) && row.value.attachment) {
        const bytes=await read('originals/'+row.value.id+'.'+row.value.attachment.split('.').pop());
        if (await sha256(bytes)!==row.value.fileHash) throw new Error('Datei-Original stimmt nicht.');
        originals[row.value.id]=bytes;
    }
    for (const name of Object.keys(manifest.files)) await read(name);
    return {workspace,journal,originals};
}
