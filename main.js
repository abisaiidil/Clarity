// main.js — Update 86
import * as THREE from "three";
import { GLTFLoader } from "GLTFLoader";
import { RGBELoader } from "RGBELoader";
import GUI from "lil-gui";

let renderer, scene, camera;
let keychainController = null;
let bgMain = null;
let pmremGenerator;
let clock = new THREE.Clock();

const canvas = document.getElementById("webgl");

// PARAMS default
const PARAMS = {
  moveStrength: 0.15,
  lerpSpeed: 0.05,
  rotationSpeed: 0.01,
  pauseIdle: false,

  // lighting
  hdri: true,
  exposure: 0.9,
  keyLight: 0.8,
  fillLight: 0.5,
  rimLight: 1.2,
  areaLight: 0.9,
  ambientLight: 0.35,

  // glass
  glass_roughness: 0.25,
  glass_transmission: 1.0,
  glass_ior: 1.45,
  glass_thickness: 0.25,
  glass_attenuationDistance: 0.8,
  glass_envIntensity: 2.0,

  // metal
  metal_roughness: 0.15,
  metal_metalness: 1.0,
  metal_envIntensity: 2.5,

  // camera
  cameraZoomMultiplier: 1.0,

  // background manual controls
  bgScale: 3.5,
  bgZ: -2.5
};

const cursor = { x: 0, y: 0 };
let idleRot = 0;

let keyLight, fillLight, rimLight, areaLight, ambientLight;
const glassMaterials = [];
const metalMaterials = [];

function init() {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = PARAMS.exposure;

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.05, 200);
  camera.position.set(0, 0, 3);

  pmremGenerator = new THREE.PMREMGenerator(renderer);

  // Lights
  keyLight = new THREE.DirectionalLight(0xffffff, PARAMS.keyLight);
  keyLight.position.set(3, 4, 5);

  fillLight = new THREE.DirectionalLight(0xffffff, PARAMS.fillLight);
  fillLight.position.set(-3, 2, 2);

  rimLight = new THREE.DirectionalLight(0xffffff, PARAMS.rimLight);
  rimLight.position.set(-3, 2, -4);

  areaLight = new THREE.RectAreaLight(0xffffff, PARAMS.areaLight, 0.6, 0.6);
  areaLight.position.set(1.4, 1.4, 1.2);
  areaLight.lookAt(0, 0, 0);

  ambientLight = new THREE.AmbientLight(0xffffff, PARAMS.ambientLight);
  scene.add(keyLight, fillLight, rimLight, areaLight, ambientLight);

  // Loaders
  const loader = new GLTFLoader();

  loader.load("./asset/clarity_bg.glb", (g) => {
    bgMain = g.scene;
    bgMain.traverse((c) => {
      if (c.isMesh) {
        const m = c.material;
        c.material = new THREE.MeshBasicMaterial({
          map: m.map || null,
          toneMapped: false
        });
        c.material.map && (c.material.map.encoding = THREE.sRGBEncoding);
      }
    });
    bgMain.scale.setScalar(PARAMS.bgScale);
    bgMain.position.z = PARAMS.bgZ;
    scene.add(bgMain);
  });

  loader.load("./asset/clarity_keychain.glb", (g) => {
    const model = g.scene;
    model.scale.set(1.7, 1.7, 1.7);
    scene.add(model);
    keychainController = model.getObjectByName("Keychain Controler") || model;

    model.traverse((c) => {
      if (c.isMesh) {
        const name = c.name.toLowerCase();
        if (name.includes("glass") || name.includes("plastik")) {
          const glassMat = new THREE.MeshPhysicalMaterial({
            color: 0xffffff,
            roughness: PARAMS.glass_roughness,
            transmission: PARAMS.glass_transmission,
            ior: PARAMS.glass_ior,
            thickness: PARAMS.glass_thickness,
            attenuationDistance: PARAMS.glass_attenuationDistance,
            envMapIntensity: PARAMS.glass_envIntensity,
            clearcoat: 1,
            clearcoatRoughness: 0.05
          });
          c.material = glassMat;
          glassMaterials.push(glassMat);
        } else if (name.includes("metal") || name.includes("ring")) {
          const metalMat = new THREE.MeshPhysicalMaterial({
            color: 0xffffff,
            metalness: PARAMS.metal_metalness,
            roughness: PARAMS.metal_roughness,
            envMapIntensity: PARAMS.metal_envIntensity,
            clearcoat: 1,
            clearcoatRoughness: 0.05
          });
          c.material = metalMat;
          metalMaterials.push(metalMat);
        }
      }
    });
  });

  if (PARAMS.hdri) {
    const rgbe = new RGBELoader();
    rgbe.setPath("https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/");
    rgbe.load("studio_small_03_1k.hdr", (tex) => {
      const envMap = pmremGenerator.fromEquirectangular(tex).texture;
      scene.environment = envMap;
      tex.dispose();
    });
  }

  // Events
  window.addEventListener("resize", onResize);
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("click", () => (PARAMS.pauseIdle = !PARAMS.pauseIdle));

  createGUI();
  onResize();
  animate();
}

function onMouseMove(e) {
  cursor.x = (e.clientX / window.innerWidth - 0.5) * 2;
  cursor.y = -(e.clientY / window.innerHeight - 0.5) * 2;
}

function onResize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}

function fitBackgroundToViewport() {
  if (!bgMain) return;
  const box = new THREE.Box3().setFromObject(bgMain);
  const size = new THREE.Vector3();
  box.getSize(size);
  const viewportHeight = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * Math.abs(camera.position.z);
  const targetHeight = viewportHeight * 0.9;
  if (size.y > 0) {
    const scaleFactor = targetHeight / size.y;
    bgMain.scale.setScalar(scaleFactor);
    PARAMS.bgScale = scaleFactor;
  }
  bgMain.position.z = PARAMS.bgZ;
}

let gui;
function createGUI() {
  gui = new GUI({ width: 320 });

  const fLight = gui.addFolder("Lighting");
  fLight.add(PARAMS, "exposure", 0.3, 2, 0.01).onChange((v) => (renderer.toneMappingExposure = v));
  fLight.add(PARAMS, "keyLight", 0, 5, 0.01).onChange((v) => (keyLight.intensity = v));
  fLight.add(PARAMS, "fillLight", 0, 5, 0.01).onChange((v) => (fillLight.intensity = v));
  fLight.add(PARAMS, "rimLight", 0, 5, 0.01).onChange((v) => (rimLight.intensity = v));
  fLight.add(PARAMS, "ambientLight", 0, 2, 0.01).onChange((v) => (ambientLight.intensity = v));
  fLight.open();

  const fKC = gui.addFolder("Keychain");
  fKC.add(PARAMS, "rotationSpeed", 0, 0.05, 0.001);
  fKC.add(PARAMS, "moveStrength", 0, 1, 0.01);
  fKC.add(PARAMS, "lerpSpeed", 0.01, 0.2, 0.005);
  fKC.open();

  const fGlass = gui.addFolder("Glass Material (Keychain)");
  fGlass.add(PARAMS, "glass_roughness", 0, 1, 0.01).onChange((v) => glassMaterials.forEach((m) => (m.roughness = v)));
  fGlass.add(PARAMS, "glass_ior", 1, 2, 0.01).onChange((v) => glassMaterials.forEach((m) => (m.ior = v)));
  fGlass.add(PARAMS, "glass_thickness", 0, 1, 0.01).onChange((v) => glassMaterials.forEach((m) => (m.thickness = v)));
  fGlass.add(PARAMS, "glass_envIntensity", 0, 4, 0.1).onChange((v) => glassMaterials.forEach((m) => (m.envMapIntensity = v)));

  const fMetal = gui.addFolder("Metal Material (Keychain)");
  fMetal.add(PARAMS, "metal_roughness", 0, 1, 0.01).onChange((v) => metalMaterials.forEach((m) => (m.roughness = v)));
  fMetal.add(PARAMS, "metal_envIntensity", 0, 4, 0.1).onChange((v) => metalMaterials.forEach((m) => (m.envMapIntensity = v)));

  const fBG = gui.addFolder("Background Controls");
  fBG.add(PARAMS, "bgScale", 0.5, 10, 0.01).onChange((v) => bgMain && bgMain.scale.setScalar(v));
  fBG.add(PARAMS, "bgZ", -10, 2, 0.01).onChange((v) => bgMain && (bgMain.position.z = v));
  fBG.add({ applyFit: () => fitBackgroundToViewport() }, "applyFit").name("Apply Fit");
  fBG.open();
}

function animate() {
  requestAnimationFrame(animate);

  if (keychainController) {
    if (!PARAMS.pauseIdle) {
      idleRot += PARAMS.rotationSpeed;
      keychainController.rotation.y = idleRot;
      keychainController.rotation.x = 1;
      keychainController.rotation.z = 0.6;
    }

    const targetX = cursor.x * PARAMS.moveStrength;
    const targetY = cursor.y * PARAMS.moveStrength;
    keychainController.position.x += (targetX - keychainController.position.x) * PARAMS.lerpSpeed;
    keychainController.position.y += (targetY - keychainController.position.y) * PARAMS.lerpSpeed;
  }

  renderer.render(scene, camera);
}

init();
