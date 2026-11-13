import type {Supplier,Offer} from './model';
/** Old notes may identify uncertainty, but never silently certify a supplier. */
export function supplierNeedsReview(s:Supplier):boolean{return (s.method==='Telefon'&&!s.phone.trim())||(s.method==='E-Mail'&&!s.email.trim())||s.reviewStatus==='offen'||(!s.reviewStatus&&/(?:\bprüfen\b|unbestätigt|platzhalter|unklar|noch offen)/i.test(s.note));}
export function offerNeedsReview(o:Offer):boolean{return o.priceNet===null||!o.priceDate||o.priceStatus==='offen'||o.priceStatus==='angefragt'||o.priceStatus==='erhalten'||(o.priceStatus!=='geprueft'&&/\bprüfen\b|unklar|gestrichen|inaktiv/i.test(o.note));}
