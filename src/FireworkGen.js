/**
 * FireworkGen — procedural parameter generator for top-down view.
 *
 * Shapes are designed for overhead observation:
 *   dome       — hemisphere spreading outward horizontally (classic from above)
 *   ring       — flat expanding ring
 *   jellyfish  — rising crown + drooping edges, reads as volumetric dome
 *   starburst  — N arms radiating outward
 *   comet      — directional asymmetric burst
 *   peony      — dense sphere; from above looks like a glowing filled circle
 */

import { rand, randInt, weightedPick } from './utils.js';

const PALETTES = [
  { weight: 36, name: 'gold',       colors: ['#FFE060', '#FFB020', '#FF8800'], core: '#FFFFFF' },
  { weight: 22, name: 'crimson',    colors: ['#FF5050', '#FF1A1A', '#CC0000'], core: '#FFD8D0' },
  { weight: 13, name: 'silver',     colors: ['#FFFFFF', '#C8D8FF', '#9AB0FF'], core: '#FFFFFF' },
  { weight: 10, name: 'cyan',       colors: ['#30FFFF', '#00CCFF', '#0088CC'], core: '#DFFFFF' },
  { weight: 8,  name: 'purple',     colors: ['#CC44FF', '#9900EE', '#6600BB'], core: '#F0D8FF' },
  { weight: 6,  name: 'emerald',    colors: ['#44FF80', '#00EE44', '#00AA33'], core: '#D8FFE8' },
  { weight: 5,  name: 'multicolor', colors: ['#FF5050', '#FFD020', '#44FF80', '#30FFFF', '#CC44FF'], core: '#FFFFFF' },
];

// Top-down burst shapes
const SHAPES = [
  { weight: 30, name: 'dome' },       // hemisphere viewed from above → expanding disc
  { weight: 22, name: 'ring' },       // flat ring
  { weight: 16, name: 'jellyfish' },  // rising crown — deep dome from above
  { weight: 14, name: 'starburst' },  // N-arm radial star
  { weight: 12, name: 'comet' },      // one dominant direction
  { weight: 6,  name: 'peony' },      // dense filled sphere
];

export class FireworkGen {
  generate(overrides = {}) {
    const palette = weightedPick(PALETTES.map(p => ({ weight: p.weight, value: p })));
    const shape   = weightedPick(SHAPES.map(s => ({ weight: s.weight, value: s.name })));

    const isMassive = Math.random() < 0.05;
    const isDense   = !isMassive && Math.random() < 0.10;
    const isSoft    = !isMassive && !isDense && Math.random() < 0.08;

    // baseRadius controls how far particles fly horizontally
    const baseRadius = isMassive ? rand(420, 680)
                     : isSoft    ? rand(90, 200)
                     : rand(160, 380);

    const particleCount = isMassive ? randInt(1200, 2000)
                        : isDense   ? randInt(800, 1200)
                        : isSoft    ? randInt(80, 250)
                        : randInt(300, 800);

    // How far below the camera the explosion sits (varies depth reading)
    const depthOffset = rand(-120, 180);

    const gravity     = rand(18, 55);
    const drag        = rand(0.88, 0.975);
    const mass        = rand(0.6, 1.6);

    const brightness     = isSoft ? rand(0.35, 0.65) : rand(0.7, 1.0);
    const trailIntensity = rand(0.2, 0.85);

    const sparkLifetime = isMassive ? rand(2.5, 5.5)
                        : isSoft    ? rand(0.9, 2.2)
                        : rand(1.5, 4.2);
    const sparkSizeBase = isMassive ? rand(10, 20) : isSoft ? rand(4, 9) : rand(5, 14);

    const hasFlicker  = Math.random() < 0.45;
    const flickerRate = rand(4, 20);

    // Horizontal asymmetry (XZ plane skew)
    const asymmetry    = rand(0, 0.45);
    const asymmetryDir = Math.random() * Math.PI * 2;

    const hasSecondary   = Math.random() < 0.25;
    const secondaryDelay = rand(0.2, 0.75);
    const secondaryCount = randInt(2, 5);

    const velocityPower = rand(0.7, 2.8);
    const smokeAmount   = rand(0, 0.55);

    // Vertical bias: how much velocity goes up (toward camera) vs down (away)
    // Positive = particles rise toward observer → appear as bright inner dome
    const verticalBias = rand(-0.15, 0.40);

    return {
      palette,
      shape,
      isMassive,
      isDense,
      isSoft,
      baseRadius,
      particleCount,
      depthOffset,
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
      verticalBias,
      ...overrides,
    };
  }
}
