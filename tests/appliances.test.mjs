import { createStore } from '../js/store.js';
import { SimulatedDriver, vacPath, pathPoint } from '../js/drivers.js';
import { defaultHouse } from '../js/data.js';
import { newDevice } from '../js/plan.js';
const mem={}; const storage={getItem:k=>mem[k]??null,setItem:(k,v)=>{mem[k]=v;}};
const drv=new SimulatedDriver(); const s=createStore({driver:drv,storage,clock:()=>new Date('2026-09-28T11:00:00')}); drv.attach(s);
let fails=0; const ok=(c,m)=>{ if(!c){fails++;console.log('ÉCHEC',m);} else console.log('ok  ',m); };
const st=s.state;
const dw=newDevice(st,{roomId:'cuisine',type:'dishwasher',name:'Lave-vaisselle',pos:[11.6,0.5,4.5],props:{watts:1800}});
const mw=newDevice(st,{roomId:'cuisine',type:'microwave',name:'Micro-ondes',pos:[11.7,1.1,6.9],props:{watts:1200}});
const va=newDevice(st,{roomId:'salon',type:'vacuum',name:'Robot aspirateur',pos:[0.4,0.1,5.0],props:{dock:[0.4,5.0]},state:{x:0.4,z:5.0,ang:0}});
// lave-vaisselle
s.setDevice(dw.id,{command:'start',program:'rapide'}); ok(dw.state.status==='running'&&dw.state.remaining===45,'lave-vaisselle : démarrage programme Rapide (45 min)');
const p0=s.powerW(); for(let i=0;i<20;i++) s.tick(1); ok(dw.state.remaining>=24&&dw.state.remaining<26,'reste '+dw.state.remaining.toFixed(0)+' min après 20 s (temps accéléré)');
ok(s.powerW()>p0-1,'consommation prise en compte'); for(let i=0;i<30;i++) s.tick(1); ok(dw.state.status==='done','cycle terminé automatiquement'); s.setDevice(dw.id,{command:'stop'}); ok(dw.state.status==='idle','remise à zéro');
// micro-ondes
s.setDevice(mw.id,{command:'start',duration:30,level:1000}); ok(mw.state.status==='cooking'&&mw.state.remaining===30&&s.powerW()>1400,'micro-ondes 30 s à 1000 W : '+Math.round(s.powerW())+' W');
for(let i=0;i<31;i++) s.tick(1); ok(mw.state.status==='idle','micro-ondes s’arrête seul');
// robot
s.setDevice(va.id,{command:'start'}); ok(va.state.status==='cleaning','robot : démarrage');
for(let i=0;i<20;i++) s.tick(1); ok(va.state.progress>0,'robot : en cours, '+va.state.progress.toFixed(1)+' %, pos '+va.state.x.toFixed(1)+','+va.state.z.toFixed(1));
const room=s.room('salon'); ok(va.state.x>=room.rect[0]&&va.state.x<=room.rect[2]&&va.state.z>=room.rect[1]&&va.state.z<=room.rect[3],'le robot reste dans la pièce');
// pause si présence
s.setDevice('mot-salon',{detected:true}); s.tick(1); ok(va.state.status==='paused'&&va.state.paused==='presence','robot : pause (présence dans le salon)');
s.setDevice('mot-salon',{detected:false}); for(let i=0;i<10;i++) s.tick(1); ok(va.state.status==='cleaning','robot : reprise automatique après le calme');
// batterie faible → retour base
s.patchLive(va.id,{battery:14.9}); s.tick(1); ok(va.state.status==='returning','batterie faible : retour à la base');
for(let i=0;i<15;i++) s.tick(1); ok(va.state.status==='charging'||va.state.status==='docked','arrivé à la base : '+va.state.status);
ok(Math.abs(va.state.x-0.4)<0.05&&Math.abs(va.state.z-5.0)<0.05,'robot posé sur sa base');
for(let i=0;i<60;i++) s.tick(1); ok(va.state.battery>70 || va.state.status==='cleaning','recharge puis reprise auto à 80 % : '+va.state.battery.toFixed(0)+' % ('+va.state.status+')');
// scènes / automatisations avec commandes
s.upsertScene({id:'t',name:'t',icon:'sun',color:'#fff',actions:[{target:{type:'vacuum'},patch:{command:'start'}},{target:{type:'dishwasher'},patch:{command:'start',program:'eco'}}]}); s.activateScene('t');
ok(va.state.status==='cleaning'&&dw.state.status==='running'&&dw.state.total===195,'scénario : robot + lave-vaisselle démarrés');
// chemin
const path=vacPath([0,4.2,6.4,9.6]); ok(path.total>50&&path.total<120,'parcours de '+path.total.toFixed(0)+' m pour le salon'); const pp=pathPoint(path,path.total/2); ok(pp.x>=0&&pp.x<=6.4,'point à mi-parcours valide');
// volets : mouvement réel progressif
s.setDevice('volet-salon',{position:0}); ok(s.device('volet-salon').state.position===0&&s.device('volet-salon').state.actual===100,'volet : commande immédiate, mouvement réel en attente');
for(let i=0;i<2;i++) s.tick(1); const a2=s.device('volet-salon').state.actual; ok(a2<100&&a2>40,'volet en mouvement ('+a2.toFixed(0)+' %)'); for(let i=0;i<6;i++) s.tick(1); ok(s.device('volet-salon').state.actual===0,'volet fermé après ~5 s');
console.log(fails?fails+' ÉCHEC(S)':'TOUT OK');
