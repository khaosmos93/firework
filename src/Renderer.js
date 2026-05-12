/**
 * Renderer — Three.js WebGL renderer + postprocessing pipeline.
 *
 * Camera:  positioned nearly directly overhead (~85° depression).
 *          Explosions are viewed as glowing domes / rings from above.
 *
 * Pipeline: RenderPass → UnrealBloomPass → OutputPass
 */

import * as THREE from 'three';
import { EffectComposer }  from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass }      from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass }      from 'three/addons/postprocessing/OutputPass.js';

// Altitude at which clicks map to world positions.
// Fireworks are also spawned at this height, so click position matches burst center.
export const EXPLOSION_ALTITUDE = 500;

export class Renderer {
  constructor(container, lowPower = false) {
    this._container = container;
    this._lowPower  = lowPower;

    const w = container.clientWidth;
    const h = container.clientHeight;

    // ── WebGL renderer ──────────────────────────────────────────────────────
    this._renderer = new THREE.WebGLRenderer({
      antialias:       !lowPower,
      powerPreference: 'high-performance',
      alpha:           false,
    });
    this._renderer.setPixelRatio(Math.min(window.devicePixelRatio, lowPower ? 1.5 : 2));
    this._renderer.setSize(w, h);
    this._renderer.toneMapping         = THREE.ACESFilmicToneMapping;
    this._renderer.toneMappingExposure = 1.1;
    container.appendChild(this._renderer.domElement);

    // ── Scene ───────────────────────────────────────────────────────────────
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x00010a);
    // Altitude-based haze: FogExp2 acts on camera-to-fragment distance,
    // which from overhead roughly equals altitude difference — natural depth.
    this.scene.fog = new THREE.FogExp2(0x00010a, 0.000068);

    // ── Camera ──────────────────────────────────────────────────────────────
    // Position high above, minimal horizontal offset → ~85° depression
    // (just enough tilt to read 3D depth in the explosions).
    this.camera = new THREE.PerspectiveCamera(60, w / h, 10, 80000);
    this.camera.position.set(0, 4500, 380);
    this.camera.lookAt(0, 0, -200);

    this._baseCamPos = this.camera.position.clone();

    // ── Raycaster ───────────────────────────────────────────────────────────
    this._raycaster = new THREE.Raycaster();
    // Plane at explosion altitude — click maps exactly to burst center
    this._altPlane  = new THREE.Plane(new THREE.Vector3(0, 1, 0), -EXPLOSION_ALTITUDE);
    // Ground plane for city-light queries
    this._groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    // ── Postprocessing ──────────────────────────────────────────────────────
    this._buildComposer(w, h);

    this._onResize = this._onResize.bind(this);
    window.addEventListener('resize', this._onResize, { passive: true });
  }

  // ── Postprocessing ─────────────────────────────────────────────────────────

  _buildComposer(w, h) {
    const pr = this._renderer.getPixelRatio();
    this._composer = new EffectComposer(this._renderer);

    this._composer.addPass(new RenderPass(this.scene, this.camera));

    // Strong bloom — particles are intentionally dim so the glow IS the light.
    this._bloomPass = new UnrealBloomPass(
      new THREE.Vector2(w * pr, h * pr),
      this._lowPower ? 1.2 : 1.9,   // strength
      this._lowPower ? 0.6 : 0.9,   // radius
      0.0                           // threshold — bloom everything
    );
    this._composer.addPass(this._bloomPass);
    this._composer.addPass(new OutputPass());
  }

  // ── Resize ─────────────────────────────────────────────────────────────────

  _onResize() {
    const w  = this._container.clientWidth;
    const h  = this._container.clientHeight;
    const pr = this._renderer.getPixelRatio();
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this._renderer.setSize(w, h);
    this._composer.setSize(w, h);
    this._bloomPass.resolution.set(w * pr, h * pr);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  get canvasHeight() {
    return this._container.clientHeight * this._renderer.getPixelRatio();
  }

  /**
   * NDC → world position on the explosion altitude plane.
   * Returns null only if the ray is exactly parallel (won't happen from overhead).
   */
  screenToExplosion(ndcX, ndcY) {
    this._raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    const out = new THREE.Vector3();
    return this._raycaster.ray.intersectPlane(this._altPlane, out) ? out : null;
  }

  /** Gentle atmospheric drift applied from Atmosphere.update() */
  applyDrift(v) {
    this.camera.position.set(
      this._baseCamPos.x + v.x,
      this._baseCamPos.y + v.y,
      this._baseCamPos.z + v.z
    );
  }

  render() { this._composer.render(); }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    this._composer.dispose();
    this._renderer.dispose();
  }
}
