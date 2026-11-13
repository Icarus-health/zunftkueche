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
 const preparation=!season.archived&&state.ww?.ready?'<div class="workflow-start"><div class="home-workflow-name">'+icon('calendar')+'<h2>Karte und Bedarf</h2></div><p>Rezepte, Preise und Planung</p>'+button('ww-open','Öffnen','recipes')+'</div>':'';
 const rows=preparation+steps.map(([title,description,id,action,label],index)=>'<div class="workflow-start"><div class="home-workflow-name">'+icon(symbols[index])+'<h2>'+title+'</h2></div><p>'+h(description)+'</p>'+button(action,label,id)+'</div>').join('');
 /* Offene Punkte. Genau einer davon wird als nächster Schritt hervorgehoben: zuerst Fälliges von heute, dann Bestellschluss, dann Entwürfe, dann Nachbestellbedarf. */
 type Task={text:string;action:string;id:string;label:string};
 const tasks:Task[]=[];
 if(drafts.length)tasks.push({text:drafts.length+' '+(drafts.length===1?'Bestellentwurf':'Bestellentwürfe')+' vorbereiten und prüfen',action:'dashboard-orders',id:'current-drafts',label:'Entwürfe prüfen'});
 if(needs.length)tasks.push({text:needs.length+' Artikel zum Nachbestellen · '+needs.slice(0,2).map(c=>c.articleName+(c.note?' – '+c.note:'')).join(', '),action:'reorder-list',id:'',label:'Nachbestellbedarf prüfen'});
 const deadlines:Task[]=orderDeadlines(state,season.id,area).slice(0,3).map(d=>({text:d.order.supplierName+' · Bestellschluss '+d.deadline.replace('T',' · '),action:'order-open',id:d.order.id,label:'Prüfen'}));
 tasks.push(...deadlines);
 const today_:Task|undefined=due.length?{text:due.length+' '+(due.length===1?'offener Liefertermin':'offene Liefertermine')+' für heute oder früher',action:'delivery-list',id:'',label:'Warenannahme öffnen'}:inventory?{text:'Gespeicherte Zählung fortsetzen',action:'inventory-edit',id:inventory.value.id,label:'Zählung fortsetzen'}:undefined;
 const next=season.archived?undefined:today_||deadlines[0]||tasks[0];
 const notices=tasks.filter(task=>task!==next).map(task=>'<div class="calm-notice"><span>'+h(task.text)+'</span>'+button(task.action,task.label,task.id)+'</div>');
 const nextStep=next?'<section class="next-step" aria-label="Nächster Schritt"><p class="next-step-label">Nächster Schritt</p><h2>'+h(next.text)+'</h2>'+button(next.action,next.label,next.id,true)+'</section>':'';
 return '<div class="page-heading calm-home-heading"><div><h1>Übersicht</h1><p>'+h(area+' / '+season.name)+' <span class="overview-date">'+h(date)+'</span></p></div>'+nextStep+'</div><section class="workflow-starts" aria-label="Küchenabläufe">'+rows+'</section>'+(season.archived?'<p class="calm-hint">Diese Saison ist archiviert.</p>':'')+'<section class="calm-notices"><h2>'+(next?'Weitere offene Punkte':'Offene Punkte')+'</h2>'+(notices.join('')||'<p class="muted">Zurzeit stehen keine weiteren Aufgaben an.</p>')+'</section>';
}

export function deliveryRound(state:Workspace,season:Season|undefined,area:Area):string{
 if(!season)return empty('Bitte eine Saison wählen.');
 const orders=state.orders.map(r=>r.value).filter(o=>!/^historisch(?:e|er|es)?\b/i.test(o.occasion.trim()));
 const all=deliveryTasks(orders,season.id,area,'9999-12-31').sort((a,b)=>(a.date||'9999').localeCompare(b.date||'9999')||a.order.supplierName.localeCompare(b.order.supplierName,'de'));
 return '<div class="calm-heading"><div>'+button('cancel','Zurück')+'<h1>Warenannahme</h1></div></div><section class="delivery-round">'+(all.map(d=>'<div class="workflow-start"><div><h2>'+h(d.order.supplierName)+'</h2><p>'+h(d.date?new Intl.DateTimeFormat('de-DE',{weekday:'short',day:'2-digit',month:'2-digit'}).format(new Date(d.date+'T12:00:00')):'Termin offen')+(d.time?' · '+h(d.time):'')+' · '+h(d.place||area)+'</p></div>'+button(season.archived?'order-open':'receipt-new',season.archived?'Ansehen':'Annehmen',season.archived?d.order.id:d.order.id+(d.deliveryId?'|'+d.deliveryId:''))+'</div>').join('')||empty('Keine offenen Lieferungen.'))+'</section>';
}
