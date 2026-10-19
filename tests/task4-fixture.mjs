import{readFileSync}from'node:fs';import{applyOperation}from'../src/domain/state.ts';
export const seed={...JSON.parse(readFileSync('import/2026.json')),revision:0,operationIds:[]};
export const run=(s,type,payload,id=type+s.revision)=>applyOperation(s,{id,baseRevision:s.revision,type,payload}).state;
