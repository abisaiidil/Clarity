import * as THREE from "three";
import { GLTFLoader } from "GLTFLoader";
import GUI from "lil-gui";

// === SETUP DASAR ===
let scene, camera, renderer;
let keychain, background, light, cubeCamera, cubeRenderTarget;

// === PARAMETER AWAL ===
const params = {
  // Glass
  glassRoughness: 0.05,
  glassTransmission: 1.0,
  glassIOR: 1.33,
  glassThickness: 1.0,
  glassReflectivity: 0.8,

  // Interaction
  moveStrength: 0.4,
  lerpSpeed: 0.05,
  rotationSpeed: 0.3,

  // Background
  bgScale: 6.5,
  bgPosX: 0,
  bgPosY: 0,
  bgPosZ: -1.2,

  // Keychain
  keyScale: 4.0,
  keyPosX: 0,
  keyPosY: 0,
  keyPosZ: 0,

  // Lighting
  lightIntensity: 2.0,
};

// === SCENE ===
const container = document.getElementById("three-container");
scene = new THREE.Scene();

// === CAMERA ===
camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 3);

// === RENDERER ===
renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
container.appendChild(renderer.domElement);

// === LIGHT ===
light = new THREE.DirectionalLight(0xffffff, params.lightIntensity);
light.position.set(3, 5, 5);
scene.add(light);
scene.add(new THREE.AmbientLight(0xffffff, 0.4));

// === ENV MAP (REFRAKSI) ===
cubeRenderTarget = new THREE.WebGLCubeRenderTarget(256, {
  format: THREE.RGBAFormat,
  generateMipmaps: true,
  minFilter: THREE.LinearMipmapLinearFilter,
});
cubeCamera = new THREE.CubeCamera(0.1, 100, cubeRenderTarget);
scene.add(cubeCamera);

// === LOAD MODELS ===
const loader = new GLTFLoader();

loader.load("./asset/clarity_bg.glb", (gltf) => {
  background = gltf.scene;
  background.scale.set(params.bgScale, params.bgScale, params.bgScale);
  background.position.set(params.bgPosX, params.bgPosY, params.bgPosZ);
  scene.add(background);
});

loader.load("./asset/clarity_keychain.glb", (gltf) => {
  keychain = gltf.scene;
  keychain.scale.set(params.keyScale, params.keyScale, params.keyScale);
  keychain.position.set(params.keyPosX, params.keyPosY, params.keyPosZ);
  scene.add(keychain);

  // Terapkan material kaca
  keychain.traverse((child) => {
    if (child.isMesh && child.name.toLowerCase().includes("plastik")) {
      child.material = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        roughness: params.glassRoughness,
        transmission: params.glassTransmission,
        ior: params.glassIOR,
        thickness: params.glassThickness,
        reflectivity: params.glassReflectivity,
        envMap: cubeRenderTarget.texture,
        transparent: true,
      });
    }
  });

  animate();
  setupGUI();
});

// === INTERAKSI FOLLOW CURSOR ===
let targetPos = new THREE.Vector2(0, 0);
window.addEventListener("mousemove", (e) => {
  targetPos.x = (e.clientX / window.innerWidth - 0.5) * 2;
  targetPos.y = -(e.clientY / window.innerHeight - 0.5) * 2;
});

// === ANIMASI ===
function animate() {
  requestAnimationFrame(animate);

  if (keychain) {
    keychain.rotation.x += 0.01 * params.rotationSpeed;
    keychain.rotation.y += 0.005 * params.rotationSpeed;

    keychain.position.x +=
      (targetPos.x * params.moveStrength - keychain.position.x) * params.lerpSpeed;
    keychain.position.y +=
      (targetPos.y * params.moveStrength - keychain.position.y) * params.lerpSpeed;

    keychain.traverse((child) => {
      if (child.isMesh && child.material?.envMap) {
        child.visible = false;
        cubeCamera.update(renderer, scene);
        child.visible = true;
      }
    });
  }

  renderer.render(scene, camera);
}

// === GUI ===
function setupGUI() {
  const gui = new GUI({ title: "Clarity Controls" });
  gui.hide();

  // Toggle GUI dengan tombol G
  window.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === "g") gui._hidden ? gui.show() : gui.hide();
  });

  // Glass
  const glassFolder = gui.addFolder("Glass");
  glassFolder.add(params, "glassRoughness", 0, 1, 0.01).onChange(updateGlass);
  glassFolder.add(params, "glassTransmission", 0, 1, 0.01).onChange(updateGlass);
  glassFolder.add(params, "glassIOR", 1, 2, 0.01).onChange(updateGlass);
  glassFolder.add(params, "glassThickness", 0, 5, 0.1).onChange(updateGlass);
  glassFolder.add(params, "glassReflectivity", 0, 1, 0.01).onChange(updateGlass);

  // Interaction
  const interFolder = gui.addFolder("Interaction");
  interFolder.add(params, "moveStrength", 0, 1, 0.01);
  interFolder.add(params, "lerpSpeed", 0.01, 0.3, 0.01);
  interFolder.add(params, "rotationSpeed", 0, 2, 0.1);

  // Background
  const bgFolder = gui.addFolder("Background");
  bgFolder.add(params, "bgScale", 1, 10, 0.1).onChange(updateBackground);
  bgFolder.add(params, "bgPosX", -2, 2, 0.01).onChange(updateBackground);
  bgFolder.add(params, "bgPosY", -2, 2, 0.01).onChange(updateBackground);
  bgFolder.add(params, "bgPosZ", -5, 0, 0.01).onChange(updateBackground);

  // Keychain
  const keyFolder = gui.addFolder("Keychain");
  keyFolder.add(params, "keyScale", 1, 10, 0.1).onChange(updateKeychain);
  keyFolder.add(params, "keyPosX", -2, 2, 0.01).onChange(updateKeychain);
  keyFolder.add(params, "keyPosY", -2, 2, 0.01).onChange(updateKeychain);
  keyFolder.add(params, "keyPosZ", -2, 2, 0.01).onChange(updateKeychain);

  // Lighting
  const lightFolder = gui.addFolder("Lighting");
  lightFolder.add(params, "lightIntensity", 0, 5, 0.1).onChange(() => {
    light.intensity = params.lightIntensity;
  });

  glassFolder.close();
  interFolder.close();
  bgFolder.close();
  keyFolder.close();
  lightFolder.close();
}

function updateGlass() {
  if (!keychain) return;
  keychain.traverse((child) => {
    if (child.isMesh && child.name.toLowerCase().includes("plastik")) {
      Object.assign(child.material, {
        roughness: params.glassRoughness,
        transmission: params.glassTransmission,
        ior: params.glassIOR,
        thickness: params.glassThickness,
        reflectivity: params.glassReflectivity,
      });
      child.material.needsUpdate = true;
    }
  });
}

function updateBackground() {
  if (background) {
    background.scale.set(params.bgScale, params.bgScale, params.bgScale);
    background.position.set(params.bgPosX, params.bgPosY, params.bgPosZ);
  }
}

function updateKeychain() {
  if (keychain) {
    keychain.scale.set(params.keyScale, params.keyScale, params.keyScale);
    keychain.position.set(params.keyPosX, params.keyPosY, params.keyPosZ);
  }
}

// Resize handler
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
