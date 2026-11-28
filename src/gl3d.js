// ============================================================ GL3D (WebGL character renderer core)
// One small shader: 2-bone skinning, the game's 2.5D projection, soft key light + sky/ground fill,
// crimson rim light, plate specular, emissive glows and a hit-flash tint. Depth buffer does the sorting.

const GL_BONES = 20;                         // skin matrices uploaded per frame
const GL_STRIDE = 15;                        // pos3 nrm3 col3 bone2 weight1 emit1 spec1 mat1

const GL_VS = `
precision highp float;
attribute vec3 aPos; attribute vec3 aNrm; attribute vec3 aCol; attribute vec2 aBone; attribute float aW;
attribute float aEmit; attribute float aSpec; attribute float aMat;
uniform mat4 uBones[${GL_BONES}];
uniform vec2 uYaw;           // cos, sin of facing
uniform vec4 uBox;           // layer: origin x, origin y (points from top-left), width, height
uniform float uK; uniform float uDepth;
varying vec3 vN; varying vec3 vCol; varying float vEmit; varying float vSpec; varying float vZ; varying vec3 vP; varying float vMat;
void main() {
  mat4 m = uBones[int(aBone.x)] * aW + uBones[int(aBone.y)] * (1.0 - aW);
  vec3 p = (m * vec4(aPos, 1.0)).xyz;
  vec3 n = (m * vec4(aNrm, 0.0)).xyz;
  // char frame (s right, f forward, z up) -> world (X, Y away from camera, Z up)
  float c = uYaw.x, s = uYaw.y;
  vec3 W = vec3(p.x * s + p.y * c, -p.x * c + p.y * s, p.z);
  vN = vec3(n.x * s + n.y * c, -n.x * c + n.y * s, n.z);
  float sx = uBox.x + W.x, sy = uBox.y - (W.y * uK + W.z);
  gl_Position = vec4(sx / uBox.z * 2.0 - 1.0, 1.0 - sy / uBox.w * 2.0, (W.y - uK * W.z) / uDepth, 1.0);
  vCol = aCol; vEmit = aEmit; vSpec = aSpec; vZ = W.z; vP = aPos; vMat = aMat;
}`;

const GL_FS = `
precision highp float;
varying vec3 vN; varying vec3 vCol; varying float vEmit; varying float vSpec; varying float vZ; varying vec3 vP; varying float vMat;
uniform vec3 uLight; uniform vec3 uView; uniform vec3 uRim; uniform vec4 uFlash; uniform vec3 uBack;
uniform float uBackMix; uniform float uEmitGain; uniform float uDetail; uniform vec4 uEmitTint;
// surface detail from the model's own (bind-space) position, so it stays put on the surface as he moves
float h3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vnoise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1.0, 0.0, 0.0)), f.x), mix(h3(i + vec3(0.0, 1.0, 0.0)), h3(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(h3(i + vec3(0.0, 0.0, 1.0)), h3(i + vec3(1.0, 0.0, 1.0)), f.x), mix(h3(i + vec3(0.0, 1.0, 1.0)), h3(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}
void main() {
  vec3 N = normalize(vN);
  vec3 col = vCol;
  if (dot(N, uView) < 0.0) { N = -N; col = mix(col, uBack, uBackMix); }   // seeing the inside / underside of a surface
  float specMul = 1.0, sheen = 0.0;
  if (vMat > 0.5 && uDetail > 0.0) {
    vec3 p = vP * uDetail;
    col *= 0.9 + 0.2 * vnoise(p * 0.16);                                       // broad tonal variation: nothing is flat
    if (vMat < 1.5) {                                                         // cloth: weave + soft fuzz at grazing angles
      float w = 0.5 + 0.5 * sin(dot(p, vec3(1.5, 0.0, 1.5))) * sin(dot(p, vec3(-1.5, 0.9, 1.5)));
      col *= 0.92 + 0.1 * w + 0.14 * (vnoise(p * 0.9) - 0.5);
      sheen = 0.18;
    } else if (vMat < 2.5) {                                                  // leather / skin: grain and blotching
      float g = vnoise(p * 1.7), b = vnoise(p * 0.45 + 3.1);
      col *= 0.84 + 0.22 * g + 0.12 * (b - 0.5);
      specMul = 0.55 + 0.9 * g;
    } else {                                                                  // metal / obsidian: brushing, scratches, grime
      float br = vnoise(p * vec3(3.6, 0.6, 0.6)), s = vnoise(p * 1.9 + 7.0), d = vnoise(p * 0.7 + 11.0);
      float scr = smoothstep(0.80, 0.84, s) * (1.0 - smoothstep(0.84, 0.88, s));
      col *= 0.9 + 0.14 * br; col += vec3(0.07) * scr;
      col *= mix(0.86, 1.0, smoothstep(0.2, 0.4, d));                         // dull grime in patches
      specMul = (0.7 + 0.5 * br) * mix(0.5, 1.0, smoothstep(0.22, 0.42, d)) + 1.2 * scr;
    }
  }
  float diff = max(dot(N, uLight), 0.0);
  float hemi = mix(0.45, 1.0, N.z * 0.5 + 0.5);                     // darker undersides
  float facing = max(dot(N, uView), 0.0);
  float rim = pow(1.0 - facing, 4.0);
  vec3 H = normalize(uLight + uView);
  float spec = pow(max(dot(N, H), 0.0), 28.0) * vSpec * specMul;
  vec3 lit = col * (0.32 * hemi + 0.95 * diff) + spec * vec3(0.85, 0.86, 0.95) + rim * uRim + col * sheen * pow(1.0 - facing, 2.0);
  vec3 ec = mix(col, vec3(max(col.r, max(col.g, col.b))) * uEmitTint.rgb, uEmitTint.a);   // foes burn another colour
  lit = mix(lit, ec * uEmitGain, vEmit);
  lit += uFlash.rgb * uFlash.a;                                         // hit / glow flash (additive)
  gl_FragColor = vec4(lit, 1.0);
}`;

function glCompile(gl, type, src) {
  const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
  return sh;
}

/** A mesh under construction: plain arrays, uploaded once by GLChar.upload(). */
class MeshBuilder {
  constructor() { this.v = []; this.i = []; }
  get count() { return this.v.length / GL_STRIDE; }
  /** mat: surface detail kind; left out = worked out from emit/spec (glowing: none, shiny: metal, matte: cloth, else leather). */
  vert(p, n, col, b0, b1, w, emit, spec, mat) {
    emit = emit || 0; spec = spec || 0;
    if (mat === undefined) mat = emit > 0.5 ? 0 : spec >= 0.45 ? 3 : spec <= 0.1 ? 1 : 2;
    this.v.push(p[0], p[1], p[2], n[0], n[1], n[2], col[0], col[1], col[2], b0, b1, w, emit, spec, mat);
    return this.count - 1;
  }
  tri(a, b, c) { this.i.push(a, b, c); }
  quad(a, b, c, d) { this.i.push(a, b, c, a, c, d); }
}

function hexRGB(h) { const v = parseInt(h.slice(1), 16); return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255]; }
const v3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, k) => [a[0] * k, a[1] * k, a[2] * k], dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]), norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
};

/** Orthonormal frame (as a 3x4 column matrix in a Float32Array(16), mat4 layout) from origin, axis and a reference. */
function frameFrom(out, o, axis, ref) {
  const x = v3.norm(axis); let y = v3.sub(ref, v3.mul(x, v3.dot(ref, x)));
  if (v3.len(y) < 1e-4) y = Math.abs(x[2]) < 0.9 ? v3.sub([0, 0, 1], v3.mul(x, x[2])) : v3.sub([0, 1, 0], v3.mul(x, x[1]));
  y = v3.norm(y); const z = v3.cross(x, y);
  out[0] = x[0]; out[1] = x[1]; out[2] = x[2]; out[3] = 0;
  out[4] = y[0]; out[5] = y[1]; out[6] = y[2]; out[7] = 0;
  out[8] = z[0]; out[9] = z[1]; out[10] = z[2]; out[11] = 0;
  out[12] = o[0]; out[13] = o[1]; out[14] = o[2]; out[15] = 1;
  return out;
}
function mat4Mul(out, a, b) {                  // out = a * b (column-major)
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++)
    out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  return out;
}
function mat4InvRigid(out, m) {                // inverse of rotation+translation (+uniform scale 1)
  out[0] = m[0]; out[1] = m[4]; out[2] = m[8]; out[3] = 0;
  out[4] = m[1]; out[5] = m[5]; out[6] = m[9]; out[7] = 0;
  out[8] = m[2]; out[9] = m[6]; out[10] = m[10]; out[11] = 0;
  out[12] = -(m[0] * m[12] + m[1] * m[13] + m[2] * m[14]);
  out[13] = -(m[4] * m[12] + m[5] * m[13] + m[6] * m[14]);
  out[14] = -(m[8] * m[12] + m[9] * m[13] + m[10] * m[14]); out[15] = 1;
  return out;
}

class GLChar {
  constructor(canvas) {
    const gl = canvas.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true, depth: true });
    if (!gl) throw new Error('no webgl');
    this.gl = gl; this.canvas = canvas;
    const pr = gl.createProgram();
    gl.attachShader(pr, glCompile(gl, gl.VERTEX_SHADER, GL_VS)); gl.attachShader(pr, glCompile(gl, gl.FRAGMENT_SHADER, GL_FS));
    gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
    this.pr = pr; gl.useProgram(pr);
    const A = (n) => gl.getAttribLocation(pr, n), U = (n) => gl.getUniformLocation(pr, n);
    this.a = { pos: A('aPos'), nrm: A('aNrm'), col: A('aCol'), bone: A('aBone'), w: A('aW'), emit: A('aEmit'), spec: A('aSpec'), mat: A('aMat') };
    this.u = { bones: U('uBones'), yaw: U('uYaw'), box: U('uBox'), k: U('uK'), light: U('uLight'), view: U('uView'), rim: U('uRim'),
      flash: U('uFlash'), depth: U('uDepth'), detail: U('uDetail'), back: U('uBack'), backMix: U('uBackMix'), emitGain: U('uEmitGain'), emitTint: U('uEmitTint') };
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.disable(gl.CULL_FACE);
    gl.uniform1f(this.u.k, K); gl.uniform1f(this.u.depth, 420); gl.uniform1f(this.u.detail, 1);
    const L = v3.norm([-0.5, -0.65, 0.75]), V = v3.norm([0, -1, K]);
    gl.uniform3f(this.u.light, L[0], L[1], L[2]); gl.uniform3f(this.u.view, V[0], V[1], V[2]);
    gl.uniform3f(this.u.rim, 0.30, 0.04, 0.07);
  }
  /** Upload a finished MeshBuilder. dynamic: positions/normals rewritten each frame (cloth). */
  upload(mb, dynamic) {
    const gl = this.gl, vb = gl.createBuffer(), ib = gl.createBuffer();
    const data = new Float32Array(mb.v);
    gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, data, dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(mb.i), gl.STATIC_DRAW);
    return { vb, ib, n: mb.i.length, data: dynamic ? data : null };
  }
  begin(w, h, box) {
    const gl = this.gl;
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    gl.viewport(0, 0, w, h); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniform4f(this.u.box, box[0], box[1], box[2], box[3]);
  }
  draw(m) {
    const gl = this.gl, a = this.a, S = GL_STRIDE * 4;
    gl.bindBuffer(gl.ARRAY_BUFFER, m.vb); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.ib);
    const at = (loc, n, off) => { if (loc < 0) return; gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, S, off * 4); };
    at(a.pos, 3, 0); at(a.nrm, 3, 3); at(a.col, 3, 6); at(a.bone, 2, 9); at(a.w, 1, 11); at(a.emit, 1, 12); at(a.spec, 1, 13); at(a.mat, 1, 14);
    gl.drawElements(gl.TRIANGLES, m.n, gl.UNSIGNED_SHORT, 0);
  }
  updateDynamic(m) {
    const gl = this.gl; gl.bindBuffer(gl.ARRAY_BUFFER, m.vb); gl.bufferSubData(gl.ARRAY_BUFFER, 0, m.data);
  }
}
