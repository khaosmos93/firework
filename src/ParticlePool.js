/**
 * ParticlePool — single GPU buffer for all live particles.
 *
 * Size formula fix: the camera is ~3500 units above the explosion plane.
 * Old multiplier (0.48) produced sub-pixel points. New multiplier (4.5)
 * produces clearly visible particles (15–60 px depending on base size).
 */

import * as THREE from 'three';

const VERT = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3  aColor;

  varying vec3  vColor;
  varying float vAlpha;

  uniform float uScale; // physical canvas height

  void main() {
    vColor = aColor;
    vAlpha = aAlpha;

    vec4 mv    = modelViewMatrix * vec4(position, 1.0);
    float depth = max(-mv.z, 1.0);

    // 4.5× multiplier makes particles clearly visible at depth ~3500.
    gl_PointSize = clamp(aSize * uScale * 4.5 / depth, 1.0, 256.0);
    gl_Position  = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  varying vec3  vColor;
  varying float vAlpha;

  void main() {
    vec2  uv   = gl_PointCoord - 0.5;
    float d    = length(uv) * 2.0;
    float soft = 1.0 - smoothstep(0.3, 1.0, d);
    float core = 1.0 - smoothstep(0.0, 0.25, d);

    float a = soft * vAlpha;
    if (a < 0.004) discard;

    // Bright glowing core — no external bloom needed.
    vec3 col = vColor * (1.0 + core * 2.5);
    gl_FragColor = vec4(col * a, a);
  }
`;

export class ParticlePool {
  constructor(maxParticles = 30000) {
    this.N = maxParticles;
    const N = this.N;

    // CPU physics state
    this.alive    = new Uint8Array(N);
    this.age      = new Float32Array(N);
    this.lifetime = new Float32Array(N);
    this.vx       = new Float32Array(N);
    this.vy       = new Float32Array(N);
    this.vz       = new Float32Array(N);
    this.drag     = new Float32Array(N);
    this.grav     = new Float32Array(N);
    this.baseR    = new Float32Array(N);
    this.baseG    = new Float32Array(N);
    this.baseB    = new Float32Array(N);
    this.baseSize = new Float32Array(N);

    // GPU attribute buffers
    this.pos   = new Float32Array(N * 3);
    this.col   = new Float32Array(N * 3);
    this.sizes = new Float32Array(N);
    this.alpha = new Float32Array(N);

    // Park all particles off-screen initially.
    for (let i = 0; i < N; i++) this.pos[i * 3 + 1] = -99999;

    const geo = new THREE.BufferGeometry();

    this._posAttr   = new THREE.BufferAttribute(this.pos,   3);
    this._colAttr   = new THREE.BufferAttribute(this.col,   3);
    this._sizeAttr  = new THREE.BufferAttribute(this.sizes, 1);
    this._alphaAttr = new THREE.BufferAttribute(this.alpha, 1);

    for (const a of [this._posAttr, this._colAttr, this._sizeAttr, this._alphaAttr])
      a.setUsage(THREE.DynamicDrawUsage);

    geo.setAttribute('position', this._posAttr);
    geo.setAttribute('aColor',   this._colAttr);
    geo.setAttribute('aSize',    this._sizeAttr);
    geo.setAttribute('aAlpha',   this._alphaAttr);
    geo.setDrawRange(0, N);

    this._uScale = { value: 800 };

    this.material = new THREE.ShaderMaterial({
      vertexShader:   VERT,
      fragmentShader: FRAG,
      uniforms:       { uScale: this._uScale },
      transparent:    true,
      blending:       THREE.AdditiveBlending,
      depthWrite:     false,
      depthTest:      false,
    });

    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;

    // Free-list stack (index N-1 down to 0).
    this._free = new Int32Array(N);
    for (let i = 0; i < N; i++) this._free[i] = N - 1 - i;
    this._freeHead = N;
  }

  get freeCount() { return this._freeHead; }
  setCanvasHeight(h) { this._uScale.value = h; }

  // ── Allocation ─────────────────────────────────────────────────────────────

  allocate(n) {
    if (this._freeHead < n) return null;
    this._freeHead -= n;
    return this._free.subarray(this._freeHead, this._freeHead + n);
  }

  release(i) {
    this.alive[i]         = 0;
    this.alpha[i]         = 0;
    this.pos[i * 3 + 1]  = -99999;
    this._free[this._freeHead++] = i;
  }

  // ── Spawn ──────────────────────────────────────────────────────────────────

  spawn(slot, x, y, z, vx, vy, vz, r, g, b, size, lifetime, drag, grav) {
    this.alive[slot]    = 1;
    this.age[slot]      = 0;
    this.lifetime[slot] = lifetime;
    this.pos[slot*3]    = x;
    this.pos[slot*3+1]  = y;
    this.pos[slot*3+2]  = z;
    this.vx[slot]       = vx;
    this.vy[slot]       = vy;
    this.vz[slot]       = vz;
    this.drag[slot]     = drag;
    this.grav[slot]     = grav;
    this.baseR[slot]    = r;
    this.baseG[slot]    = g;
    this.baseB[slot]    = b;
    this.baseSize[slot] = size;
    this.col[slot*3]    = r;
    this.col[slot*3+1]  = g;
    this.col[slot*3+2]  = b;
    this.sizes[slot]    = size;
    this.alpha[slot]    = 1;
  }

  // ── Per-frame update ────────────────────────────────────────────────────────

  update(dt) {
    const N = this.N;
    for (let i = 0; i < N; i++) {
      if (!this.alive[i]) continue;

      this.age[i] += dt;
      const t = this.age[i] / this.lifetime[i];

      if (t >= 1.0) { this.release(i); continue; }

      // Physics: gravity then drag
      this.vy[i] -= this.grav[i] * dt;
      const d = Math.pow(this.drag[i], dt * 60);
      this.vx[i] *= d;
      this.vy[i] *= d;
      this.vz[i] *= d;

      this.pos[i*3]   += this.vx[i] * dt;
      this.pos[i*3+1] += this.vy[i] * dt;
      this.pos[i*3+2] += this.vz[i] * dt;

      // White-hot flash at birth → palette color → fade out
      const hot  = Math.min(t * 7.0, 1.0); // white-hot for first ~14% of life
      const fade = Math.pow(1.0 - t, 1.4); // gradual fade, holds color longer

      this.col[i*3]   = ((1 - hot) + this.baseR[i] * hot);
      this.col[i*3+1] = ((1 - hot) + this.baseG[i] * hot);
      this.col[i*3+2] = ((1 - hot) + this.baseB[i] * hot);
      this.alpha[i]   = fade;
      this.sizes[i]   = this.baseSize[i] * (0.55 + 0.45 * (1 - t));
    }

    this._posAttr.needsUpdate   = true;
    this._colAttr.needsUpdate   = true;
    this._sizeAttr.needsUpdate  = true;
    this._alphaAttr.needsUpdate = true;
  }

  dispose() {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}
