import { applyOperation } from './state.ts';
import type { KitchenState, EventArchive, Operation, CommitResult } from './state.ts';
export function eventSnapshot(state: KitchenState): EventArchive {
  const {archivedEvents,revision,operationIds,operationRequests,...slice}=structuredClone(state);
  return slice;
}
/** Projection never mutates the authoritative aggregate or makes a global selection. */
export function projectEvent(state: KitchenState,eventId: string): KitchenState {
  if(state.event.id===eventId)return structuredClone(state);
  const target=state.archivedEvents?.find(e=>e.event.id===eventId);
  if(!target)throw new Error('Veranstaltung nicht gefunden. Bitte neu laden.');
  return {...structuredClone(target),revision:state.revision,operationIds:structuredClone(state.operationIds),operationRequests:structuredClone(state.operationRequests),archivedEvents:[...(structuredClone(state.archivedEvents??[])).filter(e=>e.event.id!==eventId),eventSnapshot(state)]};
}
export function applyEventOperation(state: KitchenState,eventId: string,operation: Operation): CommitResult {
  if(operation.type==='event.switch')throw new Error('Veranstaltungsauswahl ist persönlich; bitte neu laden.');
  const projected=projectEvent(state,eventId);
  const op={...operation,targetEventId:eventId};
  const result=applyOperation(projected,op);
  if(result.status==='conflict'||result.state===projected)return {status:result.status,state:structuredClone(state)};
  if(op.type==='event.create') {
    // Create from the selected source, preserving all old slices in canonical order.
    result.state.archivedEvents=[...structuredClone(state.archivedEvents??[]),eventSnapshot(state)];
    return result;
  }
  const next=structuredClone(state),slice=eventSnapshot(result.state);
  if(state.event.id===eventId)Object.assign(next,slice);
  else next.archivedEvents=next.archivedEvents!.map(e=>e.event.id===eventId?slice:e);
  next.revision=result.state.revision;next.operationIds=result.state.operationIds;next.operationRequests=result.state.operationRequests;
  return {status:'saved',state:next};
}
