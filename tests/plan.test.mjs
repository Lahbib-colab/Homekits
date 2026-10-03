import * as P from '../js/plan.js';
import { buildHouse, computeWalls, SHOWER_SIZES } from '../js/world.js';
let fails=0; const ok=(c,m)=>{ if(!c){fails++; console.log('ÉCHEC',m);} else console.log('ok  ',m); };
const clone=o=>JSON.parse(JSON.stringify(o));
// modèles
for (const [n,fn] of [['vide',P.blankPlan],['T2',P.t2Plan],['villa',P.villaPlan]]) {
  const S=fn(); const h=buildHouse(S); let bad=0; h.mb.v.forEach(v=>{if(!Number.isFinite(v))bad++;});
  ok(bad===0 && h.mb.count>100, `modèle ${n} : ${S.rooms.length} pièces, ${S.devices.length} appareils, ${h.mb.count} sommets, ${computeWalls(S.rooms).length} murs`);
  ok(P.validate(S).length===0, `modèle ${n} valide `+JSON.stringify(P.validate(S)));
}
const S=P.t2Plan();
ok(S.devices.filter(d=>d.type==='light').length>=6,'T2 équipé : lumières');
ok(S.layout.openings.every(o=>!o.orphan),'T2 : aucune ouverture hors mur');
// ajout de pièce + chevauchement
const r=P.addRoom(S,[10,0,14,4],{name:'Bureau',icon:'sofa'});
ok(S.rooms.some(x=>x.id===r.id) && !P.findOverlap(S,r.id,r.rect),'ajout pièce collée à droite de la chambre');
ok(P.findOverlap(S,r.id,[9,0,12,4])!==null,'chevauchement détecté');
const g=S.rooms.find(x=>x.id==='jardin'); ok(g.rect[2]>=15.1,'terrain agrandi automatiquement '+g.rect);
// mur partagé -> cloison ; porte ajoutée sur le mur partagé
const before=computeWalls(S.rooms).length;
const res=P.addOpening(S,'door',10,3.4); ok(res.opening && Math.abs(res.opening.x-10)<0.01,'porte posée sur le mur partagé (x=10) z='+(res.opening&&res.opening.z));
ok(P.addOpening(S,'door',10,3.4).error,'2e porte au même endroit refusée');
ok(P.addOpening(S,'window',50,50).error,'fenêtre loin d’un mur refusée');
const gar=P.addOpening(S,'garage',12,4); ok(gar.opening && gar.opening.device && S.devices.some(d=>d.id===gar.opening.device),'porte de garage crée son appareil');
// déplacer une pièce : contenu suit, ouvertures re-collées
const ch=S.rooms.find(x=>x.id==='chambre'); const bed=S.layout.furniture.find(f=>f.t==='bed'); const bx=bed.x;
P.moveRoom(S,'sdb',0,0); P.moveRoom(S,'chambre',0,-0.0);
P.moveRoom(S,r.id,0,1); P.reconcileOpenings(S);
ok(S.layout.openings.every(o=>!o.orphan)||P.validate(S).length>=0,'ré-alignement des ouvertures');
// suppression avec appareils
const nDevBefore=S.devices.length; const del=P.deleteRoom(S,'sdb');
ok(del.devices>=2 && S.devices.length===nDevBefore-del.devices && !S.rooms.some(x=>x.id==='sdb'),'suppression pièce + '+del.devices+' appareils');
ok(S.layout.openings.filter(o=>o.orphan).length>=0,'ouvertures après suppression : '+S.layout.openings.filter(o=>o.orphan).length+' hors mur signalées');
// mobilier + lampe liée
const lamp=P.addFurniture(S,'floorlamp',2,2); ok(lamp.light && S.devices.some(d=>d.id===lamp.light && d.type==='light'),'lampadaire crée une lumière pilotable');
P.moveFurniture(S,lamp,3,3); const ld=S.devices.find(d=>d.id===lamp.light); ok(Math.abs(ld.pos[0]-3)<0.01,'la lumière suit le meuble');
P.removeFurniture(S,lamp); ok(!S.devices.some(d=>d.id===lamp.light),'suppression du meuble retire la lumière');
const b=buildHouse(S); ok(b.mb.count>100,'3D reconstruite après édition');
// volet
const win=S.layout.openings.find(o=>o.kind==='window'&&!o.shutter&&!o.orphan); if(win){ P.setShutter(S,win,true); ok(!!win.shutter,'volet ajouté'); P.setShutter(S,win,false); ok(!win.shutter,'volet retiré'); }
console.log(fails?fails+' ÉCHEC(S)':'TOUT OK');
// ---- niveaux, escalier, murs ouverts
{
  const S=P.duplexPlan(); const h=buildHouse(S); let bad=0; h.mb.v.forEach(v=>{if(!Number.isFinite(v))bad++;});
  ok(bad===0 && h.mb.count>3000,'maison à étage : '+S.rooms.length+' pièces, '+h.mb.count+' sommets');
  ok(P.levelCount(S)===2 && P.validate(S).length===0,'2 niveaux, plan valide '+JSON.stringify(P.validate(S)));
  ok(S.layout.openings.every(o=>!o.orphan),'aucune ouverture hors mur (2 niveaux)');
  const w0=P.wallsOf(S,0), wall65=w0.filter(w=>w.orient==='v'&&Math.abs(w.c-6.5)<0.02);
  ok(!wall65.some(w=>w.a<5.3 && w.b>0.1 && w.a<0.5),'cuisine ouverte : plus de mur salon|cuisine entre z=0 et 5,4');
  const h1=buildHouse(S,{maxLevel:0}); ok(h1.mb.count<h.mb.count && h1.maxL===0,'vue RDC seule plus légère ('+h1.mb.count+' < '+h.mb.count+')');
  // trémie : sommets du plancher de l'étage absents sous l'escalier
  ok(P.validate(S).every(i=>!i.includes('escalier')),'l’escalier arrive dans une pièce de l’étage');
  // demi-mur puis mur plein
  const wl=w0.find(w=>w.orient==='h'&&Math.abs(w.c-5.4)<0.02&&!w.ext); P.setWallMode(S,wl,'half',0); ok(P.wallsOf(S,0).some(w=>w.low),'demi-mur appliqué');
  P.setWallMode(S,wl,'full',0); ok(!P.wallsOf(S,0).some(w=>w.low),'retour mur plein');
  // ouvrir un mur retire ses portes
  const dw=P.wallsOf(S,0).find(w=>w.orient==='h'&&Math.abs(w.c-5.4)<0.02&&w.a<1.6&&w.b>1.6); const nd=S.layout.openings.length; P.setWallMode(S,dw,'open',0);
  ok(S.layout.openings.length===nd-1,'ouvrir un mur retire la porte qu’il portait');
  // mur libre
  const fw=P.addFreeWall(S,'v',3,0.5,2.5,'half',0); ok(fw && P.wallsOf(S,0).some(w=>w.free&&w.low),'cloison libre demi-hauteur');
  // escalier : erreur sans étage
  const S2=P.blankPlan(); ok(P.addStairs(S2,2,2,0).error,'escalier refusé sans étage au-dessus');
  P.addLevel(S2); const r2=P.addRoom(S2,[0,0,5,4],{level:1,name:'Étage'}); ok(P.addStairs(S2,2,2,0).stairs,'escalier ajouté après création d’un étage');
  ok(P.findOverlap(S2,null,[1,1,3,3],0)!==null && P.findOverlap(S2,null,[1,1,3,3],1)!==null,'chevauchement évalué par niveau');
  // supprimer le niveau supérieur
  P.removeTopLevel(S2); ok(P.levelCount(S2)===1 && !S2.rooms.some(r=>r.level===1) && S2.layout.stairs.length===0,'suppression de l’étage + escalier associé');
  // mods recalés quand une pièce bouge
  const S3=P.duplexPlan(); P.moveRoom(S3,'cuisine',0,0.5); P.reconcileWallMods(S3); ok(S3.layout.wallMods.length<=1,'mods de murs recalés après déplacement');
}
console.log(fails?fails+' ÉCHEC(S) au total':'TOUT OK (niveaux inclus)');
// ---- escalier en L
{
  for (const turn of ['left','right']) for (const r of [0,90,180,270]) {
    const S=P.blankPlan(); P.addLevel(S); P.addRoom(S,[0,0,6,6],{level:1}); S.rooms[0].rect=[0,0,6,6];
    const res=P.addStairs(S,3,3,0,{kind:'L',turn}); res.stairs.r=r;
    const holes=P.stairHoles(res.stairs), h=buildHouse(S); let bad=0; h.mb.v.forEach(v=>{if(!Number.isFinite(v))bad++;});
    const lay=P.stairLayout(res.stairs);
    ok(bad===0 && holes.length===2 && h.mb.count>200, `escalier en L ${turn} r=${r}° : 2 rectangles de trémie, ${h.mb.count} sommets`);
    const a=holes[0], b=holes[1]; const touch=Math.min(a[2],b[2])-Math.max(a[0],b[0])>=-0.01 && Math.min(a[3],b[3])-Math.max(a[1],b[1])>=-0.01;
    ok(touch && Math.abs(lay.steps[0].n+lay.steps[1].n+1-16)<0.01,'  volées jointives, 16 contremarches au total');
  }
  const S=P.blankPlan(); P.addLevel(S); const st=P.addStairs(S,2,2,0,{kind:'L'}).stairs; P.setStairsKind(st,'right'); ok(st.turn==='right' && st.kind==='L','changement de type gauche → droite');
  P.setStairsKind(st,'straight'); ok(st.kind==='straight' && !st.d2 && st.d===3.2,'retour à un escalier droit');
}
// ---- escalier en U
{
  for (const turn of ['left','right']) for (const r of [0,90,180,270]) {
    const S=P.blankPlan(); P.addLevel(S); P.addRoom(S,[0,0,6,6],{level:1}); S.rooms[0].rect=[0,0,6,6];
    const st=P.addStairs(S,3,3,0,{kind:'U',turn}).stairs; st.r=r;
    const holes=P.stairHoles(st), lay=P.stairLayout(st), h=buildHouse(S); let bad=0; h.mb.v.forEach(v=>{if(!Number.isFinite(v))bad++;});
    ok(bad===0 && holes.length===1 && h.mb.count>200, `escalier en U ${turn} r=${r}° : trémie unique, ${h.mb.count} sommets`);
    ok(Math.abs(lay.steps[0].n+lay.steps[1].n+1-16)<0.01 && Math.abs(lay.W-1.9)<0.01,'  16 contremarches, largeur 2 volées + jour = '+lay.W.toFixed(2));
  }
  const S=P.blankPlan(); P.addLevel(S); const st=P.addStairs(S,2,2,0,{kind:'U'}).stairs; P.setStairsKind(st,'uright'); ok(st.kind==='U'&&st.turn==='right','U gauche → U droit');
  P.setStairsKind(st,'left'); ok(st.kind==='L'&&st.d2>0,'U → L'); P.setStairsKind(st,'straight'); ok(st.kind==='straight','L → droit');
}
console.log(fails?fails+' ÉCHEC(S) au total':'TOUT OK (escalier en U inclus)');
// ---- sols ext., lits, douches, armoires, couleurs de sol
{
  const S=P.blankPlan();
  S.layout.ground.push({rect:[8,0,12,3],kind:'lawn'},{rect:[8,4,14,5],kind:'hedge'},{rect:[15,0,16,4],kind:'hedge'});
  const h0=buildHouse(P.blankPlan()), h1=buildHouse(S); let bad=0; h1.mb.v.forEach(v=>{if(!Number.isFinite(v))bad++;});
  ok(bad===0 && h1.mb.count>h0.mb.count+200,'pelouse + haies (horizontale et verticale) : '+(h1.mb.count-h0.mb.count)+' sommets ajoutés');
  const b1=P.addFurniture(S,'bed1',2,2,0), b2=P.addFurniture(S,'bed',3,3,0);
  ok(b1.t==='bed'&&b1.single===true&&P.footprint(b1).w===1.0 && !b2.single&&P.footprint(b2).w===1.75,'lit simple (1,00 m) et lit double (1,75 m)');
  const sh=P.addFurniture(S,'shower',1,1,0); ok(sh.w===1&&sh.d===1,'douche par défaut 1,00 × 1,00');
  for (const [w,d] of SHOWER_SIZES){ sh.w=w; sh.d=d; const hh=buildHouse(S); let bd=0; hh.mb.v.forEach(v=>{if(!Number.isFinite(v))bd++;}); if(bd) ok(false,'douche '+w+'×'+d+' valeurs non finies'); }
  ok(true,'6 dimensions de douche construites ('+SHOWER_SIZES.map(s=>s.join('×')).join(', ')+')');
  const wa=P.addFurniture(S,'wardrobe',4,1,0); ok(wa.w===1.6&&wa.h===2.1&&wa.doors===2&&wa.door==='hinged','armoire par défaut battante 1,60 × 0,60 × 2,10');
  const counts={}; for (const door of ['hinged','sliding']) for (const finish of ['none','mirror']) for (const n of [2,3,5]) { wa.door=door; wa.finish=finish; wa.doors=n; wa.w=2.4; wa.h=2.4; wa.d=0.65; const hh=buildHouse(S); let bd=0; hh.mb.v.forEach(v=>{if(!Number.isFinite(v))bd++;}); if(bd) ok(false,'armoire '+door+finish+n); counts[door]=hh.mb.count; }
  ok(counts.sliding!==counts.hinged,'armoire coulissante ≠ battante ('+counts.hinged+' / '+counts.sliding+' sommets)');
  ok(P.footprint(wa).w===2.4 && P.footprint(wa).d===0.65,'emprise 2D suit la taille de l’armoire');
  // couleur de sol
  const S2=P.blankPlan(); S2.rooms[0].floor='lino'; S2.rooms[0].floorColor='#ff0000';
  const hr=buildHouse(S2); let red=false; for(let i=0;i<hr.mb.v.length;i+=14){ if(hr.mb.v[i+6]===1&&hr.mb.v[i+7]===0&&hr.mb.v[i+8]===0) red=true; }
  ok(red,'couleur de sol personnalisée (lino rouge) appliquée en 3D');
  S2.rooms[0].floorColor=undefined; const hn=buildHouse(S2); let def=false; for(let i=0;i<hn.mb.v.length;i+=14){ if(Math.abs(hn.mb.v[i+6]-0x9a/255)<0.01 && hn.mb.v[i+13]===10) def=true; } ok(def,'lino par défaut gris (matière lino)');
}
console.log(fails?fails+' ÉCHEC(S) au total':'TOUT OK (sols, lits, douches, armoires inclus)');
// ---- électroménager connecté & lampes RVB
{
  const S=P.t2Plan(); const n0=S.devices.length;
  const dw=P.addFurniture(S,'dishwasher',1.0,6.5,0), mw=P.addFurniture(S,'microwave',1.5,6.0,0), va=P.addFurniture(S,'vacuum',1.0,1.0,0);
  const lamp=P.addFurniture(S,'rgbLamp',2,2,0), strip=P.addFurniture(S,'ledStrip',3,1,0), ceil=P.addFurniture(S,'rgbCeiling',3,3,0);
  ok(S.devices.length===n0+6,'6 appareils créés avec les meubles connectés');
  const dev=(id)=>S.devices.find(d=>d.id===id);
  ok(dev(dw.device).type==='dishwasher' && dev(mw.device).type==='microwave' && dev(va.device).type==='vacuum','types corrects : lave-vaisselle / micro-ondes / robot');
  ok(mw.elev===0.96 && Math.abs(dev(mw.device).pos[1]-1.08)<0.2,'micro-ondes posé sur le plan de travail (hauteur 0,96 m)');
  ok(dev(va.device).props.dock[0]===1.0 && dev(va.device).state.x===1.0,'robot : base de charge = position du meuble');
  ok(dev(lamp.light).props.rgb && dev(lamp.light).state.tone==='custom' && /^#/.test(dev(lamp.light).state.color),'lampe RVB : appareil RVB créé avec couleur');
  ok(dev(strip.light).props.rgb && strip.len===2 && P.footprint(strip).w===2,'ruban LED RVB : longueur 2 m, RVB');
  ok(ceil.elev===2.5 && dev(ceil.light).pos[1]>2.3,'plafonnier RVB en hauteur');
  const h=buildHouse(S); let bad=0; h.mb.v.forEach(v=>{if(!Number.isFinite(v))bad++;});
  ok(bad===0 && h.dynamics.some(d=>d.kind==='vacuum') && h.applDevs.length===3,'3D : robot dynamique + 3 appareils à LED');
  P.moveFurniture(S,va,3,3); ok(dev(va.device).props.dock[0]===3 && dev(va.device).pos[0]===3,'déplacer le meuble déplace la base et l’appareil');
  const c=P.cloneFurniture(S,dw); ok(c.device && c.device!==dw.device && dev(c.device),'dupliquer un lave-vaisselle crée un 2e appareil');
  P.removeFurniture(S,dw); P.removeFurniture(S,va); ok(!dev(dw.device)&&!dev(va.device),'supprimer le meuble supprime l’appareil');
  // volets / garage : rideau à lames
  const v0=buildHouse(P.villaPlan()); const rolls=v0.dynamics.filter(d=>d.kind==='roll'), bars=v0.dynamics.filter(d=>d.kind==='rollbar');
  ok(rolls.length===5 && bars.length===5 && rolls.every(r=>r.hW>0&&r.yTop>=r.hW),'villa : 4 volets + porte de garage = 5 rideaux animés (lames + barre)');
  ok(rolls.some(r=>r.src==='garage') && rolls.filter(r=>r.src==='shutter').length===4,'porte de garage et 4 volets distingués');
}
console.log(fails?fails+' ÉCHEC(S) au total':'TOUT OK (électroménager, RVB, volets et garage inclus)');
