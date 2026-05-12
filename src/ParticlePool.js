/**
 * ParticlePool — GPU-friendly flat particle buffer.
 *
 * All active particles live in a single THREE.Points object backed by one
 * large BufferGeometry.  Dead particles are parked far off-screen (y=-99999)
 * with alpha=0 so the GPU discards them cheaply.
 *
 * Physics state (velocity, mass, etc.) lives in typed JS arrays; only the
 * render-visible attributes (position, color, size, alpha) are uploaded to
 * the GPU each frame via needsUpdate flags.
 */

import * as THREE from 'three';
import { clamp, lerp } from './utils.js';

// ─── Shaders ─────────────────────────────────────────────────────────────────

const VERT = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3  aColor;

  varying vec3  vColor;
  varying float vAlpha;

  uniform float uScale; // canvas height for size attenuation

  void main() {
    vColor = aColor;
    vAlpha = aAlpha;

    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float depth = max(-mv.z, 1.0);

    // perspective size attenuation — feels natural for distant fireworks
    gl_PointSize = clamp(aSize * uScale * 0.48 / depth, 0.4, 64.0);
    gl_Position  = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  varying vec3  vColor;
  varying float vAlpha;

  void main() {
    // Soft circular sprite with a bright inner core
    vec2  uv   = gl_PointCoord - 0.5;
    float d    = length(uv) * 2.0;
    float soft = 1.0 - smoothstep(0.0, 1.0, d);
    float core = 1.0 - smoothstep(0.0, 0.28, d);

    float a = soft * vAlpha;
    if (a < 0.005) discard;

    vec3 col = vColor + core * vColor * 0.9; // bloom core
    gl_FragColor = vec4(col * a, a);
  }
`;

// ─── Pool ────────────────────────────────────────────────────────────────────

export class ParticlePool {
  /**
   * @param {number} maxParticles  Upper bound on simultaneous live particles.
   */
  constructor(maxParticles = 50000) {
    this.N = maxParticles;
    const N = this.N;

    // ── CPU physics state ──────────────────────────────────────────────────
    this.alive     = new Uint8Array(N);
    this.age       = new Float32Array(N);
    this.lifetime  = new Float32Array(N);
    this.vx        = new Float32Array(N);
    this.vy        = new Float32Array(N);
    this.vz        = new Float32Array(N);
    this.mass      = new Float32Array(N);
    this.drag      = new Float32Array(N);
    this.grav      = new Float32Array(N);
    this.baseR     = new Float32Array(N);
    this.baseG     = new Float32Array(N);
    this.baseB     = new Float32Array(N);
    this.baseSize  = new Float32Array(N);
    this.flicker   = new Uint8Array(N);
    this.flickRate = new Float32Array(N);

    // ── GPU attribute buffers ──────────────────────────────────────────────
    this.pos   = new Float32Array(N * 3);
    this.col   = new Float32Array(N * 3);
    this.sizes = new Float32Array(N);
    this.alpha = new Float32Array(N);

    // Park all off-screen initially
    for (let i = 0; i < N; i++) this.pos[i * 3 + 1] = -99999;

    // ── Three.js objects ───────────────────────────────────────────────────
    const geo = new THREE.BufferGeometry();

    this._posAttr   = new THREE.BufferAttribute(this.pos,   3);
    this._colAttr   = new THREE.BufferAttribute(this.col,   3);
    this._sizeAttr  = new THREE.BufferAttribute(this.sizes, 1);
    this._alphaAttr = new THREE.BufferAttribute(this.alpha, 1);

    for (const attr of [this._posAttr, this._colAttr, this._sizeAttr, this._alphaAttr]) {
      attr.setUsage(THREE.DynamicDrawUsage);
    }

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

    // ── Free-list ──────────────────────────────────────────────────────────
    this._free = new Int32Array(N);
    for (let i = 0; i < N; i++) this._free[i] = N - 1 - i;
    this._freeHead = N; // stack pointer (grows down)
  }

  get freeCount() { return this._freeHead; }

  setCanvasHeight(h) { this._uScale.value = h; }

  // ── Allocation / release ────────────────────────────────────────────────

  allocate(n) {
    if (this._freeHead < n) return null;
    this._freeHead -= n;
    return this._free.subarray(this._freeHead, this._freeHead + n);
  }

  _release(i) {
    this.alive[i] = 0;
    this.alpha[i] = 0;
    this.pos[i * 3 + 1] = -99999;
    this._free[this._freeHead++] = i;
  }

  // ── Spawn ───────────────────────────────────────────────────────────────

  spawn(slot, x, y, z, vx, vy, vz, r, g, b, size, lifetime, drag, grav, mass,
        flicker = false, flickRate = 0) {
    this.alive[slot]    = 1;
    this.age[slot]      = 0;
    this.lifetime[slot] = lifetime;
    this.pos[slot * 3]     = x;
    this.pos[slot * 3 + 1] = y;
    this.pos[slot * 3 + 2] = z;
    this.vx[slot]   = vx;
    this.vy[slot]   = vy;
    this.vz[slot]   = vz;
    this.mass[slot] = mass;
    this.drag[slot] = drag;
    this.grav[slot] = grav;
    this.baseR[slot] = r;
    this.baseG[slot] = g;
    this.baseB[slot] = b;
    this.baseSize[slot]  = size;
    this.flicker[slot]   = flicker ? 1 : 0;
    this.flickRate[slot] = flickRate;
    // Initialize render attrs
    this.col[slot * 3]     = r;
    this.col[slot * 3 + 1] = g;
    this.col[slot * 3 + 2] = b;
    this.sizes[slot] = size;
    this.alpha[slot]  = 0; // fade in on first update
  }

  // ── Per-frame update ─────────────────────────────────────────────────────

  update(dt, time) {
    const N = this.N;
    // Frame-rate-independent drag exponent: drag^(dt*60)
    // Pre-compute nothing — each particle has its own drag coefficient.

    for (let i = 0; i < N; i++) {
      if (!this.alive[i]) continue;

      this.age[i] += dt;
      const t = this.age[i] / this.lifetime[i];

      if (t >= 1.0) {
        this._release(i);
        continue;
      }

      // ── Physics ──
      this.vy[i] -= this.grav[i] * this.mass[i] * dt;
      const d = Math.pow(this.drag[i], dt * 60);
      this.vx[i] *= d;
      this.vy[i] *= d;
      this.vz[i] *= d;

      this.pos[i * 3]     += this.vx[i] * dt;
      this.pos[i * 3 + 1] += this.vy[i] * dt;
      this.pos[i * 3 + 2] += this.vz[i] * dt;

      // ── Color: white-hot flash → palette colour → fade to black ──
      let r, g, b;
      const HOT = 0.18; // longer white-hot phase for better visibility
      if (t < HOT) {
        const h = t / HOT;
        r = lerp(1.0, this.baseR[i], h);
        g = lerp(1.0, this.baseG[i], h);
        b = lerp(1.0, this.baseB[i], h);
      } else {
        // Holds palette colour through ~60% of life, then drops
        const cool = 1.0 - (t - HOT) / (1.0 - HOT);
        const cf   = Math.pow(cool, 1.2);
        r = this.baseR[i] * cf;
        g = this.baseG[i] * cf;
        b = this.baseB[i] * cf;
      }

      // ── Flicker ──
      let flk = 1.0;
      if (this.flicker[i]) {
        flk = 0.62 + 0.38 * Math.abs(Math.sin(time * this.flickRate[i] + i * 0.83));
      }

      this.col[i * 3]     = r * flk;
      this.col[i * 3 + 1] = g * flk;
      this.col[i * 3 + 2] = b * flk;

      // ── Alpha: very fast fade-in (one frame), gradual fade-out ──
      const fadeIn  = clamp(this.age[i] / 0.025, 0, 1);
      const fadeOut = Math.pow(1.0 - t, 1.1); // slightly concave — holds longer
      this.alpha[i] = fadeIn * fadeOut;

      // ── Size: particles shrink gently ──
      this.sizes[i] = this.baseSize[i] * (1.0 - t * 0.55);
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
