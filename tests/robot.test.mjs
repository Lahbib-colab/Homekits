import { createStore } from '../js/store.js';
import { SimulatedDriver } from '../js/drivers.js';
import { roomLinks, planRoute, planReturn, estimate, ROBOT } from '../js/robot.js';
import { duplexPlan } from '../js/plan.js';
let fails=0; const ok=(c,m)=>{ if(!c){fails++;console.log('ÉCHEC',m);} else console.log('ok  ',m); };
const mem={}; const storage={getItem:k=>mem[k]??null,setItem:(k,v)=>{mem[k]=v;}};
const drv=new SimulatedDriver(); const s=createStore({driver:drv,storage,clock:()=>new Date('2026-09-28T11:00:00')}); drv.attach(s);
const st=s.state, va=s.device('robot-aspi');
// --- graphe des pièces
const links=roomLinks(st,0); const pairs=links.map(l=>[l.a,l.b].sort().join('|'));
ok(pairs.includes('cuisine|salon') && pairs.includes('chp|salon') && pairs.includes('cuisine|garage') && pairs.includes('che|cuisine'),'graphe : salon↔cuisine, salon↔chambre, cuisine↔garage, cuisine↔chambre enfant ('+links.length+' passages)');
// --- itinéraire multi-pièces
const r=planRoute(st,va,['cuisine','salon']);
ok(r.order[0]==='salon' && r.order[1]==='cuisine','ordre : la pièce du dock (salon) d’abord, puis la cuisine');
ok(r.pts.some(p=>Math.abs(p[0]-6.4)<0.01&&Math.abs(p[1]-6.9)<0.01),'l’itinéraire franchit la porte salon/cuisine (6,4 ; 6,9)');
ok(r.legs.length===2 && r.cleanEnd>r.legs[1].s1-0.01 && r.returnLen>4,'2 pièces, retour à la base de '+r.returnLen.toFixed(1)+' m');
const pool=planRoute(st,va,['salon','piscine']); ok(pool.unreachable.includes('piscine') && pool.order.length===1,'la piscine (extérieure) est signalée inaccessible');
const far=planRoute(st,va,['garage']); ok(far.order[0]==='garage' && far.total>25,'garage atteint via cuisine (itinéraire '+far.total.toFixed(0)+' m)');
const e1=estimate(planRoute(st,va,['salon']),'auto',100), e2=estimate(planRoute(st,va,['salon','cuisine','chp']),'auto',100), e3=estimate(planRoute(st,va,['salon']),'turbo',100);
ok(e2.clean>e1.clean && e3.clean<e1.clean,'estimations : plus de pièces = plus long ; turbo plus rapide ('+Math.round(e1.clean)+' s / '+Math.round(e2.clean)+' s / '+Math.round(e3.clean)+' s)');
// --- simulation : salon + cuisine
s.setDevice(va.id,{rooms:['salon','cuisine']}); s.setDevice(va.id,{command:'start',mode:'turbo'});
let visitedKitchen=false, prevEta=1e9, monotone=true, t=0, sawReturn=false;
while(t<400 && !(va.state.status==='charging'||va.state.status==='docked') ){ s.tick(0.5); t+=0.5; if(va.state.x>6.6) visitedKitchen=true; if(va.state.status==='cleaning'){ if(va.state.etaBase>prevEta+0.6) monotone=false; prevEta=va.state.etaBase; } if(va.state.status==='returning') sawReturn=true; }
ok(visitedKitchen,'le robot est allé nettoyer la cuisine (x>6,6)');
ok(va.state.done.includes('salon')&&va.state.done.includes('cuisine'),'pièces faites : '+va.state.done.join(', '));
ok(sawReturn && Math.abs(va.state.x-0.4)<0.06 && Math.abs(va.state.z-5.3)<0.06,'retour à la base terminé après '+t+' s');
ok(monotone,'le temps estimé avant retour à la base ne cesse de diminuer'); ok(va.state.battery<100 && va.state.progress===100,'batterie consommée, progression 100 %');
// --- retour depuis la cuisine par la porte
for(let i=0;i<120;i++) s.tick(0.5);
s.setDevice(va.id,{rooms:['cuisine']}); s.setDevice(va.id,{command:'start'}); let inKitchen=false; for(let i=0;i<400 && !inKitchen;i++){ s.tick(0.5); if(va.state.x>7.5 && va.state.curName==='Cuisine') inKitchen=true; }
ok(inKitchen,'nettoyage de la cuisine seule : robot en cuisine ('+va.state.curName+')');
s.setDevice(va.id,{command:'dock'}); ok(va.state.status==='returning','commande « retour à la base » en cours de route');
let crossed=false; for(let i=0;i<200 && va.state.status==='returning';i++){ s.tick(0.5); if(Math.abs(va.state.x-6.4)<0.35&&Math.abs(va.state.z-6.9)<0.35) crossed=true; }
ok(crossed && (va.state.status==='charging'||va.state.status==='docked'),'le robot repasse par la porte avant de rejoindre la base : '+va.state.status);
// --- batterie faible → recharge → reprise
for(let i=0;i<200 && va.state.battery<99;i++) s.tick(0.5); s.patchLive(va.id,{battery:20});
s.setDevice(va.id,{rooms:['salon','cuisine','chp','garage'],done:[]}); s.setDevice(va.id,{command:'start',mode:'turbo'});
let low=false, charged=false, resumed=false, finished=false;
for(let i=0;i<4000 && !finished;i++){ s.tick(0.5); if(va.state.status==='returning'&&va.state.resume) low=true; if(va.state.status==='charging'&&va.state.resume) charged=true; if(low&&charged&&va.state.status==='cleaning') resumed=true; if(resumed&&(va.state.status==='docked')) finished=true; }
ok(low,'batterie faible : retour à la base automatique'); ok(charged&&resumed,'recharge puis reprise automatique du nettoyage'); ok(finished && va.state.done.length===4,'toutes les pièces nettoyées après reprise : '+va.state.done.join(', '));
// --- murs ouverts (maison à étage : salon/cuisine ouverts)
const S2=duplexPlan(); const l2=roomLinks(S2,0).filter(l=>l.kind==='open'); ok(l2.length===1&&[l2[0].a,l2[0].b].sort().join('|')==='cuisine|salon','mur ouvert salon/cuisine = passage du robot');
console.log(fails?fails+' ÉCHEC(S)':'TOUT OK');
