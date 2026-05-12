/**
 * Renderer — minimal Three.js WebGL renderer.
 *
 * Strict top-down view: camera directly overhead, looking straight down.
 * No postprocessing — particles must be large and bright on their own.
 */

import * as THREE from 'three';

// Altitude at which fireworks explode (camera is at y=5000, so depth = 3500).
export const EXPLOSION_ALTITUDE = 1500;

export class Renderer {
  constructor(container) {
    this._container = container;
    const w = container.clientWidth  || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;

    this._renderer = new THREE.WebGLRenderer({ antialias: false });
    this._renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this._renderer.setSize(w, h);
    this._renderer.setClearColor(0x000008, 1);
    container.appendChild(this._renderer.domElement);

    this.scene = new THREE.Scene();

    // Strict top-down: camera directly above, looking straight down.
    // up=(0,0,-1) avoids the degenerate case when look direction == world Y.
    this.camera = new THREE.PerspectiveCamera(65, w / h, 1, 80000);
    this.camera.up.set(0, 0, -1);
    this.camera.position.set(0, 5000, 0);
    this.camera.lookAt(0, 0, 0);

    // Plane at explosion altitude for click→world mapping.
    this._raycaster = new THREE.Raycaster();
    this._altPlane  = new THREE.Plane(new THREE.Vector3(0, 1, 0), -EXPLOSION_ALTITUDE);

    window.addEventListener('resize', () => this._onResize(), { passive: true });
  }

  _onResize() {
    const w = this._container.clientWidth;
    const h = this._container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this._renderer.setSize(w, h);
  }

  get canvasHeight() {
    return this._container.clientHeight * this._renderer.getPixelRatio();
  }

  /** NDC → world position on the explosion-altitude plane. */
  screenToWorld(ndcX, ndcY) {
    this._raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    const out = new THREE.Vector3();
    return this._raycaster.ray.intersectPlane(this._altPlane, out) ? out : null;
  }

  render() { this._renderer.render(this.scene, this.camera); }
}
