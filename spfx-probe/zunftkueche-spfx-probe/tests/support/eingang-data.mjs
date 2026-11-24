// Kleine Küche für die Tests des Eingangs: zwei Lieferanten, Artikel mit einem, zwei oder keinem Gebinde.
import {stored,workspace} from './kitchen-data.mjs';
const art=(id,name,unit='Flasche',category='Getränke')=>stored({id,name,unit,category,active:true});
const off=(id,articleId,supplierId,packName,packSize,priceNet=10)=>stored({id,articleId,supplierId,code:id.toUpperCase(),packName,packSize,priceNet,priceDate:'2026-10-26',deposit:null,note:'',active:true});
const sup=(id,name,extra={})=>stored({id,name,phone:'',email:'',method:'Telefon',customerNumber:'',note:'',active:true,...extra});
export function kitchen(){
 const s=workspace();
 s.suppliers=[sup('braun','Getränke Braun',{customerNumber:'K-1'}),sup('wald','Waldhaus'),sup('alt','Altlieferant',{active:false})];
 s.articles=[art('pils33','Pils 0,33 l'),art('pils50','Pils 0,5 l'),art('spezi','Spezi'),art('cola','Cola'),art('fass','Fassbier Hell','Liter'),art('salz','Salz','kg','Trockenware'),art('weg','Ausgelistet'),art('wein','Gutedel trocken 0,75 l','Fl','Getränk')];
 s.articles[6].value.active=false;
 s.offers=[off('p33','pils33','braun','Kasten',24),off('p50','pils50','braun','Kasten',20),off('sp','spezi','braun','Kasten',24),off('co','cola','braun','Kasten',24),off('co2','cola','wald','Kasten',12),off('fa','fass','wald','Fass',30),off('alt','spezi','alt','Kasten',24),off('gu','wein','wald','Flasche',1)];
 s.orders=[];
 return s;
}
