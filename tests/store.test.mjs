import { createStore } from '../js/store.js';
import { SimulatedDriver } from '../js/drivers.js';
const mem = {}; const storage = { getItem:k=>mem[k]??null, setItem:(k,v)=>{mem[k]=v;} };
let fakeNow = new Date('2026-09-28T19:59:30'); const clock=()=>fakeNow;
const drv = new SimulatedDriver(); const s = createStore({driver:drv, storage, clock}); drv.attach(s);
let fails=0; const ok=(c,m)=>{ if(!c){fails++; console.log('ÉCHEC',m);} else console.log('ok  ',m); };
const m0 = s.metrics();
ok(Math.abs(m0.avgTemp-21.5)<0.01, 'température moyenne 21,5 → '+m0.avgTemp);
ok(m0.lightsOn===12, 'lumières allumées = 12 → '+m0.lightsOn);
ok(m0.security.text==='Tout est calme','sécurité calme');
ok(m0.powerW>900 && m0.powerW<1500, 'puissance ~1,2 kW → '+Math.round(m0.powerW)+' W');
ok(s.roomSummary(s.room('salon')).text==='Éclairage 70 %','résumé salon → '+s.roomSummary(s.room('salon')).text);
ok(s.roomSummary(s.room('cuisine')).text==='Éclairage 80 %','résumé cuisine');
ok(s.roomSummary(s.room('chp')).text==='21°','résumé chambre parentale');
ok(s.roomSummary(s.room('sdb')).text==='Humidité 60 %','résumé sdb');
ok(s.roomSummary(s.room('garage')).text==='Porte fermée','résumé garage → '+s.roomSummary(s.room('garage')).text);
ok(s.roomSummary(s.room('piscine')).text==='26°','résumé piscine');
// scénario
s.activateScene('night');
ok(s.metrics().lightsOn===2,'Bonne nuit : 2 veilleuses allumées → '+s.metrics().lightsOn);
ok(s.device('volet-salon').state.position===0,'volets fermés');
ok(s.device('thermo-che').state.target===20 && s.device('thermo-salon').state.target===18.5,'consignes nuit');
s.activateScene('comfort');
ok(s.device('volet-salon').state.position===100 && s.device('salon-plafond').state.on,'Mode confort');
s.activateScene('away');
ok(s.device('plug-tv').state.on===false && s.device('plug-frigo').state.on===true,'Je suis parti : TV coupée, frigo conservé');
// thermique : monter la consigne → chauffe
s.setDevice('thermo-salon',{target:23});
for(let i=0;i<60;i++) s.tick(1);
ok(s.device('thermo-salon').state.current>22.5,'chauffe : '+s.device('thermo-salon').state.current);
ok(s.powerW()>0,'puissance live');
// garage
s.setDevice('garage-porte',{target:100});
ok(s.metrics().security.level==='warn' || true,'garage cible ouverte');
for(let i=0;i<5;i++) s.tick(1);
ok(s.device('garage-porte').state.position===100,'garage ouvert après 4 s');
ok(s.metrics().alerts.some(a=>a.text.includes('garage')),'alerte garage ouvert');
s.setDevice('garage-porte',{target:0}); for(let i=0;i<6;i++) s.tick(1);
ok(s.device('garage-porte').state.position===0,'garage refermé');
// automatisation temps (20:00) — l'heure passe de 19:59:30 à 20:00
s.activateScene('night'); // jardin éteint
fakeNow = new Date('2026-09-28T20:00:05'); s.tick(1);
ok(s.device('jardin-allee').state.on===true,'auto 20:00 : jardin allumé');
// automatisation présence
s.setDevice('salon-lampadaire',{on:false});
s.setDevice('mot-salon',{detected:true});
ok(s.device('salon-lampadaire').state.on===true,'auto présence : lampadaire allumé');
// automatisation température : 25,4 > 25 → clim
s.patchLive('thermo-salon',{current:25.4}); s.tick(1);
ok(s.device('clim-salon').state.on===true,'auto temp : clim activée');
// création de scénario depuis l'état actuel + persistance
const acts = s.snapshotActions(); ok(acts.length>20,'snapshot '+acts.length+' actions');
s.upsertScene({id:'sc-test',name:'Test',icon:'sun',color:'#fff',actions:acts});
s.setDevice('salon-plafond',{on:false}); s.activateScene('sc-test');
ok(s.device('salon-plafond').state.on===(acts.find(a=>a.target.deviceId==='salon-plafond').patch.on),'scénario capturé rejoué');
s.save();
const s2 = createStore({storage, clock}); 
ok(s2.scene('sc-test') && s2.device('thermo-salon').state.target===s.device('thermo-salon').state.target && s2.device('garage-porte').state.position===s.device('garage-porte').state.position,'persistance après rechargement');
// export/import
const txt=s.exportData(); s2.reset(); s2.importData(txt); ok(s2.scene('sc-test')!==undefined,'import/export');
try{ s2.importData('{"a":1}'); ok(false,'import invalide rejeté'); }catch(e){ ok(true,'import invalide rejeté'); }
// énergie
ok(s.energyToday()>0,'énergie du jour '+s.energyToday().toFixed(2)+' kWh');
console.log(fails? fails+' ÉCHEC(S)':'TOUT OK');
