// Label HTML terproyeksi (kartu dengan tangkai) dan tooltip hover, diadaptasi dari Bagian B.
import * as THREE from 'three';

export class LabelLayer {
  constructor(container, tooltipEl) {
    this.container = container;
    this.tooltip = tooltipEl;
    this.labels = new Map(); // key -> { el, anchor, title, meta, visible }
    this.v = new THREE.Vector3();
  }
  ensure(key, { title, meta, kind = 'bay' }) {
    let l = this.labels.get(key);
    if (!l) {
      const el = document.createElement('div');
      el.className = `scene-label ${kind}`;
      el.innerHTML = '<div class="stem"></div><div class="label-card"><div class="label-title"></div><div class="label-meta"></div></div>';
      this.container.appendChild(el);
      l = { el, titleEl: el.querySelector('.label-title'), metaEl: el.querySelector('.label-meta'), title: '', meta: '', anchor: new THREE.Vector3(), visible: false };
      this.labels.set(key, l);
    }
    if (l.title !== title) {
      l.titleEl.textContent = title;
      l.title = title;
    }
    if (l.meta !== meta) {
      l.metaEl.textContent = meta;
      l.meta = meta;
    }
    return l;
  }
  set(key, anchor, visible) {
    const l = this.labels.get(key);
    if (!l) return;
    l.anchor.copy(anchor);
    l.visible = visible;
  }
  hideAll(prefix = null) {
    for (const [k, l] of this.labels) if (!prefix || k.startsWith(prefix)) l.visible = false;
  }
  // Proyeksikan setelah kamera diperbarui; jepit di dalam viewport dan jauh dari panel (padding).
  project(camera, width, height, pad = { left: 10, right: 10, top: 90, bottom: 150 }) {
    // Urutkan menurut jarak ke kamera; label yang akan tumpang tindih dengan label yang sudah diterima disembunyikan.
    const candidates = [];
    for (const l of this.labels.values()) {
      if (!l.visible) {
        l.el.classList.remove('visible');
        continue;
      }
      this.v.copy(l.anchor).project(camera);
      if (this.v.z > 1) {
        l.el.classList.remove('visible');
        continue;
      }
      let x = (this.v.x * 0.5 + 0.5) * width - 10;
      let y = (-this.v.y * 0.5 + 0.5) * height - 56;
      x = THREE.MathUtils.clamp(x, pad.left, width - pad.right - 150);
      y = THREE.MathUtils.clamp(y, pad.top, height - pad.bottom);
      candidates.push({ l, x, y, d: camera.position.distanceTo(l.anchor), pri: l.el.classList.contains('truck') ? 0 : l.el.classList.contains('zone') ? 1 : 2 });
    }
    candidates.sort((a, b) => a.pri - b.pri || a.d - b.d);
    const accepted = [];
    for (const c of candidates) {
      const clash = accepted.some((a) => Math.abs(a.x - c.x) < 124 && Math.abs(a.y - c.y) < 48);
      if (clash) {
        c.l.el.classList.remove('visible');
        continue;
      }
      accepted.push(c);
      c.l.el.style.transform = `translate(${c.x.toFixed(1)}px,${c.y.toFixed(1)}px)`;
      c.l.el.classList.add('visible');
    }
  }
  showTooltip(x, y, title, text, width, height) {
    const t = this.tooltip;
    t.querySelector('strong').textContent = title;
    t.querySelector('span').textContent = text;
    t.style.left = Math.min(width - 260, Math.max(10, x + 16)) + 'px';
    t.style.top = Math.max(10, Math.min(height - 100, y - 70)) + 'px';
    t.classList.add('visible');
  }
  hideTooltip() {
    this.tooltip.classList.remove('visible');
  }
  dispose() {
    for (const l of this.labels.values()) l.el.remove();
    this.labels.clear();
  }
}
