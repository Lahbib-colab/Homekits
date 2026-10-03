// ---------------------------------------------------------------------------
// Mini moteur WebGL2 dédié à la maison (aucune dépendance, 100 % hors ligne).
//  - MeshBuilder : boîtes, prismes, sphères, transformations de groupe
//  - GLView      : un seul VBO statique + quelques maillages dynamiques,
//                  éclairage nocturne (16 lampes ponctuelles), halos additifs,
//                  "dollhouse" : les murs tournés vers la caméra s'abaissent.
//  - OrbitCam    : rotation / zoom / déplacement, avec inertie
// Format de sommet (14 floats) :
//   pos(3) normale(3) couleur(3) pièce(1) émissif(1) coupeX(1) coupeZ(1) matière(1)
// ---------------------------------------------------------------------------

// ------------------------------------------------------------------ maths
export const mat4 = {
  create() { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; },
  perspective(o, fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    o.fill(0); o[0] = f / aspect; o[5] = f; o[10] = (far + near) * nf; o[11] = -1; o[14] = 2 * far * near * nf; return o;
  },
  lookAt(o, eye, c, up) {
    let zx = eye[0] - c[0], zy = eye[1] - c[1], zz = eye[2] - c[2];
    let l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
    let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
    l = Math.hypot(xx, xy, xz); xx /= l; xy /= l; xz /= l;
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    o[0] = xx; o[1] = yx; o[2] = zx; o[3] = 0; o[4] = xy; o[5] = yy; o[6] = zy; o[7] = 0;
    o[8] = xz; o[9] = yz; o[10] = zz; o[11] = 0;
    o[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
    o[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
    o[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]); o[15] = 1; return o;
  },
  multiply(o, a, b) {
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      o[j * 4 + i] = a[i] * b[j * 4] + a[4 + i] * b[j * 4 + 1] + a[8 + i] * b[j * 4 + 2] + a[12 + i] * b[j * 4 + 3];
    }
    return o;
  },
  invert(o, a) {
    const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = a;
    const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11,
      b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12, b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30,
      b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
    let d = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (!d) return null; d = 1 / d;
    o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * d; o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * d;
    o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * d; o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * d;
    o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * d; o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * d;
    o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * d; o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * d;
    o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * d; o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * d;
    o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * d; o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * d;
    o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * d; o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * d;
    o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * d; o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * d;
    return o;
  },
};

export function hex(c) {
  if (Array.isArray(c)) return c;
  const n = parseInt(c.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export const MAT = { PLAIN: 0, WOOD: 1, TILE: 2, CONCRETE: 3, GRASS: 4, WATER: 5, GLASS: 6, DECK: 7, METAL: 8, RING: 9, LINO: 10 };

// -------------------------------------------------------------- MeshBuilder
export class MeshBuilder {
  constructor() {
    this.v = []; this.i = []; this.count = 0;
    this.cur = { room: -1, emis: 0, cx: 0, cz: 0, mat: 0, level: 0 };
    this.T = { x: 0, z: 0, c: 1, s: 0, y: 0 };
  }
  attr(o) { Object.assign(this.cur, o); return this; }
  group(x, z, rotDeg = 0, y = 0) { const r = (rotDeg * Math.PI) / 180; this.T = { x, z, c: Math.cos(r), s: Math.sin(r), y }; return this; }
  ungroup() { this.T = { x: 0, z: 0, c: 1, s: 0, y: 0 }; return this; }

  vert(x, y, z, nx, ny, nz, col, mul = 1) {
    const T = this.T, cu = this.cur;
    const px = T.x + x * T.c + z * T.s, pz = T.z - x * T.s + z * T.c;
    const qx = nx * T.c + nz * T.s, qz = -nx * T.s + nz * T.c;
    this.v.push(px, y + T.y, pz, qx, ny, qz, col[0] * mul, col[1] * mul, col[2] * mul, cu.room, cu.emis, cu.cx, cu.cz, cu.mat + 16 * cu.level);
    return this.count++;
  }
  tri(a, b, c) { this.i.push(a, b, c); }
  quad(a, b, c, d) { this.i.push(a, b, c, a, c, d); }

  // Boîte centrée en (cx, cz), posée sur by. opts : ry, faces{top,bottom,px,nx,pz,nz}, ao
  box(cx, by, cz, sx, sy, sz, color, opts = {}) {
    const col = hex(color), F = opts.faces || {};
    const ao = opts.ao === undefined ? 0.8 : opts.ao;
    const ry = ((opts.ry || 0) * Math.PI) / 180, co = Math.cos(ry), si = Math.sin(ry);
    const hx = sx / 2, hz = sz / 2, y0 = by, y1 = by + sy;
    const P = (lx, y, lz) => [cx + lx * co + lz * si, y, cz - lx * si + lz * co];
    const N = (nx, nz) => [nx * co + nz * si, -nx * si + nz * co];
    const face = (pts, n, c, muls) => {
      const cc = hex(c || col);
      const idx = pts.map((p, k) => this.vert(p[0], p[1], p[2], n[0], n[1], n[2], cc, muls[k]));
      this.quad(idx[0], idx[1], idx[2], idx[3]);
    };
    let n = N(1, 0); face([P(hx, y0, hz), P(hx, y0, -hz), P(hx, y1, -hz), P(hx, y1, hz)], [n[0], 0, n[1]], F.px, [ao, ao, 1, 1]);
    n = N(-1, 0); face([P(-hx, y0, -hz), P(-hx, y0, hz), P(-hx, y1, hz), P(-hx, y1, -hz)], [n[0], 0, n[1]], F.nx, [ao, ao, 1, 1]);
    n = N(0, 1); face([P(-hx, y0, hz), P(hx, y0, hz), P(hx, y1, hz), P(-hx, y1, hz)], [n[0], 0, n[1]], F.pz, [ao, ao, 1, 1]);
    n = N(0, -1); face([P(hx, y0, -hz), P(-hx, y0, -hz), P(-hx, y1, -hz), P(hx, y1, -hz)], [n[0], 0, n[1]], F.nz, [ao, ao, 1, 1]);
    face([P(-hx, y1, hz), P(hx, y1, hz), P(hx, y1, -hz), P(-hx, y1, -hz)], [0, 1, 0], F.top, [1, 1, 1, 1]);
    if (!opts.noBottom) face([P(-hx, y0, -hz), P(hx, y0, -hz), P(hx, y0, hz), P(-hx, y0, hz)], [0, -1, 0], F.bottom, [0.5, 0.5, 0.5, 0.5]);
    return this;
  }

  // Prisme / cône tronqué (axe vertical) : r0 en bas, r1 en haut
  prism(cx, by, cz, r0, r1, h, seg, color, opts = {}) {
    const col = hex(color), sx = opts.sx || 1, sz = opts.sz || 1, ao = opts.ao === undefined ? 0.8 : opts.ao;
    const slope = (r0 - r1) / h;
    const ring = [];
    for (let k = 0; k <= seg; k++) {
      const a = (k / seg) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      const nl = Math.hypot(1, slope), n = [c / nl, slope / nl, s / nl];
      ring.push([
        this.vert(cx + c * r0 * sx, by, cz + s * r0 * sz, n[0], n[1], n[2], col, ao),
        this.vert(cx + c * r1 * sx, by + h, cz + s * r1 * sz, n[0], n[1], n[2], col, 1),
      ]);
    }
    for (let k = 0; k < seg; k++) this.quad(ring[k][0], ring[k + 1][0], ring[k + 1][1], ring[k][1]);
    if (r1 > 0.001 && !opts.noTop) {
      const c0 = this.vert(cx, by + h, cz, 0, 1, 0, hex(opts.top || color), 1);
      const tv = [];
      for (let k = 0; k <= seg; k++) { const a = (k / seg) * Math.PI * 2; tv.push(this.vert(cx + Math.cos(a) * r1 * sx, by + h, cz + Math.sin(a) * r1 * sz, 0, 1, 0, hex(opts.top || color), 1)); }
      for (let k = 0; k < seg; k++) this.tri(c0, tv[k + 1], tv[k]);
    }
    return this;
  }

  // Ellipsoïde lissée (feuillages, coussins arrondis…)
  sphere(cx, cy, cz, rx, ry, rz, color, seg = 8, rings = 5) {
    const col = hex(color), idx = [];
    for (let j = 0; j <= rings; j++) {
      const p = (j / rings) * Math.PI, sp = Math.sin(p), cp = Math.cos(p);
      const row = [];
      for (let k = 0; k <= seg; k++) {
        const a = (k / seg) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
        row.push(this.vert(cx + ca * sp * rx, cy + cp * ry, cz + sa * sp * rz, ca * sp, cp, sa * sp, col, 0.72 + 0.28 * (0.5 + 0.5 * cp)));
      }
      idx.push(row);
    }
    for (let j = 0; j < rings; j++) for (let k = 0; k < seg; k++) this.quad(idx[j][k], idx[j][k + 1], idx[j + 1][k + 1], idx[j + 1][k]);
    return this;
  }

  toBuffers() { return { v: new Float32Array(this.v), i: new Uint32Array(this.i) }; }
}

// ------------------------------------------------------------------- shaders
const VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNrm; layout(location=2) in vec3 aCol;
layout(location=3) in vec4 aInfo; layout(location=4) in float aMat;
uniform mat4 uVP; uniform vec2 uCamDir; uniform vec3 uDyn; uniform vec3 uMove;
const float LH = 2.9;
out vec3 vPos; out vec3 vNrm; out vec3 vCol; out vec4 vInfo; out float vMat;
void main(){
  vec3 p = aPos; vec3 nn = aNrm;
  if (uMove.x != 0.0 || uMove.y != 0.0 || uMove.z != 0.0) {
    float mc = cos(uMove.z), ms = sin(uMove.z);
    p.xz = vec2(p.x * mc + p.z * ms, -p.x * ms + p.z * mc) + uMove.xy;
    nn.xz = vec2(nn.x * mc + nn.z * ms, -nn.x * ms + nn.z * mc);
  }
  p.y = uDyn.x + (p.y - uDyn.x) * uDyn.y + uDyn.z;
  vec2 cd = aInfo.zw;
  if (dot(cd, cd) > 0.01) {
    float f = smoothstep(0.12, 0.5, dot(cd, uCamDir));
    float base = floor(aMat / 16.0 + 0.01) * LH;
    p.y = mix(p.y, min(p.y, base + 0.55), f);
  }
  vPos = p; vNrm = nn; vCol = aCol; vInfo = aInfo; vMat = aMat;
  gl_Position = uVP * vec4(p, 1.0);
}`;

const FS = `#version 300 es
precision highp float;
in vec3 vPos; in vec3 vNrm; in vec3 vCol; in vec4 vInfo; in float vMat;
uniform float uTime; uniform float uSel; uniform int uNL; uniform float uLow; uniform float uClip; uniform float uAI[16];
uniform vec4 uL[24]; uniform vec4 uLC[24]; uniform float uLI[24]; uniform float uRG[24];
uniform vec3 uCam;
out vec4 o;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
void main(){
  if (vPos.y < uClip) discard;
  vec3 n = normalize(vNrm);
  vec3 alb = vCol;
  float lvl = floor(vMat / 16.0 + 0.01);
  int m = int(vMat - 16.0 * lvl + 0.5);
  float room = vInfo.x, emis = vInfo.y;
  vec2 xz = vPos.xz;
  vec3 view = normalize(uCam - vPos);

  if (m == 1) {
    float row = floor(xz.y * 6.5);
    float seam = floor((xz.x + hash(vec2(row, 3.1)) * 3.0) * 0.9);
    float g = abs(fract(xz.y * 6.5) - 0.5);
    alb *= (0.84 + 0.3 * hash(vec2(row, seam))) * (1.0 - 0.38 * smoothstep(0.455, 0.5, g));
    alb *= 0.95 + 0.1 * noise(xz * vec2(2.0, 34.0));
  } else if (m == 2) {
    vec2 g = fract(xz * 1.7);
    float line = clamp(step(g.x, 0.035) + step(g.y, 0.035), 0.0, 1.0);
    alb = mix(alb * (0.94 + 0.06 * hash(floor(xz * 1.7))), alb * 0.5, line);
  } else if (m == 3) {
    alb *= 0.9 + 0.2 * noise(xz * 2.6);
  } else if (m == 4) {
    alb *= 0.82 + 0.3 * noise(xz * 1.6) + 0.12 * noise(xz * 0.5 + 4.0);
  } else if (m == 10) {
    alb *= 0.955 + 0.09 * noise(xz * 7.0) + 0.03 * noise(xz * 40.0);
  } else if (m == 7) {
    float b = floor(xz.x * 6.0);
    alb *= (0.84 + 0.26 * hash(vec2(b, 1.0))) * (1.0 - 0.4 * smoothstep(0.44, 0.5, abs(fract(xz.x * 6.0) - 0.5)));
  }

  vec3 L = normalize(vec3(-0.45, 0.85, 0.35));
  float ndl = max(dot(n, L), 0.0);
  vec3 light = vec3(0.30, 0.35, 0.50) + vec3(0.17, 0.23, 0.38) * ndl;
  for (int i = 0; i < 24; i++) {
    if (i >= uNL) break;
    float I = uLI[i];
    if (I < 0.01) continue;
    vec3 d = uL[i].xyz - vPos; float dist = length(d);
    float att = clamp(1.0 - dist / uL[i].w, 0.0, 1.0); att *= att;
    float rid = uLC[i].w;
    float same = (rid < 0.0 || room < 0.0 || abs(rid - room) < 0.5) ? 1.0 : 0.0;
    float nd = max(dot(n, d / max(dist, 0.001)), 0.0) * 0.8 + 0.2;
    light += uLC[i].rgb * att * nd * same * 1.6;
  }
  vec3 col = alb * light;

  if (emis >= 40.0) { int k = int(emis - 40.0 + 0.5); col += vCol * uAI[k] * 1.7 + vCol * 0.04; }
  else if (emis >= 10.0) { int k = int(emis - 10.0 + 0.5); vec3 lc = uLC[k].rgb / max(uLI[k], 0.001); col += mix(vCol, lc, 0.9) * uLI[k] * 1.5 + vec3(0.02); }
  else if (emis > 0.0) col += vCol * emis;

  if (m == 5) {
    float glow = emis >= 10.0 ? uLI[int(emis - 10.0 + 0.5)] : 0.0;
    float w = sin(xz.x * 2.3 + uTime * 1.2) + sin(xz.y * 2.7 - uTime * 1.0) + sin((xz.x + xz.y) * 1.7 + uTime * 0.7);
    vec3 base = mix(vec3(0.03, 0.22, 0.38), vec3(0.10, 0.72, 0.95), 0.25 + 0.75 * glow);
    col = base * (0.85 + 0.1 * w) + vec3(0.05, 0.16, 0.22) * pow(1.0 - abs(view.y), 2.0);
  } else if (m == 6) {
    float rg = room >= 0.0 ? uRG[int(room + 0.5)] : 0.0;
    vec3 warm = vec3(1.0, 0.76, 0.45) * (0.5 + 0.7 * rg);
    col = mix(vec3(0.05, 0.10, 0.19), warm, clamp(rg * 1.1, 0.0, 0.92));
    col += vec3(0.10, 0.16, 0.26) * pow(1.0 - abs(dot(n, view)), 2.5);
  } else if (m == 9) {
    col = vCol * (0.75 + 0.25 * sin(uTime * 3.2));
  }

  if (uSel > -0.5 && m != 9) {
    float isSel = (room >= 0.0 && abs(room - uSel) < 0.5) ? 1.0 : 0.0;
    float dim = room < 0.0 ? 0.8 : 0.55;
    col *= mix(dim, 1.12, isSel);
    col += isSel * vec3(0.02, 0.07, 0.16) * (0.7 + 0.3 * sin(uTime * 3.2));
  }
  col = pow(max(col, 0.0), vec3(0.92));
  o = vec4(col, 1.0);
}`;

const GVS = `#version 300 es
layout(location=0) in vec3 aG;
uniform mat4 uVP; uniform vec3 uRight; uniform vec3 uUp;
uniform vec4 uL[24]; uniform vec4 uLC[24]; uniform float uLI[24]; uniform float uSize;
out vec2 vUV; out vec3 vC;
void main(){
  int i = int(aG.x + 0.5);
  float I = uLI[i];
  vec3 c = uL[i].xyz;
  float s = uSize * (0.35 + 0.65 * I) * (I > 0.01 ? 1.0 : 0.0);
  vec3 p = c + (uRight * aG.y + uUp * aG.z) * s;
  vUV = aG.yz; vC = uLC[i].rgb * (0.55 + 0.45 * I);
  gl_Position = uVP * vec4(p, 1.0);
}`;
const GFS = `#version 300 es
precision mediump float;
in vec2 vUV; in vec3 vC; out vec4 o;
void main(){
  float d = length(vUV);
  float a = pow(clamp(1.0 - d, 0.0, 1.0), 2.2);
  o = vec4(vC * a * 0.9, a * 0.5);
}`;

function compile(gl, vsSrc, fsSrc) {
  const mk = (type, src) => {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('Shader : ' + gl.getShaderInfoLog(s));
    return s;
  };
  const p = gl.createProgram();
  gl.attachShader(p, mk(gl.VERTEX_SHADER, vsSrc)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fsSrc));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Link : ' + gl.getProgramInfoLog(p));
  return p;
}

// ------------------------------------------------------------------- GLView
export class GLView {
  constructor(canvas) {
    const gl = canvas.getContext('webgl2', { alpha: true, antialias: true, premultipliedAlpha: true, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 indisponible');
    this.gl = gl; this.canvas = canvas;
    this.prog = compile(gl, VS, FS);
    this.gprog = compile(gl, GVS, GFS);
    this.U = {}; this.GU = {};
    ['uVP', 'uCamDir', 'uDyn', 'uMove', 'uClip', 'uAI', 'uTime', 'uSel', 'uNL', 'uLow', 'uL', 'uLC', 'uLI', 'uRG', 'uCam'].forEach((n) => { this.U[n] = gl.getUniformLocation(this.prog, n); });
    ['uVP', 'uRight', 'uUp', 'uL', 'uLC', 'uLI', 'uSize'].forEach((n) => { this.GU[n] = gl.getUniformLocation(this.gprog, n); });
    this.statics = []; this.dynamics = []; this.stats = { tris: 0, draws: 0 };
    this.glowVAO = null; this.glowCount = 0;
    this.arrays = { L: new Float32Array(96), LC: new Float32Array(96), LI: new Float32Array(24), RG: new Float32Array(24), AI: new Float32Array(16) };
    this.nLights = 0;
  }

  _upload(builder) {
    const gl = this.gl, { v, i } = builder.toBuffers();
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, v, gl.STATIC_DRAW);
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, i, gl.STATIC_DRAW);
    const S = 14 * 4;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, S, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, S, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, S, 24);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.FLOAT, false, S, 36);
    gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 1, gl.FLOAT, false, S, 52);
    gl.bindVertexArray(null);
    return { vao, vb, ib, count: i.length };
  }
  setStatic(builder) {
    const gl = this.gl;
    this.statics.forEach((m) => { gl.deleteVertexArray(m.vao); gl.deleteBuffer(m.vb); gl.deleteBuffer(m.ib); });
    this.statics = [this._upload(builder)];
    this.stats.tris = this.statics[0].count / 3;
  }
  // Maillage dynamique : dyn = [pivotY, scaleY, offsetY] modifiable à chaque image
  addDynamic(builder, dyn = [0, 1, 0]) {
    const m = this._upload(builder); m.dyn = dyn; this.dynamics.push(m); return m;
  }
  replaceDynamic(m, builder) {
    const gl = this.gl; gl.deleteVertexArray(m.vao); gl.deleteBuffer(m.vb); gl.deleteBuffer(m.ib);
    const dyn = m.dyn; Object.assign(m, this._upload(builder)); m.dyn = dyn;
  }
  clearDynamics() {
    const gl = this.gl;
    this.dynamics.forEach((m) => { gl.deleteVertexArray(m.vao); gl.deleteBuffer(m.vb); gl.deleteBuffer(m.ib); });
    this.dynamics = [];
  }
  setGlowCount(n) {
    const gl = this.gl;
    if (this.glowVAO) gl.deleteVertexArray(this.glowVAO);
    const data = []; const corners = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];
    for (let i = 0; i < n; i++) corners.forEach(([x, y]) => data.push(i, x, y));
    this.glowVAO = gl.createVertexArray(); gl.bindVertexArray(this.glowVAO);
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);
    gl.bindVertexArray(null);
    this.glowCount = n * 6; this.nLights = n;
  }
  // i : index de lampe ; pos [x,y,z] ; rgb ; rayon ; pièce ; intensité 0..1
  setLight(i, pos, rgb, radius, roomIdx, intensity) {
    const { L, LC, LI } = this.arrays;
    L.set([pos[0], pos[1], pos[2], radius], i * 4);
    LC.set([rgb[0] * intensity, rgb[1] * intensity, rgb[2] * intensity, roomIdx], i * 4);
    LI[i] = intensity;
  }
  setRoomGlow(i, v) { this.arrays.RG[i] = v; }
  setAppliance(i, v) { this.arrays.AI[i] = v; }

  resize(w, h, dpr) {
    const c = this.canvas;
    c.width = Math.max(2, Math.round(w * dpr)); c.height = Math.max(2, Math.round(h * dpr));
    this.gl.viewport(0, 0, c.width, c.height);
  }

  render(f) {
    const gl = this.gl, U = this.U, A = this.arrays;
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND);
    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(U.uVP, false, f.vp);
    gl.uniform2f(U.uCamDir, f.camDir[0], f.camDir[1]);
    gl.uniform3f(U.uCam, f.eye[0], f.eye[1], f.eye[2]);
    gl.uniform1f(U.uTime, f.time); gl.uniform1f(U.uSel, f.sel); gl.uniform1i(U.uNL, this.nLights); gl.uniform1f(U.uLow, f.low ? 1 : 0);
    gl.uniform4fv(U.uL, A.L); gl.uniform4fv(U.uLC, A.LC); gl.uniform1fv(U.uLI, A.LI); gl.uniform1fv(U.uRG, A.RG); gl.uniform1fv(U.uAI, A.AI);
    let draws = 0;
    gl.uniform3f(U.uDyn, 0, 1, 0); gl.uniform3f(U.uMove, 0, 0, 0); gl.uniform1f(U.uClip, -1e4);
    this.statics.forEach((m) => { gl.bindVertexArray(m.vao); gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_INT, 0); draws++; });
    this.dynamics.forEach((m) => {
      if (m.hidden) return;
      gl.uniform3f(U.uDyn, m.dyn[0], m.dyn[1], m.dyn[2]);
      const mv = m.move || [0, 0, 0]; gl.uniform3f(U.uMove, mv[0], mv[1], mv[2]); gl.uniform1f(U.uClip, m.clip === undefined ? -1e4 : m.clip);
      gl.bindVertexArray(m.vao); gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_INT, 0); draws++;
    });
    // Halos additifs des lampes allumées
    if (this.glowCount && !f.low) {
      gl.useProgram(this.gprog);
      gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ONE, gl.ONE); gl.depthMask(false);
      const GU = this.GU;
      gl.uniformMatrix4fv(GU.uVP, false, f.vp); gl.uniform3fv(GU.uRight, f.right); gl.uniform3fv(GU.uUp, f.up);
      gl.uniform4fv(GU.uL, A.L); gl.uniform4fv(GU.uLC, A.LC); gl.uniform1fv(GU.uLI, A.LI); gl.uniform1f(GU.uSize, 1.5);
      gl.bindVertexArray(this.glowVAO); gl.drawArrays(gl.TRIANGLES, 0, this.glowCount); draws++;
      gl.depthMask(true); gl.disable(gl.BLEND);
    }
    gl.bindVertexArray(null);
    this.stats.draws = draws;
  }
}

// ------------------------------------------------------------------ caméra
export class OrbitCam {
  constructor() {
    this.home = { az: 0.5, el: 0.86, dist: 30, target: [8.2, 0, 7.6], shiftY: 0 };
    this.reset(false);
    this.tw = null; this.vel = { az: 0, el: 0 };
    this.vp = mat4.create(); this.proj = mat4.create(); this.view = mat4.create(); this.inv = mat4.create();
    this.fov = (30 * Math.PI) / 180; this.eye = [0, 0, 0];
  }
  reset(animate = true) {
    const h = this.home;
    if (animate) this.flyTo({ az: h.az, el: h.el, dist: h.dist, target: h.target.slice(), shiftY: h.shiftY });
    else { this.az = h.az; this.el = h.el; this.dist = h.dist; this.target = h.target.slice(); this.shiftY = h.shiftY; }
  }
  flyTo(to, ms = 650) {
    this.tw = { from: { az: this.az, el: this.el, dist: this.dist, target: this.target.slice(), shiftY: this.shiftY }, to, t: 0, ms };
  }
  // Retourne true si la caméra a bougé
  update(dt) {
    let moved = false;
    if (this.tw) {
      const w = this.tw; w.t = Math.min(1, w.t + (dt * 1000) / w.ms);
      const e = 1 - Math.pow(1 - w.t, 3);
      const L = (a, b) => a + (b - a) * e;
      this.az = L(w.from.az, w.to.az); this.el = L(w.from.el, w.to.el); this.dist = L(w.from.dist, w.to.dist);
      this.shiftY = L(w.from.shiftY, w.to.shiftY);
      this.target = [L(w.from.target[0], w.to.target[0]), L(w.from.target[1], w.to.target[1]), L(w.from.target[2], w.to.target[2])];
      if (w.t >= 1) this.tw = null;
      moved = true;
    } else if (Math.abs(this.vel.az) > 0.0004 || Math.abs(this.vel.el) > 0.0004) {
      this.az += this.vel.az; this.el = Math.min(1.38, Math.max(0.34, this.el + this.vel.el));
      const k = Math.pow(0.9, dt * 60); this.vel.az *= k; this.vel.el *= k; moved = true;
    }
    return moved;
  }
  rotate(dx, dy) {
    this.tw = null;
    const da = -dx * 0.0085, de = dy * 0.0055;
    this.az += da; this.el = Math.min(1.38, Math.max(0.34, this.el + de));
    this.vel.az = da; this.vel.el = de * 0.6;
  }
  zoom(factor) { this.tw = null; this.dist = Math.min(80, Math.max(9, this.dist * factor)); }
  pan(dx, dy, viewH) {
    this.tw = null;
    const s = (this.dist * Math.tan(this.fov / 2) * 2) / viewH;
    const rx = Math.cos(this.az), rz = -Math.sin(this.az); // droite écran sur le sol
    const fx = -Math.sin(this.az), fz = -Math.cos(this.az); // avant écran sur le sol
    this.target[0] = Math.min(20, Math.max(-4, this.target[0] - (dx * rx + -dy * fx * 0.9) * s));
    this.target[2] = Math.min(20, Math.max(-4, this.target[2] - (dx * rz + -dy * fz * 0.9) * s));
  }
  matrices(aspect) {
    const ce = Math.cos(this.el);
    this.eye = [
      this.target[0] + Math.sin(this.az) * ce * this.dist,
      this.target[1] + Math.sin(this.el) * this.dist,
      this.target[2] + Math.cos(this.az) * ce * this.dist,
    ];
    mat4.perspective(this.proj, this.fov, aspect, 1, 160);
    this.proj[9] = -this.shiftY; // décale l'image vers le haut (fiche ouverte en bas)
    mat4.lookAt(this.view, this.eye, this.target, [0, 1, 0]);
    mat4.multiply(this.vp, this.proj, this.view);
    return this.vp;
  }
  basis() {
    const v = this.view;
    return { right: [v[0], v[4], v[8]], up: [v[1], v[5], v[9]] };
  }
  // Projection d'un point monde → pixels (x, y, visible)
  project(p, w, h) {
    const m = this.vp;
    const x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12];
    const y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13];
    const wv = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
    if (wv <= 0.001) return [0, 0, false];
    return [(x / wv * 0.5 + 0.5) * w, (1 - (y / wv * 0.5 + 0.5)) * h, true];
  }
  // Rayon écran → intersection avec le plan y = planeY
  pickGround(px, py, w, h, planeY = 0.06) {
    if (!mat4.invert(this.inv, this.vp)) return null;
    const nx = (px / w) * 2 - 1, ny = 1 - (py / h) * 2, m = this.inv;
    const un = (z) => {
      const x = m[0] * nx + m[4] * ny + m[8] * z + m[12], y = m[1] * nx + m[5] * ny + m[9] * z + m[13];
      const zz = m[2] * nx + m[6] * ny + m[10] * z + m[14], ww = m[3] * nx + m[7] * ny + m[11] * z + m[15];
      return [x / ww, y / ww, zz / ww];
    };
    const a = un(-1), b = un(1), d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    if (Math.abs(d[1]) < 1e-6) return null;
    const t = (planeY - a[1]) / d[1];
    return t < 0 ? null : [a[0] + d[0] * t, planeY, a[2] + d[2] * t];
  }
}
