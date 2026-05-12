/**
 * Atmosphere — ambient scene elements for the top-down sky view:
 *   • City-light field at ground level (viewed from directly above)
 *   • Thin atmospheric haze plane
 *   • Gentle observer drift (no airplane turbulence — observer is stationary in sky)
 */

import * as THREE from 'three';
import { rand } from './utils.js';

export class Atmosphere {
  constructor(scene) {
    this.scene     = scene;
    this.time      = 0;
    this.drift     = { x: 0, y: 0, z: 0 };

    this._buildCityLights();
    this._buildHorizonGlow();
    this._buildGroundHaze();
  }

  // ── City lights ────────────────────────────────────────────────────────────
  // Viewed from directly above: warm grid of dots across the ground plane.

  _buildCityLights() {
    const COUNT = 28000;
    const pos   = new Float32Array(COUNT * 3);
    const col   = new Float32Array(COUNT * 3);
    const siz   = new Float32Array(COUNT);

    for (let i = 0; i < COUNT; i++) {
      // Radial spread — denser near center (directly below camera)
      const r     = Math.pow(Math.random(), 0.55) * 7000 + 60;
      const angle = Math.random() * Math.PI * 2;

      // Snap to grid blocks (urban grid feel)
      const blockSize = rand(50, 110);
      const gx = Math.round(Math.cos(angle) * r / blockSize) * blockSize;
      const gz = Math.round(Math.sin(angle) * r / blockSize) * blockSize;

      pos[i * 3]     = gx + rand(-18, 18);
      pos[i * 3 + 1] = rand(-6, 1);
      pos[i * 3 + 2] = gz + rand(-18, 18);

      // Sodium-vapor yellow (55%), LED white (28%), cool blue (17%)
      const t = Math.random();
      let lr, lg, lb;
      if (t < 0.55) {
        lr = rand(0.88, 1.0); lg = rand(0.62, 0.85); lb = rand(0.10, 0.38);
      } else if (t < 0.83) {
        lr = rand(0.75, 1.0); lg = rand(0.75, 1.0); lb = rand(0.80, 1.0);
      } else {
        lr = rand(0.22, 0.50); lg = rand(0.32, 0.60); lb = rand(0.65, 1.0);
      }
      const br = rand(0.05, 0.24);
      col[i * 3]     = lr * br;
      col[i * 3 + 1] = lg * br;
      col[i * 3 + 2] = lb * br;
      siz[i] = rand(0.8, 3.8);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color',    new THREE.BufferAttribute(col, 3));
    geo.setAttribute('size',     new THREE.BufferAttribute(siz, 1));

    const mat = new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `
        attribute float size;
        varying vec3 vCol;
        void main() {
          vCol = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = clamp(size * 650.0 / max(-mv.z, 1.0), 0.3, 5.0);
          gl_Position  = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vCol;
        void main() {
          vec2  uv = gl_PointCoord - 0.5;
          float d  = length(uv) * 2.0;
          float a  = 1.0 - smoothstep(0.3, 1.0, d);
          if (a < 0.01) discard;
          gl_FragColor = vec4(vCol * a, a);
        }
      `,
      transparent:  true,
      blending:     THREE.AdditiveBlending,
      depthWrite:   false,
      vertexColors: true,
    });

    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.scene.add(pts);
  }

  // ── Horizon / edge glow ────────────────────────────────────────────────────

  _buildHorizonGlow() {
    const COUNT = 4000;
    const pos   = new Float32Array(COUNT * 3);
    const col   = new Float32Array(COUNT * 3);

    for (let i = 0; i < COUNT; i++) {
      const a    = Math.random() * Math.PI * 2;
      const dist = rand(6000, 22000);
      pos[i * 3]     = Math.cos(a) * dist;
      pos[i * 3 + 1] = rand(-20, 5);
      pos[i * 3 + 2] = Math.sin(a) * dist;

      const br = rand(0.012, 0.055);
      col[i * 3]     = br * rand(0.82, 1.0);
      col[i * 3 + 1] = br * rand(0.55, 0.82);
      col[i * 3 + 2] = br * rand(0.06, 0.28);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color',    new THREE.BufferAttribute(col, 3));

    const mat = new THREE.PointsMaterial({
      vertexColors:    true,
      size:            5,
      sizeAttenuation: true,
      transparent:     true,
      opacity:         0.45,
      blending:        THREE.AdditiveBlending,
      depthWrite:      false,
    });

    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.scene.add(pts);
  }

  // ── Ground haze ────────────────────────────────────────────────────────────
  // Faint plane at low altitude — implies atmospheric scattering below the viewer.

  _buildGroundHaze() {
    const geo = new THREE.PlaneGeometry(40000, 40000);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color:       0x060d1e,
      transparent: true,
      opacity:     0.22,
      depthWrite:  false,
      side:        THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = 80; // just above ground
    this.scene.add(mesh);
  }

  // ── Per-frame update ───────────────────────────────────────────────────────

  update(dt) {
    this.time += dt;
    const t = this.time;

    // Very slow, very small camera drift — observer is stationary in the sky.
    // Multiple low frequencies for organic feel, no airplane turbulence.
    this.drift.x = Math.sin(t * 0.07) * 2.5 + Math.sin(t * 0.19) * 0.8;
    this.drift.y = Math.sin(t * 0.05) * 0.9;
    this.drift.z = Math.sin(t * 0.08) * 2.0 + Math.sin(t * 0.23) * 0.6;
  }

  getDrift() { return this.drift; }
}
