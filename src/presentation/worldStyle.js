// Palet "senja" untuk halaman presentasi dan halaman video: tanah rumput, plot krem hangat, aspal gelap, zona
// pasir/biru, cahaya matahari rendah kekuningan, kontras lebih tinggi untuk proyektor. Material dibagi dengan
// SceneView, jadi fungsi ini dipanggil sekali setelah SceneView dibuat di halaman yang memakainya.
export function applySunsetStyle(view) {
  const { M, renderer, sun, scene } = view;
  M.ground.color.set('#C9DDB3');
  M.plot.color.set('#E7E1D4');
  M.zoneBay.color.set('#E2DBCC');
  M.zoneApproach.color.set('#D9E6F2');
  M.zoneWaiting.color.set('#F3D9A6');
  M.asphalt.color.set('#5B6670');
  M.asphaltLight.color.set('#737E89');
  M.concrete.color.set('#D8CFC0');
  M.concreteLight.color.set('#E6DED0');
  M.leaf.color.set('#4FAE6B');
  M.hedge.color.set('#8BD18F');
  renderer.toneMappingExposure = 1.12;
  scene.environmentIntensity = 0.5;
  sun.color.set('#FFD9B0');
  sun.intensity = 3.2;
  const hemi = scene.children.find((o) => o.isHemisphereLight);
  if (hemi) {
    hemi.color.set('#F3D0B5');
    hemi.groundColor.set('#9FB8C8');
    hemi.intensity = 1.35;
  }
  scene.fog.color.set('#E6D5C8');
}
