import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ProbeStore } from '../src/probe-store.ts';

const before = { id: 1, title: 'SPFx-Testartikel Wasser', quantity: 12, etag: '"1"', modified: '', editor: '' };
const response = (status, body = {}) => ({ status, ok: status >= 200 && status < 300, json: async () => body });

test('a competing edit is rejected instead of overwriting another user', async () => {
  const store = new ProbeStore('https://example.sharepoint.com/sites/test', async (_url, options) => {
    assert.equal(options.headers['IF-MATCH'], '"1"');
    return response(412);
  });
  await assert.rejects(store.save(before, 9), /geändert/);
});

test('an acknowledged write is confirmed by reading the actual value back', async () => {
  let writes = 0;
  const store = new ProbeStore('https://example.sharepoint.com/sites/test', async (_url, options) => {
    if (options.method === 'POST') { writes++; assert.deepEqual(JSON.parse(options.body), { Quantity: 9 }); return response(204); }
    return response(200, { value: [{ Id: 1, Title: 'SPFx-Testartikel Wasser', Quantity: 9, 'odata.etag': '"2"', Modified: '2026-10-22T10:00:00Z', Editor: { Title: 'Testkonto' } }] });
  });
  const saved = await store.save(before, 9);
  assert.equal(saved.quantity, 9);
  assert.equal(saved.etag, '"2"');
  assert.equal(writes, 1);
});

test('a mismatched readback never appears as a successful save', async () => {
  const store = new ProbeStore('https://example.sharepoint.com/sites/test', async (_url, options) =>
    options.method === 'POST' ? response(204) : response(200, { value: [{ Id: 1, Title: 'SPFx-Testartikel Wasser', Quantity: 12, 'odata.etag': '"2"' }] }));
  await assert.rejects(store.save(before, 9), /bestätigt/);
});

test('a real article or a blank amount cannot be changed through the probe', async () => {
  const store = new ProbeStore('https://example.sharepoint.com/sites/test', async () => { throw new Error('Unexpected request'); });
  await assert.rejects(store.save({ ...before, title: 'Echter Artikel' }, 9), /Testartikel/);
  await assert.rejects(store.save(before, -1), /Menge/);
});
