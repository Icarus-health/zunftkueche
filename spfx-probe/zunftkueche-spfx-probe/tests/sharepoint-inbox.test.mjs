import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SharePointInbox} from '../src/kitchen/ww/inbox.ts';
import {inboxView} from '../src/kitchen/ww/inbox-view.ts';
import {Server} from './support/fake-sharepoint.mjs';

const site = 'https://example.sharepoint.com/sites/kitchen';
const library = '/sites/kitchen/Shared Documents';
const path = library + '/03_Rechnungen/2027';
const id = i => '00000000-0000-0000-0000-00000000000' + i;
const bytes = new TextEncoder().encode('%PDF-1.7 Testbeleg');
function seed(server, folder, name, i) {
    const metadata = { UniqueId: id(i), ETag: '"1"', Name: name, Length: String(bytes.length), TimeLastModified: '2027-02-06T12:00:00Z' };
    const file = { metadata, bytes };
    server.inboxFiles.set(folder + '/' + name, file);
    return file;
}
test('year folder setup preserves the existing root, paginates and reads a name with apostrophe, percent and hash', async () => {
    const server = new Server(), inbox = new SharePointInbox(site, server.request, false);
    server.inboxFolders.add(library);
    server.inboxFolders.add(library + '/03_Rechnungen');
    server.inboxFolders.add(library + '/01_Zunftjahr');
    assert.equal((await inbox.list('bill', 2027)).exists, false);
    await inbox.ensure('bill', 2027);
    await inbox.ensure('system', 2027);
    await inbox.ensure('system', 2027);
    assert.equal((await inbox.list('system', 2027)).exists, true);
    const name = "Axel's #107 100%.pdf";
    const original = seed(server, path, name, 1);
    seed(server, path, 'Kopie.pdf', 2);
    seed(server, path, 'Andere Rechnung.pdf', 3);
    const folder = await inbox.list('bill', 2027);
    assert.equal(folder.files.length, 3);
    const file = folder.files.find(f => f.name === name);
    assert.deepEqual(await inbox.read('bill', 2027, file), bytes);
    original.metadata.ETag = '"2"';
    await assert.rejects(inbox.read('bill', 2027, file), /Datei wurde geändert/);
});
test('read fails when the original changes during transfer, and a paginated listing rejects other destinations', async () => {
    const server = new Server();
    server.inboxFolders.add(path);
    const original = seed(server, path, 'Rechnung.pdf', 1);
    const request = async (url, options) => {
        const response = await server.request(url, options);
        if (url.endsWith('/$value')) original.metadata.ETag = '"2"';
        return response;
    };
    const inbox = new SharePointInbox(site, request, false);
    const [file] = (await inbox.list('bill', 2027)).files;
    await assert.rejects(inbox.read('bill', 2027, file), /Datei wurde geändert/);
    const malicious = new SharePointInbox(site, async () => ({
        ok: true, status: 200, json: async () => ({ value: [], '@odata.nextLink': 'https://another.example/test' })
    }), false);
    await assert.rejects(malicious.list('bill', 2027), /unerwarteten Verweis/);
});
test('inbox status refers to the saved file version and does not treat an updated version as booked', async () => {
    const server = new Server(), inbox = new SharePointInbox(site, server.request, false);
    server.inboxFolders.add(path);
    const a = seed(server, path, 'Übernommen.pdf', 1);
    const b = seed(server, path, 'Geändert.pdf', 2);
    seed(server, path, 'Doppelt.pdf', 3);
    b.metadata.ETag = '"2"';
    const season = { id:'s2027', name:'Fasnet 2027', year:2027, archived:false };
    const state = { ww:{ records:[a,b].map(f => ({ value:{ kind:'bill', scope:season.id, area:'Küche', confirmed:true,
        id:'bill-'+f.metadata.UniqueId, sourceFile:{ id:f.metadata.UniqueId, version:'"1"' } } })) } };
    const html = inboxView({ season, folders:{ bill:await inbox.list('bill', 2027) }, errors:{}, busy:false,
        duplicates:new Map([[id(3)+':"1"', 'Übernommen.pdf']]) }, state);
    assert.match(html,/Übernommen · Küche/);
    assert.match(html,/Neuer Dateistand/);
    assert.match(html,/Doppelte Datei · Übernommen\.pdf/);
    // Eine Zeile bleibt prüfbar; derselbe Dateistand steht zusätzlich hinter „Nächste Rechnung prüfen“.
    assert.equal((html.match(/data-action="ww-inbox-file"/g)||[]).length, 2);
    assert.match(html,/1 offen<\/strong> · 1 bestätigt/);
});
