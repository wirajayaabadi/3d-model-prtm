import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// Rig kamera: tujuan kamera (goal) dengan pelonggaran halus (Bagian B), lima kamera (ikhtisar, samping, atas,
// bay, terbang), panning dibatasi ke plot dan konteksnya, tanpa fly-in bila pengguna meminta gerakan terbatas.
export class CameraRig {
  constructor(canvas, layout, { reduceMotion = false } = {}) {
    this.camera = new THREE.PerspectiveCamera(30, 1, 2, 2000);
    this.isoDir = new THREE.Vector3(-1, 1.05, 1).normalize(); // arah isometrik dari barat daya: bay menghadap kamera, tangki di kanan belakang
    this.frame = { w: 1, h: 1, left: 0, right: 0 };
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.enablePan = true;
    this.controls.screenSpacePanning = false;
    this.controls.minDistance = 12;
    this.controls.maxDistance = 900;
    this.controls.minPolarAngle = 0.05;
    this.controls.maxPolarAngle = Math.PI * 0.47;
    this.controls.rotateSpeed = 0.55;
    this.controls.zoomSpeed = 0.8;
    this.controls.autoRotate = false;
    this.controls.autoRotateSpeed = 0.3;
    // Seret kiri / satu jari = geser tampilan ke arah mana pun; seret kanan / dua jari = putar (+ zoom); gulir = zoom.
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
    this.controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
    this.controls.panSpeed = 1.2;
    this.controls.keyPanSpeed = 20;
    this.layout = layout;
    this.reduceMotion = reduceMotion;
    this.mode = 'overview';
    this.followId = null;
    this.desiredPosition = new THREE.Vector3();
    this.desiredTarget = new THREE.Vector3();
    this.animating = false;
    this.dragging = false;
    this.flightTime = 0;
    this.presentation = false;
    this.free = false; // mode kamera bebas: tanpa batas pan/jarak/sudut, gerak dengan WASD/panah
    this.keys = new Set();
    this.lastInteraction = performance.now();
    this._onKeyDown = (e) => {
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'q', 'e', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(k)) {
        this.keys.add(k);
        if (k !== 'shift') {
          this.animating = false;
          this.lastInteraction = performance.now();
          if (this.mode !== 'free') this.setFree(true);
          e.preventDefault();
        }
      }
    };
    this._onKeyUp = (e) => this.keys.delete(e.key.toLowerCase());
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', () => this.keys.clear());
    this.controls.addEventListener('start', () => {
      this.dragging = true;
      this.animating = false;
      this.lastInteraction = performance.now();
    });
    this.controls.addEventListener('end', () => {
      this.dragging = false;
      this.lastInteraction = performance.now();
    });
    this.setView('overview', {}, true);
  }

  setLayout(layout) {
    this.layout = layout;
    this.panBounds();
  }

  // Batas panning: plot ditambah konteks (tangki di +X, bangunan di -X).
  panBounds() {
    const W = this.layout.plot.width, L = this.layout.plot.length;
    this.bounds = new THREE.Box3(new THREE.Vector3(-50, 0, -20), new THREE.Vector3(W + 90, 0, L + 40));
  }

  goal(mode, ctx = {}) {
    const W = this.layout.plot.width, L = this.layout.plot.length;
    const centre = new THREE.Vector3(W / 2 + 28, 0, L / 2 - 2);
    const pos = new THREE.Vector3(), tgt = new THREE.Vector3();
    if (mode === 'overview') {
      // Isometrik: paskan plot + tangki (diagonal ~235 m) ke area bebas di antara kartu samping.
      tgt.set(W / 2 + 22, 0, L / 2 - 6);
      const freeFrac = Math.max(0.3, (this.frame.w - this.frame.left - this.frame.right) / this.frame.w);
      const tanH = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * this.camera.aspect;
      const d = Math.min(820, Math.max(160, 235 / (2 * tanH * freeFrac)));
      pos.copy(tgt).addScaledVector(this.isoDir, d);
    } else if (mode === 'side') {
      tgt.set(W / 2, 4, L / 2);
      pos.set(W / 2 + 260, 70, L / 2 + 200);
    } else if (mode === 'top') {
      tgt.set(W / 2, 0, L / 2);
      pos.set(W / 2, 420, L / 2 + 0.8);
    } else if (mode === 'bay') {
      const bay = ctx.bay ? this.layout.bays[ctx.bay - 1] : null;
      const cx = bay ? bay.cx : (this.layout.zones.bayBlock.x0 + this.layout.zones.bayBlock.x1) / 2;
      if (bay) {
        tgt.set(cx, 1.5, 20);
        pos.copy(tgt).addScaledVector(this.isoDir, 60);
      } else {
        tgt.set(cx, 0, 22);
        pos.copy(tgt).addScaledVector(this.isoDir, 170);
      }
    } else if (mode === 'focus') {
      tgt.copy(ctx.point || centre);
      pos.copy(tgt).addScaledVector(this.isoDir, ctx.distance || 55);
    } else if (mode === 'flight') {
      tgt.copy(centre);
      const a = this.flightTime * 0.08, d = 330;
      pos.set(centre.x + Math.sin(a + 0.8) * d * 0.8, 200 + Math.sin(a * 0.7) * 20, centre.z + Math.cos(a + 0.8) * d * 0.8);
    }
    return { pos, tgt };
  }

  // Kamera bebas: lepaskan semua batas dan hentikan animasi/tujuan kamera.
  setFree(on) {
    this.free = on;
    const c = this.controls;
    if (on) {
      this.mode = 'free';
      this.followId = null;
      this.animating = false;
      c.minDistance = 1;
      c.maxDistance = 2000;
      c.minPolarAngle = 0;
      c.maxPolarAngle = Math.PI;
      c.screenSpacePanning = true;
    } else {
      c.minDistance = 12;
      c.maxDistance = 900;
      c.minPolarAngle = 0.05;
      c.maxPolarAngle = Math.PI * 0.47;
      c.screenSpacePanning = false;
    }
  }

  // Gerak bebas: WASD/panah maju-mundur-kiri-kanan relatif arah pandang, Q/E turun-naik, Shift lebih cepat.
  applyKeys(dt) {
    if (!this.keys.size) return;
    const k = this.keys;
    const fast = k.has('shift') ? 3 : 1;
    const dist = this.camera.position.distanceTo(this.controls.target);
    const speed = Math.max(8, dist * 0.6) * fast * dt;
    const fwd = new THREE.Vector3();
    this.camera.getWorldDirection(fwd);
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
    fwd.normalize();
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
    const move = new THREE.Vector3();
    if (k.has('w') || k.has('arrowup')) move.add(fwd);
    if (k.has('s') || k.has('arrowdown')) move.sub(fwd);
    if (k.has('d') || k.has('arrowright')) move.add(right);
    if (k.has('a') || k.has('arrowleft')) move.sub(right);
    if (k.has('e')) move.y += 1;
    if (k.has('q')) move.y -= 1;
    if (move.lengthSq() === 0) return;
    move.normalize().multiplyScalar(speed);
    this.camera.position.add(move);
    this.controls.target.add(move);
    if (this.controls.target.y < 0.5 && !this.free) this.controls.target.y = 0.5;
  }

  setView(mode, ctx = {}, immediate = false) {
    if (mode === 'free') return this.setFree(true);
    if (this.free) this.setFree(false);
    this.mode = mode;
    this.flightTime = 0;
    if (mode === 'follow') {
      this.followId = ctx.truckId ?? this.followId;
      this.animating = true;
      return;
    }
    this.followId = null;
    const { pos, tgt } = this.goal(mode, ctx);
    this.desiredPosition.copy(pos);
    this.desiredTarget.copy(tgt);
    if (immediate || this.reduceMotion) {
      this.camera.position.copy(pos);
      this.controls.target.copy(tgt);
      this.controls.update();
      this.animating = mode === 'flight' && !this.reduceMotion;
    } else this.animating = true;
    this.lastInteraction = performance.now();
  }

  // Zoom bertahap menuju target (tombol +/−); factor < 1 mendekat.
  zoomBy(factor) {
    this.animating = false;
    const c = this.controls;
    const dir = this.camera.position.clone().sub(c.target);
    const d = THREE.MathUtils.clamp(dir.length() * factor, c.minDistance, c.maxDistance);
    this.camera.position.copy(c.target).addScaledVector(dir.normalize(), d);
    this.lastInteraction = performance.now();
  }

  // Fokus ke titik dunia dengan arah isometrik.
  focusOn(point, distance = 55) {
    if (this.free) this.setFree(false);
    this.mode = 'focus';
    this.followId = null;
    this.desiredTarget.copy(point);
    this.desiredPosition.copy(point).addScaledVector(this.isoDir, distance);
    if (this.reduceMotion) {
      this.camera.position.copy(this.desiredPosition);
      this.controls.target.copy(this.desiredTarget);
      this.animating = false;
    } else this.animating = true;
  }

  update(dt, followPose) {
    this.applyKeys(dt);
    if (this.mode === 'free') {
      this.controls.autoRotate = false;
      this.controls.update(dt);
      return;
    }
    if (this.mode === 'follow' && followPose) {
      const c = Math.cos(followPose.theta), s = Math.sin(followPose.theta);
      // Ikuti truk dari sudut isometrik yang sama (lebih mudah dibaca daripada dari belakang)
      this.desiredTarget.set(followPose.x, 1.5, followPose.z);
      this.desiredPosition.copy(this.desiredTarget).addScaledVector(this.isoDir, 48);
      if (!this.dragging) {
        const k = this.reduceMotion ? 1 : 1 - Math.exp(-dt * 2.5);
        this.camera.position.lerp(this.desiredPosition, k);
        this.controls.target.lerp(this.desiredTarget, k);
      }
    } else if (this.mode === 'flight' && !this.dragging && !this.reduceMotion) {
      this.flightTime += dt;
      const { pos, tgt } = this.goal('flight');
      this.desiredPosition.copy(pos);
      this.desiredTarget.copy(tgt);
      const k = 1 - Math.exp(-dt * 2);
      this.camera.position.lerp(this.desiredPosition, k);
      this.controls.target.lerp(this.desiredTarget, k);
    } else if (this.animating && !this.dragging) {
      const k = 1 - Math.exp(-dt * 3);
      this.camera.position.lerp(this.desiredPosition, k);
      this.controls.target.lerp(this.desiredTarget, k);
      if (this.camera.position.distanceTo(this.desiredPosition) < 0.05 && this.controls.target.distanceTo(this.desiredTarget) < 0.05) this.animating = false;
    }
    // Putar otomatis hanya dalam mode presentasi, setelah jeda interaksi, tanpa gerakan terbatas.
    this.controls.autoRotate = this.presentation && !this.reduceMotion && !this.dragging && !this.animating && this.mode === 'overview' && performance.now() - this.lastInteraction > 6000;
    this.controls.update(dt);
    if (this.bounds) {
      const t = this.controls.target;
      const cl = t.clone().clamp(this.bounds.min, this.bounds.max);
      if (!cl.equals(t)) {
        this.camera.position.add(cl.clone().sub(t));
        t.copy(cl);
      }
    }
  }

  // Offset tampilan memusatkan adegan pada area bebas (di antara panel), seperti Bagian B.
  resize(w, h, free = { left: 0, right: 0 }) {
    this.frame = { w, h, left: free.left, right: free.right };
    this.camera.aspect = w / h;
    const freeCenter = free.left + (w - free.left - free.right) / 2;
    this.camera.setViewOffset(w, h, w / 2 - freeCenter, 0, w, h);
    this.camera.updateProjectionMatrix();
    if (this.mode === 'overview' && !this.dragging) {
      const { pos, tgt } = this.goal('overview');
      this.desiredPosition.copy(pos);
      this.desiredTarget.copy(tgt);
      this.animating = true;
    }
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    this.controls.dispose();
  }
}
