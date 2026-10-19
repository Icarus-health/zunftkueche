import type {Repository} from '../../src/data/repository.ts';
import type {DocumentRepository, DocumentRow, ExtractDraft} from '../../src/data/documents.ts';
import {applyEventOperation, projectEvent} from '../../src/domain/event-context.ts';
import {professionalFixture} from './professional-state.ts';
import {validateOriginal} from '../../src/data/documents.ts';
import {suppliedText} from '../../src/ocr/receipt-parser.ts';

// Test-only alias used solely by professional-vite.config.ts. No production injection path.
export class RejectedError extends Error {}
let state = professionalFixture();
let sequence = 1;
const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aO1sAAAAASUVORK5CYII='), character => character.charCodeAt(0));
const blobs = new Map<string, Blob>();
const documents: DocumentRow[] = ['fixture-open', 'fixture-closed'].map((eventId, index) => {
  const id = `${index + 1}1111111-1111-4111-8111-111111111111`;
  const ref = {provider: 'sharepoint' as const, siteCollectionId: 'synthetic-site', webId: 'synthetic-web', libraryId: 'synthetic-library', itemId: id, version: 'synthetic-v1', connectorIdentifier: 'synthetic', webUrl: 'https://example.invalid/synthetic-original', sha256: 'c97e255bba6143711779d73e61726eab398ef2d29caaa632083e59315d60f243', size: png.byteLength, mimeType: 'image/png', originalName: 'SYNTHETISCHES 1×1 TESTORIGINAL.png'};
  blobs.set(id, new Blob([png], {type: 'image/png'}));
  return {id, eventId, uploadId: id, rowVersion: '1', status: 'linked' as const, principal: 'synthetic-owner', ...ref, ref};
});
const drafts: ExtractDraft[] = documents.map((row, index) => ({schemaVersion: 1, id: `${index + 3}3333333-1111-4111-8111-111111111111`, eventId: row.eventId, rowVersion: '1', source: 'manual', parserVersion: null, modelVersion: null, promptVersion: null, reviewStatus: 'editing', pages: [{documentId: row.id, documentRowVersion: row.rowVersion, version: row.ref!.version, sha256: row.sha256, originalReviewed: false}], header: {supplierId: 'supplier-a', number: 'TEST-7A', date: '2026-10-19', scope: 'Küche', grossCents: 1234}, lines: [{id: '55555555-1111-4111-8111-111111111111', description: 'Kartoffeln', articleId: 'article-a', quantity: 1.25, unit: 'kg', grossCents: 1234}], textAssist: suppliedText('Testmarkt Nord\nRechnungsnummer TEST-7A\nRechnungsdatum 19.10.2026\nGesamt brutto 12,34 EUR', state.suppliers)}));
const documentRepository: DocumentRepository = {
  list: async () => structuredClone({documents, drafts}),
  getOriginal: async ref => {
    const blob = blobs.get(ref.itemId);
    if (!blob) throw new RejectedError('Synthetisches Original fehlt.');
    return blob;
  },
  loadUpload: async uploadId => documents.find(row => row.uploadId === uploadId)?.status ?? 'selected',
  upload: async ({eventId, uploadId, file}) => {
    if (projectEvent(state, eventId).event.status === 'Abgeschlossen') throw new RejectedError('Veranstaltung ist abgeschlossen.');
    await validateOriginal(file);
    const id = crypto.randomUUID();
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()))].map(byte => byte.toString(16).padStart(2, '0')).join('');
    const ref = {...documents[0].ref!, itemId: id, sha256: hash, originalName: file.name, size: file.size, mimeType: file.type};
    const row: DocumentRow = {id, eventId, uploadId, rowVersion: String(++sequence), status: 'linked', principal: 'synthetic-owner', sha256: hash, originalName: file.name, size: file.size, mimeType: file.type, ref};
    documents.push(row); blobs.set(id, file);
    return structuredClone(ref);
  },
  saveDraft: async draft => {
    if (projectEvent(state, draft.eventId).event.status === 'Abgeschlossen') throw new RejectedError('Veranstaltung ist abgeschlossen.');
    const existing = drafts.findIndex(item => item.id === draft.id);
    if (existing >= 0 && drafts[existing].acceptance) throw new RejectedError('Bereits übernommen.');
    const saved = {...structuredClone(draft), rowVersion: String(++sequence)};
    if (existing >= 0) drafts[existing] = saved; else drafts.push(saved);
    return structuredClone(saved);
  },
};
const repository: Repository = {
  mode: 'local', canWrite: true, canEdit: true, canConfigure: true, canClose: true, identity: null,
  documents: documentRepository,
  load: async () => structuredClone(state),
  commit: async operation => {
    try {
      const replay = state.operationIds.includes(operation.id);
      const result = applyEventOperation(state, operation.targetEventId ?? state.event.id, operation);
      state = result.state;
      if (!replay && operation.type === 'receipt.draft.accept') {
        const draft = drafts.find(item => item.id === operation.payload.draftId)!;
        draft.reviewStatus = 'accepted'; draft.rowVersion = String(++sequence);
        draft.acceptance = {operationId: operation.id, receiptId: draft.id, requestHash: 'b'.repeat(64), appliedRevision: state.revision, actorId: 'synthetic-owner', recordedAt: new Date().toISOString(), reviewedFields: operation.payload.reviewedFields, reviewDecisions: operation.payload.reviewDecisions, documentVersion: operation.payload.documentVersion};
      }
      return structuredClone(result);
    } catch (error) { throw new RejectedError((error as Error).message); }
  },
};
export function getRepository(): Repository { return repository; }
