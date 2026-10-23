import {test} from 'node:test';import assert from 'node:assert/strict';
import {parseCsv,previewMasters} from '../src/kitchen/csv.ts';
test('CSV handles BOM quoted separators quotes and multiline notes',()=>{assert.deepEqual(parseCsv('\ufeffName;Hinweise\r\n"Getränke; Markt";"Er sagte ""ja""\nNotiz"'),[['Name','Hinweise'],['Getränke; Markt','Er sagte "ja"\nNotiz']]);});
test('an unclosed CSV quote rejects the whole preview',()=>{assert.throws(()=>parseCsv('Name;Einheit\n"Wasser;Flasche'),/Anführungszeichen/);});
test('duplicate names and missing units prevent article import',()=>{const result=previewMasters('articles','Name;Einheit;Kategorie\nWasser;Flasche;Getränke\nMehl;;Lebensmittel',['Wasser']);assert.equal(result.errors.length,2);});
test('wrong header names are reported instead of silently dropping supplier fields',()=>{assert.throws(()=>previewMasters('suppliers','Name;Telephon\nMarkt;123',[]),/Telephon/);});
test('a valid preview trims cell values and preserves explicit zero characters',()=>{const result=previewMasters('articles','Name;Einheit;Kategorie\n Wasser ; Flasche ; 0 ',[]);assert.equal(result.errors.length,0);assert.equal(result.rows[0].Name,'Wasser');assert.equal(result.rows[0].Kategorie,'0');});
