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
  keychai
