import * as THREE from "three";
import { GLTFLoader } from "GLTFLoader";

let scene, camera, renderer;
let model, cubeCam, cubeTarget;

const cursor = { x: 0, y: 0 };
const rotationLerp = 0.06;

function init() {
  const canvas = document.getElementById("webgl");

  // === Scene + Background ===
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf7f7f7); // sedikit abu terang agar kaca terlihat

  // === Kamera ===
  camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0, 3);

  // === Renderer ===
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  // === Lighting setup ===
  const ambLight = new THREE.AmbientLight(0xffffff, 1.2);
  const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.5);
  dirLight1.position.set(3, 3, 5);

  const dirLight2 = new THREE.DirectionalLight(0xffffff, 1.0);
  dirLight2.position.set(-4, -3, -5);

  const hemiLight = new THREE.HemisphereLight(0xffffff, 0xdddddd, 0.8);
  hemiLight.position.set(0, 5, 0);

  scene.add(ambLight, dirLight1, dirLight2, hemiLight);

  // === CubeCamera untuk efek refraksi ===
  cubeTarget = new THREE.WebGLCubeRenderTarget(1024, {
    format: THREE.RGBAFormat,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
  });
  cubeCam = new THREE.CubeCamera(0.1, 100, cubeTarget);
  scene.add(cubeCam);

  // === Load model ===
  const loader = new GLTFLoader();
  loader.load(
    "./asset/clarity.glb",
    (gltf) => {
      model = gltf.scene;
      model.scale.set(60, 60, 60); // bisa ubah 60→80 kalau model terlalu kecil
      model.position.set(0, 0, 0);
      scene.add(model);

      // === Material kaca transparan ===
      model.traverse((child) => {
        if (child.isMesh) {
          child.material = new THREE.MeshPhysicalMaterial({
            color: 0xffffff,
            metalness: 0,
            roughness: 0,
            transmission: 1,
            thickness: 2,
            ior: 1.45,
            envMap: cubeTarget.texture,
            reflectivity: 0.5,
            clearcoat: 1,
            clearcoatRoughness: 0.05,
            attenuationColor: new THREE.Color(0xffffff),
            attenuationDistance: 2,
          });
        }
      });

      console.log("✅ clarity.glb loaded successfully");
      animate();
    },
    undefined,
    (err) => console.error("❌ gagal load model:", err)
  );

  // === Interaksi cursor ===
  window.addEventListener("mousemove", (e) => {
    cursor.x = (e.clientX / window.innerWidth - 0.5) * 2;
    cursor.y = -(e.clientY / window.innerHeight - 0.5) * 2;
  });

  window.addEventListener("resize", onResize);
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  requestAnimationFrame(animate);

  if (model) {
    // idle rotation
    model.rotation.y += 0.003;

    // follow cursor
    model.rotation.x += (cursor.y * 0.5 - model.rotation.x) * rotationLerp;
    model.rotation.y += (cursor.x * 0.5 - model.rotation.y) * rotationLerp;

    // update cubecam untuk efek refraksi
    model.visible = false;
    cubeCam.update(renderer, scene);
    model.visible = true;
  }

  renderer.render(scene, camera);
}

init();
