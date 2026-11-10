// Logo Pertamina sebagai stiker pada truk dan SPBU. Gambarnya adalah berkas yang diberikan tim (docs/logo-pertamina.png),
// dipotong ke tepi logo dan dipakai apa adanya sebagai tekstur di atas pelat putih; logo tidak digambar ulang di kode,
// SVG atau kanvas. Aplikasi tetap menampilkan catatan bahwa ini bukan materi resmi Pertamina.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import logoUrl from './brand/logo-pertamina.png?url';

export const LOGO_ASPECT = 1461 / 402; // lebar : tinggi berkas hasil potong (termasuk tepi putih)
let material = null;

// Satu material bersama; sebelum gambar selesai dimuat, stiker tampil sebagai pelat putih.
export function logoMaterial() {
  if (!material) {
    const texture = new THREE.TextureLoader().load(logoUrl);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.55, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  }
  return material;
}

// Geometri stiker: satu bidang per tempat, digabung. Tiap tempat: { x, y, z, width, ry } dengan ry = putaran sumbu Y
// (0 menghadap +Z, π menghadap -Z, ±π/2 menghadap ±X).
export function logoGeometry(places) {
  const parts = places.map(({ x, y, z, width, ry = 0 }) => new THREE.PlaneGeometry(width, width / LOGO_ASPECT).applyMatrix4(new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z)));
  const merged = parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
  if (parts.length > 1) for (const p of parts) p.dispose();
  return merged;
}
export function logoMesh(places) {
  return new THREE.Mesh(logoGeometry(places), logoMaterial());
}
