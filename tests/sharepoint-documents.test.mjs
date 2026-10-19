import test from 'node:test';
import assert from 'node:assert/strict';
const mod=await import('../src/data/sharepoint-documents.ts').catch(()=>({}));
test('all meaningful principal values must match and unknown claims cannot be hidden by Email',()=>{assert.equal(typeof mod.matchSharePointPrincipal,'function');assert.equal(mod.matchSharePointPrincipal('a@b',{Email:'a@b',LoginName:'i:0#.f|membership|a@b'}),true);for(const LoginName of ['other@b','unknown|a@b',42])assert.equal(mod.matchSharePointPrincipal('a@b',{Email:'a@b',LoginName}),false);});
test('binary download accepts actual Uint8Array and does not turn unknown values into empty images',()=>{assert.equal(typeof mod.sharePointBytes,'function');assert.deepEqual(mod.sharePointBytes(Uint8Array.of(1,2)),Uint8Array.of(1,2));assert.throws(()=>mod.sharePointBytes({}),/Binär/);});
