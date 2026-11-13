import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { verifyBackup } from '../src/kitchen/ww/backup.ts';
import { SharePointStore } from '../src/kitchen/sharepoint.ts';
import { Server } from './support/fake-sharepoint.mjs';
const source = await verifyBackup(new Uint8Array(await readFile(process.argv[2])));
const server = new Server(), target = new SharePointStore('https://example.test/sites/isolated-restore', server.request, true);
await target.initialize(); await target.ww.initialize();
const done = {};
try {
 const { workspace } = source;
 assert.equal(source.journal.length, 0, 'Für Journalvorgänge den getrennten Wiederherstellungstest verwenden.');
 const originalFlags = [];
 for (const kind of ['seasons','articles','suppliers','offers']) {
   done[kind] = 0;
   for (const row of workspace[kind]) {
     const original = row.value;
     // The isolated target rebuilds historical references before restoring inactive flags.
     const replay = kind === 'seasons' && original.archived ? { ...original, archived: false }
       : ['articles','suppliers','offers'].includes(kind) && !original.active ? { ...original, active: true } : original;
     const saved = await target.saveMaster(kind, replay, undefined, 'restore-' + original.id);
     if (replay !== original) originalFlags.push({ kind, original, saved });
     done[kind]++;
   }
 }
 done.orders = 0;
 for (const row of workspace.orders) {
   const { receipts, deliveryNotes, ...order } = row.value;
   if (receipts?.length || deliveryNotes?.length) {
     let saved = await target.saveOrder({ ...order, status: 'Bestellt' }, undefined, 'restore-' + order.id);
     for (const receipt of receipts ?? []) saved = await target.saveReceipt(saved, receipt, 'restore-receipt-' + receipt.id);
     for (const note of deliveryNotes ?? []) saved = await target.saveDeliveryNote(saved, note, 'restore-note-' + note.id);
     if (order.status !== 'Bestellt')
       await target.saveOrder({ ...saved.value, status: order.status }, saved, 'restore-status-' + order.id);
   } else {
     await target.saveOrder(row.value, undefined, 'restore-' + order.id);
   }
   done.orders++;
 }
 done.counts = 0;
 for (const row of workspace.counts) { await target.saveMaster('counts', row.value, undefined, 'restore-' + row.value.id); done.counts++; }
 done.inventories = 0;
 for (const row of workspace.inventories) { await target.saveInventory(row.value, undefined, 'restore-' + row.value.id); done.inventories++; }
 for (const { kind, original, saved } of originalFlags.reverse())
   await target.saveMaster(kind, original, saved, 'restore-flag-' + original.id);
 const restored = await target.load();
 for (const kind of ['seasons','articles','suppliers','offers','orders','counts','inventories']) {
   const values = data => data[kind].map(r => r.value).sort((a,b) => a.id.localeCompare(b.id));
   assert.deepEqual(values(restored), values(workspace), 'Wiederhergestellter Inhalt weicht ab: ' + kind);
 }
 console.log(JSON.stringify({ done, success: true, verified: 'alle wiederhergestellten Inhalte' }));
} catch (e) {
 console.log(JSON.stringify({ done, success: false, reason: e.message.split('\n')[0] }));
 process.exitCode = 1;
}
