/**
 * main.js — bootstrap and animation loop.
 *
 * System wiring:
 *   Input → Renderer.screenToGround → FireworkGen.generate → Firework (→ ParticlePool)
 *   Atmosphere vibration → Renderer.applyVibration
 *
 * GitHub Pages deployment:
 *   npm install && npm run build
 *   Output is in /dist — push that folder (or the repo root with /dist) to
 *   the gh-pages branch, or configure Pages to serve from /dist on main.
 *   The vite.config.js base path is already set to '/firework/'.
 */

import { Renderer }     from './Renderer.js';
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
    return !!(
      c.getContext('webgl2') ||
      c.getContext('webgl') ||
      c.getContext('experimental-webgl')
    );
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

function launch(gx, gz, paramOverrides = {}) {
  // Graceful degradation: skip if pool is very full
  if (pool.freeCount < 350) return;
  const params = gen.generate(paramOverrides);
  fireworks.push(new Firework(pool, params, gx, gz));
}

// ── User input ────────────────────────────────────────────────────────────────
let hintHidden = false;

const input = new Input(container, (ndcX, ndcY) => {
  if (!hintHidden) {
    hintHidden = true;
    hint.classList.add('fade');
  }

  const groundPos = renderer.screenToGround(ndcX, ndcY);
  if (!groundPos) return;

  // Clamp to reasonable distance so faraway clicks still produce visible fireworks
  const maxDist = 12000;
  const d = Math.sqrt(groundPos.x * groundPos.x + groundPos.z * groundPos.z);
  if (d > maxDist) {
    const scale = maxDist / d;
    groundPos.x *= scale;
    groundPos.z *= scale;
  }

  launch(groundPos.x, groundPos.z);
});

// ── Auto-ambient horizon fireworks ────────────────────────────────────────────
// Occasional distant fireworks fire automatically for cinematic effect

let _autoTimer     = rand(3, 7); // first auto fire in 3–7 sec
let _autoCountdown = _autoTimer;

function autoFireHorizon() {
  // Spawn 1–3 small distant fireworks in a random direction
  const count = Math.floor(rand(1, 3.5));
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist  = rand(1800, 5500);
    const gx    = Math.cos(angle) * dist;
    const gz    = Math.sin(angle) * dist - rand(500, 2000); // biased forward

    launch(gx, gz, {
      particleCount: Math.floor(rand(60, 200)),
      baseRadius:    rand(60, 160),
      brightness:    rand(0.2, 0.55),
      apexHeight:    rand(100, 300),
      sparkLifetime: rand(0.8, 2.2),
      sparkSizeBase: rand(2, 6),
    });
  }

  // Schedule next auto-fire: 4–12 seconds
  _autoCountdown = rand(4, 12);
}

// ── Animation loop ────────────────────────────────────────────────────────────
let _lastTime = -1;

function animate(tsMs) {
  requestAnimationFrame(animate);

  // Convert timestamp and clamp dt to avoid spiral-of-death on tab re-focus
  const t  = tsMs * 0.001;
  const dt = _lastTime < 0 ? 0.016 : Math.min(t - _lastTime, 0.05);
  _lastTime = t;

  // Auto horizon fireworks
  _autoCountdown -= dt;
  if (_autoCountdown <= 0) autoFireHorizon();

  // Atmosphere & vibration
  atmosphere.update(dt);
  renderer.applyVibration(atmosphere.getVibration());

  // Keep the particle shader scale uniform in sync with canvas size
  pool.setCanvasHeight(renderer.canvasHeight);

  // Advance fireworks (remove done ones)
  for (let i = fireworks.length - 1; i >= 0; i--) {
    fireworks[i].update(dt, t);
    if (fireworks[i].done) fireworks.splice(i, 1);
  }

  // Update particle physics + GPU buffers
  pool.update(dt, t);

  // Render
  renderer.render();
}

requestAnimationFrame(animate);
