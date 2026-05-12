/**
 * main.js — bootstrap and animation loop.
 *
 * Top-down view: camera is nearly directly overhead.
 * Click/tap maps to the explosion altitude plane so bursts appear
 * exactly where the user touches.
 *
 * GitHub Pages deployment:
 *   npm install && npm run build
 *   Deploy the dist/ folder.  Base path is '/firework/' — set in vite.config.js.
 */

import { Renderer, EXPLOSION_ALTITUDE } from './Renderer.js';
import { ParticlePool } from './ParticlePool.js';
import { Firework }     from './Firework.js';
import { FireworkGen }  from './FireworkGen.js';
import { Atmosphere }   from './Atmosphere.js';
import { Input }        from './Input.js';
import { rand }         from './utils.js';

// ── Device capability ─────────────────────────────────────────────────────────
const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
               || window.innerWidth < 768;

const MAX_PARTICLES = isMobile ? 22000 : 52000;

// ── WebGL check ───────────────────────────────────────────────────────────────
function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl'));
  } catch { return false; }
}

if (!hasWebGL()) {
  document.getElementById('error').classList.add('show');
  throw new Error('WebGL not available');
}

// ── Initialise systems ────────────────────────────────────────────────────────
const container  = document.getElementById('app');
const hint       = document.getElementById('hint');

const renderer   = new Renderer(container, isMobile);
const pool       = new ParticlePool(MAX_PARTICLES);
const gen        = new FireworkGen();
const atmosphere = new Atmosphere(renderer.scene);

renderer.scene.add(pool.points);

// ── Active firework list ──────────────────────────────────────────────────────
const fireworks = [];

/**
 * Spawn a firework at a 3D world position.
 * ex, ey, ez = explosion center (ey defaults to EXPLOSION_ALTITUDE).
 */
function launch(ex, ey, ez, overrides = {}) {
  if (pool.freeCount < 300) return; // skip if pool nearly exhausted
  const params = gen.generate(overrides);
  fireworks.push(new Firework(pool, params, ex, ey, ez));
}

// ── User input ────────────────────────────────────────────────────────────────
let hintHidden = false;

const input = new Input(container, (ndcX, ndcY) => {
  if (!hintHidden) {
    hintHidden = true;
    hint.classList.add('fade');
  }

  // Raycast to explosion altitude plane → burst appears at exact tap location
  const pos = renderer.screenToExplosion(ndcX, ndcY);
  if (!pos) return;

  // Clamp horizontal distance to keep fireworks visible on screen
  const MAX_DIST = 10000;
  const d = Math.sqrt(pos.x * pos.x + pos.z * pos.z);
  if (d > MAX_DIST) {
    const s = MAX_DIST / d;
    pos.x *= s;
    pos.z *= s;
  }

  launch(pos.x, pos.y, pos.z);
});

// ── Auto-ambient fireworks ────────────────────────────────────────────────────
// A few background bursts fire automatically to keep the scene alive.

let _autoCountdown = rand(3, 7);

function autoFire() {
  const count = Math.floor(rand(1, 3.5));
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist  = rand(1500, 5000);
    const ex    = Math.cos(angle) * dist;
    const ez    = Math.sin(angle) * dist;
    const ey    = EXPLOSION_ALTITUDE + rand(-80, 120);

    launch(ex, ey, ez, {
      particleCount: Math.floor(rand(60, 200)),
      baseRadius:    rand(80, 200),
      brightness:    rand(0.22, 0.55),
      sparkLifetime: rand(0.9, 2.5),
      sparkSizeBase: rand(3, 8),
    });
  }
  _autoCountdown = rand(4, 11);
}

// ── Animation loop ────────────────────────────────────────────────────────────
let _lastTime = -1;

function animate(tsMs) {
  requestAnimationFrame(animate);

  const t  = tsMs * 0.001;
  const dt = _lastTime < 0 ? 0.016 : Math.min(t - _lastTime, 0.05);
  _lastTime = t;

  // Auto ambient
  _autoCountdown -= dt;
  if (_autoCountdown <= 0) autoFire();

  // Atmosphere drift
  atmosphere.update(dt);
  renderer.applyDrift(atmosphere.getDrift());

  // Particle shader scale sync
  pool.setCanvasHeight(renderer.canvasHeight);

  // Advance fireworks
  for (let i = fireworks.length - 1; i >= 0; i--) {
    fireworks[i].update(dt);
    if (fireworks[i].done) fireworks.splice(i, 1);
  }

  // Physics + GPU upload
  pool.update(dt, t);

  renderer.render();
}

requestAnimationFrame(animate);
