/**
 * Firework — top-down view lifecycle.
 *
 * States:
 *   LAUNCH  — a single bright shell particle rises from y=0 upward.
 *             From directly above it appears as a growing dot.
 *   EXPLODE — shell reaches EXPLOSION_ALTITUDE; burst of radial particles.
 *             From above: expanding ring / disk of colored sparks.
 *   DONE    — all done; remove from list.
 *
 * Physics:
 *   - Particles spread radially in XZ (horizontal plane = what camera sees).
 *   - Small random VY gives slight depth, making the burst feel volumetric.
 *   - Gravity pulls VY negative (sparks fall away from camera / fade below).
 *   - Exponential drag slows everything down.
 *   - Fade controlled by age/lifetime.
 */

import { rand } from './utils.js';
import { EXPLOSION_ALTITUDE } from './Renderer.js';

// Vivid palette — each entry is [r, g, b] in 0-1.
const COLORS = [
  [1.0, 0.88, 0.10],  // gold
  [1.0, 0.32, 0.08],  // orange
  [1.0, 0.08, 0.25],  // crimson
  [0.25, 0.65, 1.0],  // sky blue
  [0.15, 1.0,  0.45], // green
  [0.85, 0.15, 1.0],  // violet
  [0.10, 1.0,  1.0],  // cyan
  [1.0,  1.0,  1.0],  // white / silver
  [1.0,  0.55, 0.90], // pink
];

export class Firework {
  /**
   * @param {import('./ParticlePool.js').ParticlePool} pool
   * @param {number} ex  Explosion center X (world)
   * @param {number} ez  Explosion center Z (world)
   */
  constructor(pool, ex, ez) {
    this.pool = pool;
    this.done = false;

    this._ex = ex;
    this._ez = ez;

    // Randomize per-firework parameters.
    this._color     = COLORS[Math.floor(Math.random() * COLORS.length)];
    this._count     = Math.floor(rand(80, 320));
    this._speed     = rand(180, 580);
    this._gravity   = rand(80, 320);
    this._drag      = rand(0.91, 0.975);
    this._lifetime  = rand(1.6, 4.2);
    this._size      = rand(10, 30);
    this._asymmetry = rand(0, 0.55);   // horizontal skew
    this._asymDir   = Math.random() * Math.PI * 2;

    // Launch: shell rises from y=0 to EXPLOSION_ALTITUDE.
    this._shellVY   = rand(2800, 4200); // units/s upward
    this._state     = 'launch';
    this._shellSlot = null;
    this._spawnShell();
  }

  // ── Shell ───────────────────────────────────────────────────────────────────

  _spawnShell() {
    const slots = this.pool.allocate(1);
    if (!slots) {
      // No room — skip straight to explosion.
      this._state = 'explode';
      this._explode();
      return;
    }

    this._shellSlot = slots[0];
    const [r, g, b] = this._color;

    // Give the shell enough lifetime to always reach EXPLOSION_ALTITUDE.
    const travelTime = EXPLOSION_ALTITUDE / this._shellVY;

    this.pool.spawn(
      this._shellSlot,
      this._ex, 0, this._ez,
      0, this._shellVY, 0,
      r, g, b,
      28,              // size — shell is visibly bright dot rising toward camera
      travelTime * 2,  // lifetime: 2× travel time as safety margin
      0.999,           // almost no drag
      0                // no gravity on shell
    );
  }

  // ── Update ──────────────────────────────────────────────────────────────────

  update(dt) {
    if (this.done) return;

    if (this._state === 'launch') {
      if (this._shellSlot === null) {
        // Shell was never allocated — shouldn't happen, but safe fallback.
        this._state = 'explode';
        this._explode();
        return;
      }

      // Read shell's current y from the pool buffer (updated by pool.update).
      const shellY = this.pool.pos[this._shellSlot * 3 + 1];

      if (shellY >= EXPLOSION_ALTITUDE) {
        // Release shell particle and trigger explosion.
        this.pool.release(this._shellSlot);
        this._shellSlot = null;
        this._state = 'explode';
        this._explode();
      }
    } else {
      this.done = true;
    }
  }

  // ── Explosion ───────────────────────────────────────────────────────────────

  _explode() {
    this._spawnBurst();
    this._spawnFlash();
  }

  _spawnBurst() {
    const slots = this.pool.allocate(this._count);
    if (!slots) return;

    const [r, g, b] = this._color;
    const ax = Math.cos(this._asymDir) * this._asymmetry;
    const az = Math.sin(this._asymDir) * this._asymmetry;

    for (let i = 0; i < slots.length; i++) {
      const s     = slots[i];
      const angle = Math.random() * Math.PI * 2;
      // Radial speed — bias toward full speed (pow < 1) for dense outer ring.
      const spd   = this._speed * Math.pow(Math.random(), 0.6) * rand(0.5, 1.0);

      // XZ = radial spread (visible from above), VY = small vertical component.
      const vx = Math.cos(angle) * spd * (1 + ax);
      const vz = Math.sin(angle) * spd * (1 + az);
      const vy = rand(-0.25, 0.30) * spd;

      this.pool.spawn(
        s,
        this._ex, EXPLOSION_ALTITUDE, this._ez,
        vx, vy, vz,
        r, g, b,
        this._size * rand(0.5, 1.8),
        this._lifetime * rand(0.65, 1.35),
        this._drag,
        this._gravity
      );
    }
  }

  // Bright white/yellow central flash — very short-lived, gives the "pop".
  _spawnFlash() {
    const n = 24;
    const slots = this.pool.allocate(n);
    if (!slots) return;

    for (let i = 0; i < n; i++) {
      const s     = slots[i];
      const angle = Math.random() * Math.PI * 2;
      const spd   = rand(60, 240);
      this.pool.spawn(
        s,
        this._ex, EXPLOSION_ALTITUDE, this._ez,
        Math.cos(angle) * spd, rand(-0.4, 0.4) * spd, Math.sin(angle) * spd,
        1.0, 0.98, 0.85,  // near-white
        42,
        rand(0.08, 0.22),
        0.88,
        0
      );
    }
  }
}
