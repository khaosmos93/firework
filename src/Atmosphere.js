/**
 * Atmosphere — ambient scene elements:
 *   • Dense city-light field at ground level
 *   • Distant horizon city glow
 *   • Subtle cloud/haze plane
 *   • Airplane vibration math (no Three.js objects here)
 */

import * as THREE from 'three';
import { rand } from './utils.js';

export class Atmosphere {
  constructor(scene) {
    this.scene     = scene;
    this.time      = 0;
    this.vibration = { x: 0, y: 0, z: 0 };

    this._buildCityLights();
    this._buildHorizonGlow();
    this._buildHazePlane();
  }

  // ── City lights ────────────────────────────────────────────────────────────

  _buildCityLights() {
    // ~22 000 warm dots arranged in rough grid blocks (simulates urban grids)
    const COUNT = 22000;
    const pos   = new Float32Array(COUNT * 3);
    const col   = new Float32Array(COUNT * 3);
    const siz   = new Float32Array(COUNT);

    for (let i = 0; i < COUNT; i++) {
      // Weighted spread: dense center, sparse edges
      const r     = Math.pow(Math.random(), 0.6) * 5500 + 80;
      const angle = Math.random() * Math.PI * 2;

      // Snap to loose grid to mimic city blocks
      const gx = Math.round(Math.cos(angle) * r / rand(45, 90)) * rand(45, 90);
      const gz = Math.round(Math.sin(angle) * r / rand(45, 90)) * rand(45, 90);

      pos[i * 3]     = gx + rand(-20, 20);
      pos[i * 3 + 1] = rand(-8, 2);                 // just at / below ground
      pos[i * 3 + 2] = -(gz + rand(-20, 20));       // forward in -Z direction

      // Color: sodium-vapor yellow (60%), LED white (25%), industrial blue (15%)
      const t = Math.random();
      let lr, lg, lb;
      if (t < 0.60) {
        lr = rand(0.88, 1.0); lg = rand(0.65, 0.88); lb = rand(0.15, 0.42);
      } else if (t < 0.85) {
        lr = rand(0.75, 1.0); lg = rand(0.75, 1.0); lb = rand(0.78, 1.0);
      } else {
        lr = rand(0.25, 0.55); lg = rand(0.35, 0.65); lb = rand(0.65, 1.0);
      }
      const br = rand(0.06, 0.28);
      col[i * 3]     = lr * br;
      col[i * 3 + 1] = lg * br;
      col[i * 3 + 2] = lb * br;

      siz[i] = rand(0.8, 3.5);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color',    new THREE.BufferAttribute(col, 3));
    geo.setAttribute('size',     new THREE.BufferAttribute(siz, 1));

    // Custom mini-shader so per-vertex size works with vertexColors
    const mat = new THREE.ShaderMaterial({
      uniforms: {},
      vertexShader: /* glsl */ `
        attribute float size;
        varying vec3 vCol;
        void main() {
          vCol = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = clamp(size * 600.0 / max(-mv.z, 1.0), 0.3, 6.0);
          gl_Position  = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vCol;
        void main() {
          vec2  uv = gl_PointCoord - 0.5;
          float d  = length(uv) * 2.0;
          float a  = 1.0 - smoothstep(0.4, 1.0, d);
          if (a < 0.01) discard;
          gl_FragColor = vec4(vCol * a, a);
        }
      `,
      transparent: true,
      blending:    THREE.AdditiveBlending,
      depthWrite:  false,
      vertexColors: true,
    });

    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.scene.add(pts);
    this._cityLights = pts;
  }

  // ── Horizon glow ───────────────────────────────────────────────────────────

  _buildHorizonGlow() {
    const COUNT = 3000;
    const pos   = new Float32Array(COUNT * 3);
    const col   = new Float32Array(COUNT * 3);

    for (let i = 0; i < COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist  = rand(5500, 18000);
      pos[i * 3]     = Math.cos(angle) * dist;
      pos[i * 3 + 1] = rand(-30, 20);
      pos[i * 3 + 2] = Math.sin(angle) * dist - 1000;

      const br = rand(0.015, 0.06);
      col[i * 3]     = br * rand(0.85, 1.0);
      col[i * 3 + 1] = br * rand(0.58, 0.85);
      col[i * 3 + 2] = br * rand(0.08, 0.32);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color',    new THREE.BufferAttribute(col, 3));

    const mat = new THREE.PointsMaterial({
      vertexColors:   true,
      size:           4,
      sizeAttenuation: true,
      transparent:    true,
      opacity:        0.5,
      blending:       THREE.AdditiveBlending,
      depthWrite:     false,
    });

    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.scene.add(pts);
  }

  // ── Haze / cloud plane ────────────────────────────────────────────────────

  _buildHazePlane() {
    // Very faint translucent plane below the camera to imply clouds
    const geo = new THREE.PlaneGeometry(30000, 30000, 1, 1);
    geo.rotateX(-Math.PI / 2);

    const mat = new THREE.MeshBasicMaterial({
      color:       0x0a1428,
      transparent: true,
      opacity:     0.18,
      depthWrite:  false,
      side:        THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = 600; // halfway up — simulates cloud layer below
    this.scene.add(mesh);
    this._hazePlane = mesh;
  }

  // ── Per-frame update ───────────────────────────────────────────────────────

  update(dt) {
    this.time += dt;
    const t = this.time;

    // Multi-frequency sinusoidal vibration (airplane turbulence)
    this.vibration.x =
      Math.sin(t * 0.31) * 1.8 +
      Math.sin(t * 1.73) * 0.9 +
      Math.sin(t * 4.17) * 0.28;

    this.vibration.y =
      Math.sin(t * 0.52) * 0.9 +
      Math.sin(t * 2.29) * 0.38;

    this.vibration.z =
      Math.sin(t * 0.44) * 1.1 +
      Math.sin(t * 1.13) * 0.55;
  }

  getVibration() { return this.vibration; }
}
