/**
 * FireworkGen — procedural parameter generator.
 *
 * Called once per user click (and for auto-horizon bursts).
 * All visual variation flows from these randomized params; the rest of the
 * sim is deterministic given them.
 */

import { rand, randInt, randGaussian, weightedPick, clamp } from './utils.js';

// ─── Color Palettes ──────────────────────────────────────────────────────────
// weight = relative frequency, colors = hot→cool spark colors, core = initial burst core
const PALETTES = [
  {
    weight: 38,
    name: 'gold',
    colors: ['#FFE066', '#FFB830', '#FF8C00'],
    core: '#FFFFFF',
  },
  {
    weight: 24,
    name: 'crimson',
    colors: ['#FF6060', '#FF2020', '#CC0000'],
    core: '#FFE0D0',
  },
  {
    weight: 14,
    name: 'silver',
    colors: ['#FFFFFF', '#D0D8FF', '#A0B0FF'],
    core: '#FFFFFF',
  },
  {
    weight: 9,
    name: 'cyan',
    colors: ['#40FFFF', '#00E5FF', '#0090CC'],
    core: '#E0FFFF',
  },
  {
    weight: 7,
    name: 'purple',
    colors: ['#DD55FF', '#AA00FF', '#7700CC'],
    core: '#F0E0FF',
  },
  {
    weight: 5,
    name: 'emerald',
    colors: ['#55FF88', '#00FF44', '#00BB33'],
    core: '#E0FFE8',
  },
  {
    weight: 3,
    name: 'multicolor',
    colors: ['#FF5555', '#FFD700', '#55FF88', '#40FFFF', '#CC55FF'],
    core: '#FFFFFF',
  },
];

// ─── Burst Shapes ────────────────────────────────────────────────────────────
const SHAPES = [
  { weight: 32, name: 'sphere' },
  { weight: 20, name: 'ring' },
  { weight: 15, name: 'glitter' },
  { weight: 14, name: 'willow' },
  { weight: 12, name: 'comet' },
  { weight: 7,  name: 'cross' },
];

// ─── Generator ───────────────────────────────────────────────────────────────
export class FireworkGen {
  generate(overrides = {}) {
    const palette = weightedPick(PALETTES.map(p => ({ weight: p.weight, value: p })));
    const shape   = weightedPick(SHAPES.map(s => ({ weight: s.weight, value: s.name })));

    const isMassive = Math.random() < 0.05;
    const isDense   = !isMassive && Math.random() < 0.12;
    const isSoft    = !isMassive && !isDense && Math.random() < 0.08;

    const baseRadius    = isMassive ? rand(380, 600) : isSoft ? rand(80, 180) : rand(150, 340);
    const particleCount = isMassive ? randInt(1100, 1800)
                        : isDense   ? randInt(700, 1100)
                        : isSoft    ? randInt(100, 260)
                        : randInt(280, 750);

    const apexHeight = isMassive ? rand(400, 650)
                     : isSoft    ? rand(150, 320)
                     : rand(220, 520);

    const launchSpeed   = rand(280, 560);   // world units / second
    const launchWobble  = rand(0.015, 0.09);

    const gravity       = rand(20, 55);
    const drag          = rand(0.90, 0.975);
    const mass          = rand(0.6, 1.5);

    const brightness     = isSoft ? rand(0.35, 0.65) : rand(0.65, 1.0);
    const trailIntensity = rand(0.25, 0.85);

    const sparkLifetime  = isMassive ? rand(2.5, 5.0)
                         : isSoft    ? rand(1.0, 2.5)
                         : rand(1.4, 4.0);
    const sparkSizeBase  = isMassive ? rand(8, 16) : isSoft ? rand(3, 8) : rand(4, 12);

    const hasFlicker  = Math.random() < 0.42;
    const flickerRate = rand(4, 18);

    const asymmetry    = rand(0, 0.4);
    const asymmetryDir = Math.random() * Math.PI * 2;

    const hasSecondary    = Math.random() < 0.22;
    const secondaryDelay  = rand(0.25, 0.75);
    const secondaryCount  = randInt(2, 5);

    const velocityPower   = rand(0.7, 2.8); // 1=uniform, >1=concentrated center
    const smokeAmount     = rand(0, 0.5);

    return {
      palette,
      shape,
      isMassive,
      isDense,
      isSoft,
      baseRadius,
      particleCount,
      apexHeight,
      launchSpeed,
      launchWobble,
      gravity,
      drag,
      mass,
      brightness,
      trailIntensity,
      sparkLifetime,
      sparkSizeBase,
      hasFlicker,
      flickerRate,
      asymmetry,
      asymmetryDir,
      hasSecondary,
      secondaryDelay,
      secondaryCount,
      velocityPower,
      smokeAmount,
      ...overrides,
    };
  }
}
