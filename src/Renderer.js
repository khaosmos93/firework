/**
 * Renderer — Three.js WebGL renderer + postprocessing pipeline.
 *
 * Camera:  positioned high and slightly back, looking diagonally downward
 *          (airplane-window perspective, ~32° depression from horizontal).
 *
 * Pipeline: RenderPass → UnrealBloomPass → OutputPass
 *
 * GitHub Pages note: all imports use npm-bundled three/addons paths — no CDN.
 */

import * as THREE from 'three';
import { EffectComposer }  from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass }      from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass }      from 'three/addons/postprocessing/OutputPass.js';

export class Renderer {
  /**
   * @param {HTMLElement} container  The full-screen div that receives the canvas.
   * @param {boolean}     lowPower   Reduce quality on mobile/low-end devices.
   */
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
    this._renderer.toneMappingExposure = 0.85;
    container.appendChild(this._renderer.domElement);

    // ── Scene ───────────────────────────────────────────────────────────────
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x00020e);
    // Subtle exponential fog — adds atmospheric depth
    this.scene.fog = new THREE.FogExp2(0x00020e, 0.000055);

    // ── Camera ──────────────────────────────────────────────────────────────
    // Position: 2000 up, 1400 back from origin
    // LookAt:   a point on the ground 2500 units forward
    // Result:   ~32° depression — feels like a window seat looking diagonally down
    this.camera = new THREE.PerspectiveCamera(52, w / h, 5, 80000);
    this.camera.position.set(0, 2000, 1400);
    this._lookTarget = new THREE.Vector3(0, 0, -2500);
    this.camera.lookAt(this._lookTarget);

    // Store base pose for vibration offset
    this._baseCamPos = this.camera.position.clone();
    this._baseCamQuat = this.camera.quaternion.clone();

    // ── Ground-plane raycaster ──────────────────────────────────────────────
    this._groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this._raycaster   = new THREE.Raycaster();

    // ── Postprocessing ──────────────────────────────────────────────────────
    this._buildComposer(w, h);

    // ── Resize handling ─────────────────────────────────────────────────────
    this._onResize = this._onResize.bind(this);
    window.addEventListener('resize', this._onResize, { passive: true });
  }

  // ── Postprocessing ─────────────────────────────────────────────────────────

  _buildComposer(w, h) {
    const pr = this._renderer.getPixelRatio();

    this._composer = new EffectComposer(this._renderer);

    this._renderPass = new RenderPass(this.scene, this.camera);
    this._composer.addPass(this._renderPass);

    // Bloom strength is higher on desktop for the full cinematic look
    this._bloomPass = new UnrealBloomPass(
      new THREE.Vector2(w * pr, h * pr),
      this._lowPower ? 0.9 : 1.4,   // strength
      this._lowPower ? 0.5 : 0.75,  // radius
      0.0                           // threshold — bloom everything (additive scene)
    );
    this._composer.addPass(this._bloomPass);

    this._outputPass = new OutputPass();
    this._composer.addPass(this._outputPass);
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
   * Map a normalised screen coordinate (NDC) to a point on the world ground plane.
   * Returns null if the ray is parallel to the ground (looking at horizon).
   */
  screenToGround(ndcX, ndcY) {
    this._raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    const target = new THREE.Vector3();
    const hit    = this._raycaster.ray.intersectPlane(this._groundPlane, target);
    return hit ? target : null;
  }

  /** Apply airplane-vibration offset to the camera. */
  applyVibration(v) {
    this.camera.position.set(
      this._baseCamPos.x + v.x,
      this._baseCamPos.y + v.y,
      this._baseCamPos.z + v.z
    );
    // Quaternion is not changed — pure translation feels more like turbulence
    // than a rolling camera, which would be nauseating.
  }

  render() {
    this._composer.render();
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    this._composer.dispose();
    this._renderer.dispose();
  }
}
