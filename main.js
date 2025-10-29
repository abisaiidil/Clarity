import * as THREE from "three";
import { GLTFLoader } from "GLTFLoader";

// === SETUP DASAR ===
const container = document.getElementById("three-container");
const scene = new THREE.Scene();
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

let camera;

// === LOAD GLB DENGAN KAMERA BLENDER ===
// pastikan nama file-mu sesuai: clarity_bg.glb di folder asset/
const loader = new GLTFLoader();
loader.load(
  "./asset/clarity_bg.glb",
  (gltf) => {
    const model = gltf.scene;
    scene.add(model);

    // ambil kamera dari Blender
    if (gltf.cameras && gltf.cameras.length > 0) {
      camera = gltf.cameras[0];
      scene.add(camera);
      console.log("🎥 Kamera Blender digunakan:", camera);
    } else {
      // fallback camera jika glb tidak berisi kamera
      camera = new THREE.OrthographicCamera(
        window.innerWidth / -200,
        window.innerWidth / 200,
        window.innerHeight / 200,
        window.innerHeight / -200,
        0.1,
        100
      );
      camera.position.set(0, 0, 5);
      console.warn("⚠️ Tidak ada kamera di .glb — menggunakan kamera default");
    }

    // tambahkan sedikit ambient light biar tidak terlalu gelap
    const ambient = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambient);

    animate();
  },
  (xhr) => {
    console.log(`⏳ Loading ${(xhr.loaded / xhr.total) * 100}%`);
  },
  (error) => {
    console.error("❌ Gagal memuat GLB:", error);
  }
);

// === ANIMATE ===
function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}

// === RESIZE RESPONSIVE ===
window.addEventListener("resize", () => {
  if (camera && camera.isPerspectiveCamera) {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  } else if (camera && camera.isOrthographicCamera) {
    const aspect = window.innerWidth / window.innerHeight;
    const frustumHeight = 2;
    camera.left = (-frustumHeight * aspect) / 2;
    camera.right = (frustumHeight * aspect) / 2;
    camera.top = frustumHeight / 2;
    camera.bottom = -frustumHeight / 2;
    camera.updateProjectionMatrix();
  }
  renderer.setSize(window.innerWidth, window.innerHeight);
});
