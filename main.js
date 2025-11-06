// main.js — Update 81 (icon & cube glass removed, only keychain + UI hero)
import * as THREE from "three";
import { GLTFLoader } from "GLTFLoader";
import { RectAreaLightUniformsLib } from "RectAreaLightUniformsLib";
import GUI from "lil-gui";

/* ========= Renderer ========= */
const canvas = document.getElementById("webgl");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
renderer.shadowMap.enabled = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffffff);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 3);

/* ========= Lighting ========= */
RectAreaLightUniformsLib.init();

const keyLight = new THREE.DirectionalLight(0xffffff, 2.0);
keyLight.position.set(1.2, 2.0, 1.8);
scene.add(keyLight);

const frontRect = new THREE.RectAreaLight(0xffffff, 1.5, 6, 3.5);
frontRect.position.set(0, 0.6, 2.6);
frontRect.lookAt(0, 0, 0);
scene.add(frontRect);

const rimLight = new THREE.DirectionalLight(0xffffff, 0.9);
rimLight.position.set(-1.8, 1.8, -1.8);
scene.add(rimLight);

const hemi = new THREE.HemisphereLight(0xf6f6ff, 0xf2e9dc, 0.8);
scene.add(hemi);

/* ========= Shared Glass Material ========= */
const cubeRenderTarget = new THREE.WebGLCubeRenderTarget(512, {
  format: THREE.RGBAFormat,
  generateMipmaps: true,
  minFilter: THREE.LinearMipmapLinearFilter,
});
const cubeCamera = new THREE.CubeCamera(0.1, 100, cubeRenderTarget);
scene.add(cubeCamera);

const glassMaterial = new THREE.MeshPhysicalMaterial({
  color: 0xffffff,
  roughness: 0.25,
  metalness: 0,
  transmission: 0.95,
  ior: 1.45,
  thickness: 0.25,
  envMap: cubeRenderTarget.texture,
  envMapIntensity: 2.2,
  clearcoat: 1,
  clearcoatRoughness: 0.05,
  transparent: true,
  opacity: 1.0,
  attenuationDistance: 1.2,
  attenuationColor: new THREE.Color(0xffffff),
});

/* ========= Loader ========= */
const loader = new GLTFLoader();
let keychainController = null;
let bgLoaded = false;
let keychainLoaded = false;

/* --- UI Background Plane (Hero UI) --- */
loader.load("./asset/clarity_bg.glb", (gltf) => {
  const bg = gltf.scene;
  bg.traverse((c) => {
    if (c.isMesh) {
      c.material = new THREE.MeshBasicMaterial({ map: c.material.map, toneMapped: false });
    }
  });
  bg.scale.set(3.35, 3.35, 3.35);
  bg.position.set(0, 0, 0);
  scene.add(bg);
  bgLoaded = true;
  tryUpdateEnv();
});

/* --- Keychain Model --- */
loader.load("./asset/clarity_keychain.glb", (gltf) => {
  const model = gltf.scene;
  model.traverse((c) => {
    if (c.isMesh) {
      const lname = c.name.toLowerCase();
      if (lname.includes("plastik") || lname.includes("plast")) {
        c.material = glassMaterial;
      } else if (lname.includes("besi") || lname.includes("metal")) {
        c.material = new THREE.MeshPhysicalMaterial({
          color: 0xffffff,
          metalness: 1,
          roughness: 0.2,
          envMap: cubeRenderTarget.texture,
          envMapIntensity: 2.5,
        });
      }
    }
  });
  scene.add(model);
  keychainController =
    model.getObjectByName("Keychain Controler") ||
    model.getObjectByName("Keychain Controller") ||
    model;
  keychainController.scale.set(1.7, 1.7, 1.7);
  keychainController.position.z = 1.3;
  keychainLoaded = true;
  tryUpdateEnv();
});

/* ========= Update Environment once everything loaded ========= */
function tryUpdateEnv() {
  if (!bgLoaded || !keychainLoaded) return;
  keychainController.visible = false;
  cubeCamera.update(renderer, scene);
  keychainController.visible = true;
}

/* ========= GUI ========= */
const gui = new GUI({ width: 340 });
gui.domElement.style.display = "none";

const lf = gui.addFolder("Lighting");
lf.add(keyLight, "intensity", 0, 5, 0.01).name("Key Light");
lf.add(frontRect, "intensity", 0, 5, 0.01).name("Front Light");
lf.add(rimLight, "intensity", 0, 5, 0.01).name("Rim Light");
lf.add(hemi, "intensity", 0, 3, 0.01).name("Hemisphere");
lf.add(renderer, "toneMappingExposure", 0.2, 2, 0.01).name("Exposure");

const gm = gui.addFolder("Glass Material");
gm.add(glassMaterial, "roughness", 0, 1, 0.01).name("Roughness");
gm.add(glassMaterial, "transmission", 0, 1, 0.01).name("Transmission");
gm.add(glassMaterial, "thickness", 0, 1, 0.01).name("Thickness");
gm.add(glassMaterial, "ior", 1.0, 2.0, 0.01).name("IOR");
gm.add(glassMaterial, "envMapIntensity", 0, 3, 0.05).name("Env Intensity");
gm.add(glassMaterial, "attenuationDistance", 0, 3, 0.01).name("Attenuation Dist");
gm.addColor({ color: "#ffffff" }, "color").name("Attenuation Color").onChange((val) => {
  glassMaterial.attenuationColor = new THREE.Color(val);
});

window.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() === "h") {
    gui.domElement.style.display =
      gui.domElement.style.display === "none" ? "block" : "none";
  }
});

/* ========= Interaction ========= */
const pointer = { x: 0, y: 0 };
window.addEventListener("mousemove", (e) => {
  pointer.x = (e.clientX / window.innerWidth - 0.5) * 2;
  pointer.y = -(e.clientY / window.innerHeight - 0.5) * 2;
});

/* ========= Animation ========= */
let lastTime = performance.now();
function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = (now - lastTime) * 0.001;
  lastTime = now;

  if (keychainController) {
    keychainController.rotation.y += 0.01;
    keychainController.rotation.x = 1;
    keychainController.rotation.z = 0.6;

    const targetX = pointer.x * 0.15;
    const targetY = pointer.y * 0.15;
    keychainController.position.x += (targetX - keychainController.position.x) * 0.05;
    keychainController.position.y += (targetY - keychainController.position.y) * 0.05;
  }

  renderer.render(scene, camera);
}
animate();

/* ========= Resize ========= */
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
