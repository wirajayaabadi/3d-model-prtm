import * as THREE from 'three';

const cache = new Map();

// Sprite teks dari kanvas. size = tinggi dunia (meter).
export function makeTextSprite(text, { size = 2, color = '#ffffff', bg = 'rgba(20,24,32,0.78)', font = 'bold 40px system-ui, sans-serif', padding = 14 } = {}) {
  const key = `${text}|${color}|${bg}|${font}`;
  let tex = cache.get(key);
  let aspect;
  if (!tex) {
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');
    ctx.font = font;
    const w = Math.ceil(ctx.measureText(text).width) + padding * 2;
    const h = 56 + padding;
    c.width = Math.max(2, w);
    c.height = h;
    const g = c.getContext('2d');
    g.font = font;
    if (bg) {
      g.fillStyle = bg;
      roundRect(g, 0, 0, c.width, c.height, 12);
      g.fill();
    }
    g.fillStyle = color;
    g.textBaseline = 'middle';
    g.fillText(text, padding, c.height / 2 + 2);
    tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.userData = { aspect: c.width / c.height };
    cache.set(key, tex);
  }
  aspect = tex.userData.aspect;
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: true, depthWrite: false, transparent: true });
  const sp = new THREE.Sprite(mat);
  sp.scale.set(size * aspect, size, 1);
  sp.renderOrder = 10;
  return sp;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// Plane teks datar di tanah (untuk nomor bay/stall).
export function makeGroundText(text, { width = 3, color = '#f4f4f4', font = 'bold 64px system-ui, sans-serif' } = {}) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d');
  g.font = font;
  g.fillStyle = color;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 128, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, width / 2), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 3;
  return mesh;
}
