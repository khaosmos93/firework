/**
 * main.js — bootstrap and animation loop.
 *
 * Top-down view: camera directly overhead at y=5000.
 * Click/tap maps to explosion-altitude plane so the user picks where to burst.
 * Five demo fireworks launch immediately on page load.
 */

import * as THREE from 'three';
import { Renderer } from './Renderer.js';
import { ParticlePool } from './ParticlePool.js';
import { Firework } from './Firework.js';
import { rand } from './utils.js';

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

// ── Init ──────────────────────────────────────────────────────────────────────
const container = document.getElementById('app');
const renderer  = new Renderer(container);
const pool      = new ParticlePool(30000);

renderer.scene.add(pool.points);

const fireworks = [];

// ── Launch helper ─────────────────────────────────────────────────────────────

function launch(ex, ez) {
  if (pool.freeCount < 400) return;
  fireworks.push(new Firework(pool, ex, ez));
}

// ── Input — click / touch ─────────────────────────────────────────────────────

function ndcFromEvent(e) {
  const rect = container.getBoundingClientRect();
  return new THREE.Vector2(
    ((e.clientX - rect.left) / rect.width)  * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1
  );
}

container.addEventListener('click', e => {
  const ndc = ndcFromEvent(e);
  const pos = renderer.screenToWorld(ndc.x, ndc.y);
  if (pos) launch(pos.x, pos.z);
});

container.addEventListener('touchend', e => {
  e.preventDefault();
  const t   = e.changedTouches[0];
  const ndc = ndcFromEvent(t);
  const pos = renderer.screenToWorld(ndc.x, ndc.y);
  if (pos) launch(pos.x, pos.z);
}, { passive: false });

// ── Demo fireworks — fire immediately on load ─────────────────────────────────

function demoSalvo() {
  // Five evenly-spaced bursts across the visible area.
  const count = 5;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const dist  = rand(350, 900);
    launch(Math.cos(angle) * dist, Math.sin(angle) * dist);
  }
}
demoSalvo();

// ── Auto-ambient fireworks ────────────────────────────────────────────────────

let _autoTimer = rand(3, 6); // seconds until next auto burst

function autoFire() {
  const angle = Math.random() * Math.PI * 2;
  const dist  = rand(200, 1200);
  launch(Math.cos(angle) * dist, Math.sin(angle) * dist);
  _autoTimer = rand(3, 8);
}

// ── Animation loop ────────────────────────────────────────────────────────────

let _last = -1;

function animate(tsMs) {
  requestAnimationFrame(animate);

  const t  = tsMs * 0.001;
  const dt = _last < 0 ? 0.016 : Math.min(t - _last, 0.05);
  _last = t;

  _autoTimer -= dt;
  if (_autoTimer <= 0) autoFire();

  pool.setCanvasHeight(renderer.canvasHeight);

  for (let i = fireworks.length - 1; i >= 0; i--) {
    fireworks[i].update(dt);
    if (fireworks[i].done) fireworks.splice(i, 1);
  }

  pool.update(dt);
  renderer.render();
}

requestAnimationFrame(animate);
