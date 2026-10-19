import test from 'node:test';
import assert from 'node:assert/strict';
import {jpegFile} from './document-files.mjs';
import {runtimeFixture} from './document-runtime-fixture.mjs';
const value=()=>({uploadId:'11111111-1111-4111-8111-111111111111',eventId:'e',file:jpegFile()});
test('unknown claim outcome is replayed with same request before resuming upload; no new create',async()=>{
 const fixture=runtimeFixture({lostClaim:true});
 await assert.rejects(()=>fixture.repository().upload(value()),/lost response/);
 await assert.rejects(()=>fixture.repository().upload(value()),/Unklar/);
 const claims=fixture.calls.filter(c=>c.action==='upload.claim');
 assert.equal(claims.length,2);assert.equal(claims[0].requestId,claims[1].requestId);
 assert.equal(fixture.creates,0);assert.equal(fixture.values.size,0);
});
test('independent runtime continuations sharing the same pending claim never create twice',async()=>{
 const fixture=runtimeFixture({concurrentAbsence:true});
 const results=await Promise.allSettled([fixture.repository().upload(value()),fixture.repository().upload(value())]);
 const claims=fixture.calls.filter(q=>q.action==='upload.claim');
 assert.equal(claims.length,2);assert.equal(claims[0].requestId,claims[1].requestId);
 assert.equal(fixture.creates,1);assert.ok(results.some(result=>result.status==='fulfilled'));
});
test('one repository refuses an overlapping upload continuation before provider creation',async()=>{
 const fixture=runtimeFixture(),repo=fixture.repository();
 const results=await Promise.allSettled([repo.upload(value()),repo.upload(value())]);
 assert.equal(fixture.creates,1);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.match(results.find(r=>r.status==='rejected').reason.message,/läuft bereits/);
});

test('resumed pending claim cannot create even when its first server acknowledgment is applied',async()=>{
 const fixture=runtimeFixture({failBeforeClaim:true});
 await assert.rejects(()=>fixture.repository().upload(value()),/not delivered/);
 assert.equal(fixture.row.status,'selected');
 await assert.rejects(()=>fixture.repository().upload(value()),/Unklar/);
 assert.equal(fixture.row.status,'uploading');assert.equal(fixture.creates,0);
 const claims=fixture.calls.filter(q=>q.action==='upload.claim');assert.equal(claims[0].requestId,claims[1].requestId);
});
