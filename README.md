# Airplane View Fireworks Simulator

A cinematic, fullscreen WebGL experience: you are seated inside a commercial airplane at night, looking diagonally downward through the window at fireworks bursting far below.

**Click or tap anywhere** to launch a firework toward the ground. Everything else — color palette, burst shape, particle count, physics, timing, secondary explosions — is randomized automatically.

---

## Experience

- **Perspective**: camera positioned ~2 000 units high, angled ~32° below horizontal — airplane-window view looking diagonally down at the ground.
- **City lights**: ~22 000 warm procedural dots at ground level (sodium-vapor yellows, LED whites, industrial blues).
- **Atmospheric fog**: subtle exponential fog adds depth and distance haze.
- **Airplane vibration**: multi-frequency sinusoidal camera translation mimics turbulence.
- **Auto ambient fireworks**: occasional distant bursts fire automatically on the horizon.
- **Window vignette**: CSS radial gradient + faint frame overlay for immersion.
- **Bloom**: UnrealBloomPass postprocessing via Three.js.

## Firework variety

Every click produces randomized parameters across 20+ axes:

| Axis | Range |
|------|-------|
| Color palette | Gold (38%), Crimson (24%), Silver (14%), Cyan (9%), Purple (7%), Emerald (5%), Multicolor (3%) |
| Burst shape | Sphere, ring, glitter, willow, comet, cross |
| Particle count | 100 – 1 800 |
| Explosion radius | 80 – 600 world units |
| Apex height | 150 – 650 units above ground |
| Spark lifetime | 1 – 5 seconds |
| Gravity / drag / mass | Varied per burst and per particle |
| Asymmetry | 0 – 40% directional skew |
| Flicker | Random rate, 42% of bursts |
| Secondary burst | 22% probability, 2 – 5 sub-explosions |
| Rare types | Massive (5%), Dense glitter (12%), Soft (8%) |

---

## Stack

- **Three.js** (r170) — scene, camera, WebGL renderer
- **Three.js postprocessing addons** — EffectComposer, UnrealBloomPass, OutputPass
- **Vite 5** — dev server and static build

No CDN. No backend. No runtime dependencies beyond the browser.

---

## Local development

```bash
npm install
npm run dev
# → http://localhost:5173/firework/
```

## Production build

```bash
npm run build
# Output: dist/
```

---

## GitHub Pages deployment

1. **Build** the project:
   ```bash
   npm install
   npm run build
   ```

2. **Push** the `dist/` folder contents to your `gh-pages` branch:
   ```bash
   # Option A — git subtree
   git subtree push --prefix dist origin gh-pages

   # Option B — gh-pages CLI
   npx gh-pages -d dist
   ```

3. In your GitHub repository → **Settings → Pages**, set source to the `gh-pages` branch, root folder.

4. Access at `https://<your-username>.github.io/firework/`

### Custom domain / different repo name

If your repo name is not `firework`, change the `base` in `vite.config.js`:

```js
base: '/your-repo-name/',
```

For a custom domain at root, set `base: '/'`, or pass at build time:

```bash
VITE_BASE=/ npm run build
```

---

## Architecture

```
src/
  main.js         Bootstrap, animation loop, auto-horizon fireworks
  Renderer.js     Three.js WebGL renderer, camera, postprocessing pipeline
  ParticlePool.js GPU-friendly flat particle buffer (typed arrays + BufferGeometry)
  Firework.js     Single firework lifecycle: launch → burst → optional secondary
  FireworkGen.js  Procedural parameter generator (weighted random palettes / shapes)
  Atmosphere.js   City lights, horizon glow, haze plane, vibration math
  Input.js        Click / touch → normalised device coordinates
  utils.js        rand, weightedPick, hexToRgb, randSphereDir, etc.
```

### Particle system

- Single `THREE.Points` object backed by one large `BufferGeometry`.
- All particles share a custom `ShaderMaterial` with additive blending and `depthWrite: false`.
- Dead particles are parked off-screen (`y = -99999`, `alpha = 0`) — no buffer resizing.
- Free-list (stack-based) allocator: O(1) alloc and release.
- Per-frame: typed-array physics loop, then `needsUpdate = true` on changed attributes.
- Mobile: 22 000 max particles. Desktop: 52 000 max.

### Rendering pipeline

```
Scene → RenderPass → UnrealBloomPass → OutputPass → screen
```

ACES filmic tone mapping, exposure 0.85, additive blending throughout.
