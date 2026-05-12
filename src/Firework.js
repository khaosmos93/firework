/**
 * Firework — lifecycle manager for a single firework event.
 *
 * Phases:
 *   LAUNCH  → rocket ascends from ground, leaving a glowing trail
 *   BURST   → main explosion spawns particle burst at apex
 *   SECONDARY (optional) → delayed sub-bursts after main explosion
 *   DONE    → all spawning finished; particles live on in the pool
 */

import { rand, hexToRgb, randSphereDir, weightedPick, clamp } from './utils.js';

const PHASE = { LAUNCH: 0, BURST: 1, SECONDARY: 2, DONE: 3 };

export class Firework {
  /**
   * @param {import('./ParticlePool.js').ParticlePool} pool
   * @param {object} params  Output from FireworkGen.generate()
   * @param {number} gx      Ground X (world units)
   * @param {number} gz      Ground Z (world units)
   */
  constructor(pool, params, gx, gz) {
    this.pool   = pool;
    this.params = params;
    this.done   = false;
    this._phase = PHASE.LAUNCH;

    // Rocket position
    this.rx = gx + rand(-8, 8);
    this.ry = 2;
    this.rz = gz + rand(-8, 8);

    // Apex (explosion point) — random offset above launch
    this.ax = gx + rand(-40, 40);
    this.ay = params.apexHeight;
    this.az = gz + rand(-40, 40);

    // Rocket velocity (starts directed at apex with wobble)
    this._rVX = rand(-params.launchWobble, params.launchWobble) * params.launchSpeed * 0.1;
    this._rVZ = rand(-params.launchWobble, params.launchWobble) * params.launchSpeed * 0.1;

    this._rocketSlot = -1;
    this._trailTimer = 0;
    this._trailInterval = 1 / 35;

    this._secTimer   = 0;
    this._secPending = params.hasSecondary;

    this._spawnLaunchFlash(gx, gz);
    this._spawnRocket();
  }

  // ── Public ────────────────────────────────────────────────────────────────

  update(dt, time) {
    if (this.done) return;
    switch (this._phase) {
      case PHASE.LAUNCH:    this._updateLaunch(dt, time);    break;
      case PHASE.SECONDARY: this._updateSecondary(dt);       break;
    }
  }

  // ── Launch ─────────────────────────────────────────────────────────────────

  _updateLaunch(dt, time) {
    const dx = this.ax - this.rx;
    const dy = this.ay - this.ry;
    const dz = this.az - this.rz;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (dist < 6) {
      this._finishLaunch();
      return;
    }

    const step = Math.min(this.params.launchSpeed * dt, dist);
    const inv  = step / dist;
    this.rx += dx * inv;
    this.ry += dy * inv;
    this.rz += dz * inv;

    // Lateral wobble
    const wobble = this.params.launchWobble * 12;
    this.rx += rand(-wobble, wobble) * dt;
    this.rz += rand(-wobble, wobble) * dt;

    this._updateRocketParticle(time);

    this._trailTimer += dt;
    if (this._trailTimer >= this._trailInterval) {
      this._trailTimer = 0;
      this._spawnTrail();
    }
  }

  _finishLaunch() {
    // Kill rocket visual
    if (this._rocketSlot >= 0) {
      this.pool._release(this._rocketSlot);
      this._rocketSlot = -1;
    }
    this._spawnExplosionFlash(this.rx, this.ry, this.rz);
    this._spawnBurst(this.rx, this.ry, this.rz, 1.0);
    this._phase = PHASE.SECONDARY;
  }

  // ── Secondary ──────────────────────────────────────────────────────────────

  _updateSecondary(dt) {
    if (!this._secPending) {
      this.done = true;
      this._phase = PHASE.DONE;
      return;
    }
    this._secTimer += dt;
    if (this._secTimer >= this.params.secondaryDelay) {
      this._secPending = false;
      const count = this.params.secondaryCount;
      const r     = this.params.baseRadius * 0.55;
      for (let s = 0; s < count; s++) {
        const sx = this.ax + rand(-r, r);
        const sy = this.ay + rand(-80, 30);
        const sz = this.az + rand(-r, r);
        this._spawnBurst(sx, sy, sz, 0.22);
      }
    }
  }

  // ── Spawn helpers ──────────────────────────────────────────────────────────

  _spawnLaunchFlash(gx, gz) {
    const n = 24;
    const slots = this.pool.allocate(n);
    if (!slots) return;
    const [r, g, b] = hexToRgb('#FFD060');
    for (let i = 0; i < n; i++) {
      const s = slots[i];
      const angle = Math.random() * Math.PI * 2;
      const spd   = rand(20, 80);
      this.pool.spawn(
        s,
        gx + rand(-6, 6), 4, gz + rand(-6, 6),
        Math.cos(angle) * spd, rand(10, 60), Math.sin(angle) * spd,
        r, g, b,
        rand(4, 10),
        rand(0.2, 0.5),
        0.82, 30, rand(0.8, 1.2)
      );
    }
  }

  _spawnRocket() {
    const slots = this.pool.allocate(1);
    if (!slots) return;
    this._rocketSlot = slots[0];
    const [r, g, b] = hexToRgb('#FFE888');
    this.pool.spawn(
      this._rocketSlot,
      this.rx, this.ry, this.rz,
      0, 0, 0,
      r * this.params.brightness,
      g * this.params.brightness,
      b * this.params.brightness,
      this.params.sparkSizeBase * 1.8,
      9999,           // manually released — never expires naturally
      1.0, 0, 1.0
    );
    // Keep alive permanently (until _finishLaunch releases it)
    this.pool.alive[this._rocketSlot] = 1;
    this.pool.age[this._rocketSlot]   = 0;
  }

  _updateRocketParticle(time) {
    const s = this._rocketSlot;
    if (s < 0) return;
    const p = this.params;
    const pulse = 0.82 + 0.18 * Math.sin(time * 18);
    const [r, g, b] = hexToRgb('#FFE888');
    this.pool.pos[s * 3]     = this.rx;
    this.pool.pos[s * 3 + 1] = this.ry;
    this.pool.pos[s * 3 + 2] = this.rz;
    this.pool.col[s * 3]     = r * pulse * p.brightness;
    this.pool.col[s * 3 + 1] = g * pulse * p.brightness;
    this.pool.col[s * 3 + 2] = b * pulse * p.brightness;
    this.pool.sizes[s]  = p.sparkSizeBase * 1.5 * pulse;
    this.pool.alpha[s]  = 1.0;
    // Reset age so it never expires
    this.pool.age[s] = 0;
  }

  _spawnTrail() {
    const n = Math.floor(rand(3, 7));
    const slots = this.pool.allocate(n);
    if (!slots) return;
    const p = this.params;
    const [r, g, b] = hexToRgb('#FF9920');
    for (let i = 0; i < n; i++) {
      const s = slots[i];
      const br = p.trailIntensity * rand(0.3, 0.9);
      const sp = rand(8, 30);
      const angle = Math.random() * Math.PI * 2;
      this.pool.spawn(
        s,
        this.rx + rand(-5, 5), this.ry + rand(-3, 3), this.rz + rand(-5, 5),
        Math.cos(angle) * sp * 0.4, rand(-40, -12), Math.sin(angle) * sp * 0.4,
        r * br, g * br, b * br,
        rand(2, 6),
        rand(0.25, 0.65),
        0.88, 25, rand(0.8, 1.3)
      );
    }
  }

  _spawnExplosionFlash(cx, cy, cz) {
    // Bright burst of white-hot sparks at explosion center
    const n = 30;
    const slots = this.pool.allocate(n);
    if (!slots) return;
    const [r, g, b] = [1.0, 1.0, 0.92];
    for (let i = 0; i < n; i++) {
      const s = slots[i];
      const spd = rand(40, 180);
      const [dx, dy, dz] = randSphereDir();
      this.pool.spawn(
        s,
        cx, cy, cz,
        dx * spd, dy * spd, dz * spd,
        r, g, b,
        rand(6, 14),
        rand(0.15, 0.4),
        0.87, 20, rand(0.5, 1.0)
      );
    }
  }

  _spawnBurst(cx, cy, cz, scale) {
    const p   = this.params;
    const cnt = Math.floor(p.particleCount * scale);
    const slots = this.pool.allocate(cnt);
    if (!slots) return;

    const colors = p.palette.colors;
    const coreHex = p.palette.core;
    const [coreR, coreG, coreB] = hexToRgb(coreHex);

    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];

      // Pick palette color (cycle + slight randomization)
      const colorHex = colors[i % colors.length];
      const [cr, cg, cb] = hexToRgb(colorHex);

      const bv = p.brightness * rand(0.72, 1.0);

      // ── Velocity by shape ────────────────────────────────────────────────
      const speedMult = Math.pow(Math.random(), 1.0 / Math.max(p.velocityPower, 0.1));
      const spd = p.baseRadius * rand(0.55, 1.0) * speedMult * scale;

      let vx, vy, vz;

      switch (p.shape) {
        case 'sphere': {
          const [dx, dy, dz] = randSphereDir();
          vx = dx * spd; vy = dy * spd; vz = dz * spd;
          break;
        }
        case 'ring': {
          const a = (i / cnt) * Math.PI * 2 + rand(-0.25, 0.25);
          vx = Math.cos(a) * spd;
          vy = rand(-0.12, 0.12) * spd;
          vz = Math.sin(a) * spd;
          break;
        }
        case 'glitter': {
          const [dx, dy, dz] = randSphereDir();
          const g = Math.random();
          vx = dx * spd * g; vy = dy * spd * g; vz = dz * spd * g;
          break;
        }
        case 'willow': {
          const a = Math.random() * Math.PI * 2;
          const up = rand(0.15, 0.85);
          vx = Math.cos(a) * spd * rand(0.3, 1.0);
          vy = up * spd;
          vz = Math.sin(a) * spd * rand(0.3, 1.0);
          break;
        }
        case 'comet': {
          const a = rand(0, Math.PI * 2);
          const spread = rand(0, 0.5);
          vx = (Math.cos(a) + rand(-spread, spread)) * spd;
          vy = rand(-0.25, 0.6) * spd;
          vz = (Math.sin(a) + rand(-spread, spread)) * spd;
          break;
        }
        case 'cross': {
          const arm = i % 4;
          const a   = (arm / 4) * Math.PI * 2 + rand(-0.08, 0.08);
          vx = Math.cos(a) * spd;
          vy = rand(-0.18, 0.18) * spd;
          vz = Math.sin(a) * spd;
          break;
        }
        default: {
          const [dx, dy, dz] = randSphereDir();
          vx = dx * spd; vy = dy * spd; vz = dz * spd;
        }
      }

      // ── Asymmetry ─────────────────────────────────────────────────────────
      if (p.asymmetry > 0.02) {
        const ax = Math.cos(p.asymmetryDir) * p.asymmetry;
        const az = Math.sin(p.asymmetryDir) * p.asymmetry;
        vx *= (1 + ax);
        vz *= (1 + az);
      }

      const mass     = p.mass * rand(0.5, 1.5);
      const lifetime = p.sparkLifetime * rand(0.65, 1.35);
      const size     = p.sparkSizeBase * rand(0.5, 2.2);

      this.pool.spawn(
        s, cx, cy, cz,
        vx, vy, vz,
        cr * bv, cg * bv, cb * bv,
        size, lifetime,
        p.drag, p.gravity, mass,
        p.hasFlicker, p.flickerRate
      );
    }
  }
}
