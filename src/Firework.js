/**
 * Firework — top-down view lifecycle.
 *
 * No launch phase. Explosion is instantaneous at the 3D position passed in.
 * Click position maps directly to burst center via altitude-plane raycast,
 * so fireworks appear exactly where the user taps.
 *
 * From overhead the explosion appears as:
 *   • A bright central flash
 *   • Particles spreading outward in XZ (horizontal) — creates the ring/dome shape
 *   • Particles with positive VY briefly rise toward the camera (brighter, larger)
 *     then gravity pulls them downward (away from camera) — they dim and vanish
 *   • This depth variation gives the volumetric dome appearance
 */

import { rand, hexToRgb, randSphereDir, clamp } from './utils.js';

export class Firework {
  /**
   * @param {import('./ParticlePool.js').ParticlePool} pool
   * @param {object} params   Output of FireworkGen.generate()
   * @param {number} ex       Explosion center X (world)
   * @param {number} ey       Explosion center Y (altitude)
   * @param {number} ez       Explosion center Z (world)
   */
  constructor(pool, params, ex, ey, ez) {
    this.pool   = pool;
    this.params = params;
    this.done   = false;

    this._cx = ex;
    this._cy = ey + (params.depthOffset ?? 0);
    this._cz = ez;

    this._secTimer   = 0;
    this._secPending = params.hasSecondary;

    // Immediate explosion — no launch phase for top-down view
    this._spawnFlash(this._cx, this._cy, this._cz);
    this._spawnBurst(this._cx, this._cy, this._cz, 1.0);
  }

  update(dt) {
    if (this.done) return;

    if (!this._secPending) {
      this.done = true;
      return;
    }

    this._secTimer += dt;
    if (this._secTimer >= this.params.secondaryDelay) {
      this._fireSecondary();
      this._secPending = false;
    }
  }

  // ── Flash ───────────────────────────────────────────────────────────────────
  // White-hot central burst — very short lived, creates the "ignition" moment.

  _spawnFlash(cx, cy, cz) {
    const n = 35;
    const slots = this.pool.allocate(n);
    if (!slots) return;

    for (let i = 0; i < n; i++) {
      const s   = slots[i];
      const spd = rand(30, 220);
      // Flash spreads mostly horizontal with some vertical — from above looks
      // like a sudden circular bloom at the tap location.
      const angle = Math.random() * Math.PI * 2;
      const vert  = rand(-0.3, 0.5);
      const hSpd  = spd * Math.sqrt(1 - vert * vert);
      this.pool.spawn(
        s,
        cx + rand(-4, 4), cy + rand(-4, 4), cz + rand(-4, 4),
        Math.cos(angle) * hSpd, vert * spd, Math.sin(angle) * hSpd,
        1.0, 0.97, 0.85,        // near-white hot
        rand(8, 20),
        rand(0.12, 0.35),
        0.84, 22, rand(0.4, 1.0)
      );
    }
  }

  // ── Secondary ──────────────────────────────────────────────────────────────

  _fireSecondary() {
    const p     = this.params;
    const count = p.secondaryCount;
    const r     = p.baseRadius * 0.5;
    for (let s = 0; s < count; s++) {
      const sx = this._cx + rand(-r, r);
      const sy = this._cy + rand(-100, 60);
      const sz = this._cz + rand(-r, r);
      this._spawnBurst(sx, sy, sz, 0.20);
    }
  }

  // ── Main burst ─────────────────────────────────────────────────────────────

  _spawnBurst(cx, cy, cz, scale) {
    const p   = this.params;
    const cnt = Math.floor(p.particleCount * scale);
    const slots = this.pool.allocate(cnt);
    if (!slots) return;

    const colors = p.palette.colors;

    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];

      const colorHex    = colors[i % colors.length];
      const [cr, cg, cb] = hexToRgb(colorHex);
      const bv          = p.brightness * rand(0.72, 1.0);

      const speedMult = Math.pow(Math.random(), 1.0 / Math.max(p.velocityPower, 0.1));
      const spd       = p.baseRadius * rand(0.50, 1.0) * speedMult * scale;

      let vx, vy, vz;

      // ── Shape: top-down velocity distributions ───────────────────────────
      // Key invariant: VX and VZ carry most of the energy (horizontal spread).
      // VY is small — some positive (toward camera → brighter/closer initially),
      // some negative (away from camera → dimmer, fall faster out of view).
      // Gravity then pulls everything down over time.

      switch (p.shape) {

        case 'dome': {
          // Hemisphere biased upward toward observer — creates expanding disc
          // with a bright central crown from above.
          const angle = Math.random() * Math.PI * 2;
          const r     = Math.pow(Math.random(), 0.55); // bias toward outer ring
          vx = Math.cos(angle) * spd * r;
          vz = Math.sin(angle) * spd * r;
          // Vertical: upward bias so dome "rises" toward camera then falls back
          vy = (p.verticalBias + rand(-0.18, 0.25)) * spd;
          break;
        }

        case 'ring': {
          // Perfect flat ring — from above reads as a clean expanding circle.
          const angle = (i / cnt) * Math.PI * 2 + rand(-0.18, 0.18);
          vx = Math.cos(angle) * spd;
          vz = Math.sin(angle) * spd;
          vy = rand(-0.08, 0.08) * spd; // almost flat
          break;
        }

        case 'jellyfish': {
          // Center particles rise toward camera (bright crown),
          // edge particles fall away (drooping tentacles from above).
          const angle = Math.random() * Math.PI * 2;
          const r     = Math.pow(Math.random(), 0.6);
          vx = Math.cos(angle) * spd * r;
          vz = Math.sin(angle) * spd * r;
          // Inner particles (small r) go UP, outer particles (large r) go DOWN
          vy = (0.45 - r * 0.9) * spd;
          break;
        }

        case 'starburst': {
          // N arms — from above creates a symmetrical star pattern.
          const armCount = Math.floor(rand(5, 9));
          const arm  = i % armCount;
          const a    = (arm / armCount) * Math.PI * 2 + rand(-0.06, 0.06);
          const r    = Math.pow(Math.random(), 0.75);
          vx = Math.cos(a) * spd * r;
          vz = Math.sin(a) * spd * r;
          vy = (p.verticalBias + rand(-0.12, 0.20)) * spd;
          break;
        }

        case 'comet': {
          // One dominant horizontal direction — asymmetric teardrop from above.
          const mainAngle = p.asymmetryDir; // reuse asymmetry direction as comet heading
          const spread    = rand(0.15, 0.55);
          const jitter    = rand(-spread, spread);
          vx = (Math.cos(mainAngle) + jitter * Math.sin(mainAngle)) * spd;
          vz = (Math.sin(mainAngle) - jitter * Math.cos(mainAngle)) * spd;
          vy = rand(-0.2, 0.3) * spd;
          break;
        }

        case 'peony': {
          // Dense sphere — from above shows as filled bright disc that dims outward.
          const angle = Math.random() * Math.PI * 2;
          const r     = Math.cbrt(Math.random()); // uniform sphere volume
          const phi   = Math.acos(2 * Math.random() - 1);
          vx = Math.sin(phi) * Math.cos(angle) * spd * r;
          vz = Math.sin(phi) * Math.sin(angle) * spd * r;
          vy = Math.cos(phi) * spd * r * 0.6; // compressed vertically
          break;
        }

        default: {
          const angle = Math.random() * Math.PI * 2;
          const r     = Math.random();
          vx = Math.cos(angle) * spd * r;
          vz = Math.sin(angle) * spd * r;
          vy = rand(-0.15, 0.25) * spd;
        }
      }

      // ── Horizontal asymmetry ───────────────────────────────────────────────
      if (p.asymmetry > 0.04 && p.shape !== 'comet') {
        const ax = Math.cos(p.asymmetryDir) * p.asymmetry;
        const az = Math.sin(p.asymmetryDir) * p.asymmetry;
        vx *= (1 + ax);
        vz *= (1 + az);
      }

      // ── Depth start position ───────────────────────────────────────────────
      // Particles with positive VY are slightly higher at birth —
      // this creates the 3D dome look even in the first frame.
      const depthStart = vy > 0 ? vy * rand(0.05, 0.25) : 0;

      const mass     = p.mass * rand(0.5, 1.6);
      const lifetime = p.sparkLifetime * rand(0.65, 1.4);
      const size     = p.sparkSizeBase * rand(0.5, 2.4);

      this.pool.spawn(
        s,
        cx, cy + depthStart, cz,
        vx, vy, vz,
        cr * bv, cg * bv, cb * bv,
        size, lifetime,
        p.drag, p.gravity, mass,
        p.hasFlicker, p.flickerRate
      );
    }
  }
}
