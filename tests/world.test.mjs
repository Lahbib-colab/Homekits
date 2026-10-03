import { defaultHouse } from '../js/data.js';
import { buildHouse, computeWalls } from '../js/world.js';
const s = defaultHouse();
const w = computeWalls(s.rooms);
console.log('murs:', w.length, '(ext', w.filter(x=>x.ext).length, ', int', w.filter(x=>!x.ext).length+')');
w.forEach(x=>console.log(' ',x.orient,x.c,x.a,'→',x.b,x.ext?'EXT n='+x.n:'int'));
const t=Date.now(); const h = buildHouse(s);
console.log('sommets:', h.mb.count, 'triangles:', h.mb.i.length/3, 'dynamiques:', h.dynamics.map(d=>d.kind+':'+d.deviceId).join(', '), 'lampes:', h.lightDevs.length, '('+(Date.now()-t)+' ms)');
// vérifie l'absence de NaN
let bad=0; h.mb.v.forEach(v=>{ if(!Number.isFinite(v)) bad++; }); console.log('valeurs non finies:', bad);
// ouvertures posées ?
const ids = s.layout.openings.map(o=>o.id);
console.log('ouvertures définies:', ids.length);
