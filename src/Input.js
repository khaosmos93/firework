/**
 * Input — translates click/touch events into normalised device coordinates (NDC).
 *
 * NDC: x in [-1, 1] (left→right), y in [-1, 1] (bottom→top) — matches
 * THREE.Raycaster.setFromCamera() convention.
 */

export class Input {
  /**
   * @param {HTMLElement} container   Element that captures events.
   * @param {(nx:number, ny:number) => void} onFire  Called with NDC coords.
   */
  constructor(container, onFire) {
    this._container = container;
    this._onFire    = onFire;

    this._onClick = this._onClick.bind(this);
    this._onTouch = this._onTouch.bind(this);

    container.addEventListener('click',    this._onClick);
    // passive:false lets us call preventDefault to stop scroll
    container.addEventListener('touchend', this._onTouch, { passive: false });
  }

  _ndc(clientX, clientY) {
    const rect = this._container.getBoundingClientRect();
    return {
      x:  ((clientX - rect.left)  / rect.width)  * 2 - 1,
      y: -((clientY - rect.top)   / rect.height) * 2 + 1,
    };
  }

  _onClick(e) {
    const { x, y } = this._ndc(e.clientX, e.clientY);
    this._onFire(x, y);
  }

  _onTouch(e) {
    e.preventDefault();
    const t      = e.changedTouches[0];
    const { x, y } = this._ndc(t.clientX, t.clientY);
    this._onFire(x, y);
  }

  dispose() {
    this._container.removeEventListener('click',    this._onClick);
    this._container.removeEventListener('touchend', this._onTouch);
  }
}
