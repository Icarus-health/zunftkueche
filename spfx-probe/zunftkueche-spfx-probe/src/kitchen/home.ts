import type {Area,Season,Workspace} from './model';
import {articleAvailable} from './model.ts';
import {button,h,empty} from './markup.ts';
import {latestCounts,deliveryState,countQuantity} from './operations.ts';
import {deliveryTasks,orderDeadlines} from './workflow-tasks.ts';
import {icon} from './icons.ts';

/** One entry per daily workflow; detailed checks remain with the relevant task. */
export function dashboard(state:Workspace,season:Season|undefined,area:Area,todayOverride?:string):string{
 if(!season)return '<div class="page-heading"><h1>Mit der ersten Saison beginnen</h1></div>'+button('season-new','Saison anlegen','',true);
 const today=todayOverride||new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Berlin'});
 const orders=state.orders.filter(r=>r.value.seasonId===season.id&&r.value.area===area&&!/^historisch(?:e|er|es)?\b/i.test(r.value.occasion.trim())&&r.value.status!=='Storniert').map(r=>r.value);
 const drafts=orders.filter(o=>o.status==='Entwurf'),pending=orders.filter(o=>o.status==='Bestellt'&&deliveryState(o)!=='Vollständig geliefert');
 const due=deliveryTasks(orders,season.id,area,today),counts=latestCounts(state,season.id,area).filter(c=>state.articles.some(a=>a.value.id===c.articleId&&articleAvailable(a.value,season.id))),needs=counts.filter(c=>c.reorder);
 const inventory=state.inventories?.find(r=>r.value.seasonId===season.id&&r.value.area===area&&r.value.status==='Entwurf');
 const lastCount=state.inventories?.filter(r=>r.value.seasonId===season.id&&r.value.area===area&&r.value.status==='Abgeschlossen').map(r=>r.value).sort((a,b)=>(b.completedAt||'').localeCompare(a.completedAt||''))[0];
 const countStatus=lastCount?'Letzter Abschluss: '+lastCount.lines.filter(l=>countQuantity(l.packs,l.loose,l.packSize)!==null).length+' von '+lastCount.lines.length+' Artikeln gezählt':counts.length+' von '+state.articles.filter(a=>articleAvailable(a.value,season.id)).length+' Artikeln zuletzt gezählt';
 const date=new Intl.DateTimeFormat('de-DE',{weekday:'long',day:'numeric',month:'long'}).format(new Date(today+'T12:00:00Z'));
 const steps=[
  ['Bestellrunde',state.suppliers.filter(s=>s.value.active).length+' Lieferanten',season.archived?'orders':'',season.archived?'nav':'order-round',season.archived?'Ansehen':'Vorbereiten'],
  ['Warenannahme',due.length?due.length+' offene Liefertermine für heute oder früher':pending.length?pending.length+' '+(pending.length===1?'Bestellung':'Bestellungen')+' mit offener Lieferung':'Heute keine offenen Lieferungen', '', 'delivery-list','Ansehen'],
  ['Abendabschluss',inventory?'Gespeicherte Zählung fortsetzen':countStatus,season.archived?'stock':inventory?.value.id||'',season.archived?'nav':inventory?'inventory-edit':state.inventoriesReady===false?'inventory-setup':'inventory-new',season.archived?'Ansehen':inventory?'Fortsetzen':'Starten']
 ];
 const symbols=['cart','truck','count'];
 const rows=steps.map(([title,description,id,action,label],index)=>'<div class="workflow-start"><div class="home-workflow-name">'+icon(symbols[index])+'<h2>'+title+'</h2></div><p>'+h(description)+'</p>'+button(action,label,id,index===0)+'</div>').join('');
 const notices:string[]=[];
 if(drafts.length)notices.push('<div class="calm-notice"><span>'+drafts.length+' '+(drafts.length===1?'Bestellentwurf':'Bestellentwürfe')+' vorbereiten und prüfen</span>'+button('dashboard-orders','Entwürfe prüfen','current-drafts')+'</div>');
 if(needs.length)notices.push('<div class="calm-notice"><span>'+needs.length+' Artikel zum Nachbestellen · '+h(needs.slice(0,2).map(c=>c.articleName+(c.note?' – '+c.note:'')).join(', '))+'</span>'+button('reorder-list','Nachbestellbedarf prüfen')+'</div>');
 for(const d of orderDeadlines(state,season.id,area).slice(0,3))notices.push('<div class="calm-notice"><span>'+h(d.order.supplierName)+' · Bestellschluss '+h(d.deadline.replace('T',' · '))+'</span>'+button('order-open','Prüfen',d.order.id)+'</div>');
 const preparation=!season.archived&&state.ww?.ready?button('ww-open','Karte und Bedarf','recipes',true):'';
 return '<div class="page-heading calm-home-heading"><div><h1>Übersicht</h1><p>'+h(area+' / '+season.name)+' <span class="overview-date">'+h(date)+'</span></p></div>'+preparation+'</div><section class="workflow-starts" aria-label="Küchenabläufe">'+rows+'</section>'+(season.archived?'<p class="calm-hint">Diese Saison ist archiviert.</p>':'')+'<section class="calm-notices"><h2>Offene Punkte</h2>'+(notices.join('')||'<p class="muted">Zurzeit stehen keine weiteren Aufgaben an.</p>')+'</section>';
}

export function deliveryRound(state:Workspace,season:Season|undefined,area:Area):string{
 if(!season)return empty('Bitte eine Saison wählen.');
 const orders=state.orders.map(r=>r.value).filter(o=>!/^historisch(?:e|er|es)?\b/i.test(o.occasion.trim()));
 const all=deliveryTasks(orders,season.id,area,'9999-12-31').sort((a,b)=>(a.date||'9999').localeCompare(b.date||'9999')||a.order.supplierName.localeCompare(b.order.supplierName,'de'));
 return '<div class="calm-heading"><div>'+button('cancel','Zurück')+'<h1>Warenannahme</h1></div></div><section class="delivery-round">'+(all.map(d=>'<div class="workflow-start"><div><h2>'+h(d.order.supplierName)+'</h2><p>'+h(d.date?new Intl.DateTimeFormat('de-DE',{weekday:'short',day:'2-digit',month:'2-digit'}).format(new Date(d.date+'T12:00:00')):'Termin offen')+(d.time?' · '+h(d.time):'')+' · '+h(d.place||area)+'</p></div>'+button(season.archived?'order-open':'receipt-new',season.archived?'Ansehen':'Annehmen',season.archived?d.order.id:d.order.id+(d.deliveryId?'|'+d.deliveryId:''))+'</div>').join('')||empty('Keine offenen Lieferungen.'))+'</section>';
}
