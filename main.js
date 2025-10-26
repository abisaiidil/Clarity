import * as THREE from "https://unpkg.com/three@0.165.0/build/three.module.js";
import { GLTFLoader } from "https://unpkg.com/three@0.165.0/examples/jsm/loaders/GLTFLoader.js";
import GUI from "https://cdn.jsdelivr.net/npm/lil-gui@0.19/+esm";

const canvas = document.getElementById("webgl");
const sceneMain = new THREE.Scene();
const sceneEnv = new THREE.Scene();

// Kamera
const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
camera.position.set(0, 0, 3);

// Renderer
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;

// Cahaya
const ambientLight = new THREE.AmbientLight(0xffffff, 0.35);
const dirLight = new THREE.DirectionalLight(0xffffff, 1.8);
dirLight.position.set(2, 4, 3);
sceneMain.add(ambientLight, dirLight);
sceneEnv.add(ambientLight.clone(), dirLight.clone());

// GUI setup
const gui = new GUI();
gui.domElement.classList.remove("visible"); // disembunyikan dulu

// Tombol toggle GUI
window.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() === "g") {
    gui.domElement.classList.toggle("visible");
  }
});

// Loaders
const loader = new GLTFLoader();
let keychain, bgPlane, cubeCamera, cubeRenderTarget;

// CubeCamera untuk efek kaca
cubeRenderTarget = new THREE.WebGLCubeRenderTarget(256, {
  format: THREE.RGBAFormat,
  generateMipmaps: true,
  minFilter: THREE.LinearMipmapLinearFilter,
});
cubeCamera = new THREE.CubeCamera(0.1, 100, cubeRenderTarget);
sceneEnv.add(cubeCamera);

// Load Keychain
loader.load("./asset/clarity.glb", (gltf) => {
  keychain = gltf.scene.getObjectByName("Keychain Controler");
  if (keychain) {
    keychain.scale.set(4, 4, 4);
    sceneMain.add(keychain);
  }

  // Material setup
  keychain.traverse((child) => {
    if (child.isMesh) {
      if (child.name.toLowerCase().includes("plastik")) {
        child.material = new THREE.MeshPhysicalMaterial({
          color: 0xffffff,
          roughness: 0,
          transmission: 1,
          ior: 1.33,
          thickness: 0.4,
          envMap: cubeRenderTarget.texture,
          reflectivity: 1,
        });
      } else if (child.name.toLowerCase().includes("besi")) {
        child.material = new THREE.MeshStandardMaterial({
          color: 0xffffff,
          metalness: 1,
          roughness: 0.2,
        });
      }
    }
  });
});

// Load Background Plane
loader.load("./asset/clarity_bg.glb", (gltf) => {
  bgPlane = gltf.scene;
  bgPlane.scale.set(6.5, 6.5, 6.5);
  bgPlane.position.z = -0.8;
  sceneMain.add(bgPlane);
  sceneEnv.add(bgPlane.clone());

  // GUI background control
  const bgFolder = gui.addFolder("Background");
  bgFolder.add(bgPlane.position, "z", -3, 1, 0.01).name("Depth");
  bgFolder.add(bgPlane.scale, "x", 1, 10, 0.1).name("Scale");
  bgFolder.add(bgPlane.scale, "y", 1, 10, 0.1).name("Scale Y");
  bgFolder.open();
});

// GUI lighting control
const lightFolder = gui.addFolder("Lighting");
lightFolder.add(dirLight.position, "x", -5, 5, 0.1).name("Dir X");
lightFolder.add(dirLight.position, "y", -5, 5, 0.1).name("Dir Y");
lightFolder.add(dirLight.position, "z", -5, 5, 0.1).name("Dir Z");
lightFolder.add(dirLight, "intensity", 0, 5, 0.1).name("Intensity");
lightFolder.add(ambientLight, "intensity", 0, 2, 0.05).name("Ambient");
lightFolder.close();

// Interaksi
const target = new THREE.Vector2(0, 0);
const mouse = new THREE.Vector2(0, 0);

function onMove(e) {
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  target.x = (clientX / window.innerWidth - 0.5) * 0.5;
  target.y = (clientY / window.innerHeight - 0.5) * 0.5;
}

window.addEventListener("mousemove", onMove);
window.addEventListener("touchmove", onMove);

// Responsive
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Animasi
let clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();

  if (keychain) {
    keychain.rotation.x = Math.sin(t * 0.5) * 0.2 + 1;
    keychain.rotation.y = t * 0.5;
    keychain.position.x += (target.x - keychain.position.x) * 0.05;
    keychain.position.y += (target.y - keychain.position.y) * 0.05;

    keychain.visible = false;
    cubeCamera.update(renderer, sceneEnv);
    keychain.visible = true;
  }

  renderer.render(sceneMain, camera);
}

animate();
