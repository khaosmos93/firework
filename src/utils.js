// Random helpers used across the simulator

export function rand(min, max) {
  return min + Math.random() * (max - min);
}

export function randInt(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

// Gaussian approximation (sum of 6 uniforms → mean≈0, std≈1)
export function randGaussian(mean = 0, std = 1) {
  let s = 0;
  for (let i = 0; i < 6; i++) s += Math.random();
  return mean + (s - 3) * std;
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Weighted random: options = [{ weight: Number, value: any }]
export function weightedPick(options) {
  let total = 0;
  for (const o of options) total += o.weight;
  let r = Math.random() * total;
  for (const o of options) {
    r -= o.weight;
    if (r <= 0) return o.value;
  }
  return options[options.length - 1].value;
}

// Parse '#rrggbb' → [r, g, b] in 0-1
export function hexToRgb(hex) {
  const v = parseInt(hex.replace('#', ''), 16);
  return [(v >> 16 & 255) / 255, (v >> 8 & 255) / 255, (v & 255) / 255];
}

// Uniformly random point on unit sphere surface
export function randSphereDir() {
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(2 * Math.random() - 1);
  const sp = Math.sin(phi);
  return [sp * Math.cos(theta), Math.cos(phi), sp * Math.sin(theta)];
}

// Shuffle array in-place (Fisher-Yates)
export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}
