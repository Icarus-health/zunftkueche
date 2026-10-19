// New protocol evidence only; historical import/corpus/evidence files stay unchanged.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {applyEventOperation} from '../src/domain/event-context.ts';
let state={...JSON.parse(readFileSync('import/2026.json')),schemaVersion:2,revision:0,operationIds:[],operationRequests:{}};
const identity={organizationId:'00000000-0000-0000-0000-000000000000',userId:'00000000-0000-0000-0000-000000000000',workspaceId:'11111111-2222-4333-8444-555555555555'};
const corpus={initial:structuredClone(state),requests:[]},original=state.event.id;
function apply(targetEventId,type,payload){const op={id:`v2-${corpus.requests.length}`,baseRevision:state.revision,targetEventId,type,payload};const next=applyEventOperation(state,targetEventId,op).state;corpus.requests.push({protocolVersion:2,workspaceId:identity.workspaceId,identity,targetEventId,operationId:op.id,expectedRevision:op.baseRevision,operation:{type,payload},candidateState:next});state=next;}
apply(original,'event.settings',{name:state.event.name,year:2026,dates:{Mittwoch:'2026-02-11'},deliveryAddress:'Synthetic address',contact:'Synthetic contact',locations:[]});
apply(original,'article.price',{articleId:'a-1',priceCents:123.45});
apply(original,'order.prepare',{supplierId:'s-wiggenhauser',day:'Mittwoch'});
apply(original,'event.create',{name:'Synthetic next',year:2027,copyPlan:true});
apply(original,'article.price',{articleId:'a-1',priceCents:234.56});
apply(original,'order.prepare',{supplierId:'s-wiggenhauser',day:'Mittwoch'});
apply(original,'event.create',{name:'Synthetic from archive',year:2028,copyPlan:false});
mkdirSync('server/Tests/obj',{recursive:true});writeFileSync('server/Tests/obj/protocol-v2-corpus.json',JSON.stringify(corpus));
