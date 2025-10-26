import * as THREE from "three";
import { GLTFLoader } from "GLTFLoader";
import GUI from "lil-gui";

let sceneMain, sceneEnv, camera, renderer;
let cubeCam, cubeTarget;
let keychainController;
let bgMain, bgEnv;
let glassMeshes = [];
let keyLight, fillLight, rimLight, ambLight;
let gui;

const cursor = { x: 0, y: 0 };
let idleRotation = 0;
const rotationSpeed = 0.01;
const moveStrength = 0.5;
const lerpSpeed = 0.05;
let frameCount = 0;
let isTouching = false;

function init() {
  const canvas = document.getElementById("webgl");

  // --- SCENE SETUP ---
  sceneMain = new THREE.Scene();
  sceneMain.background = new THREE.Color(0xffffff);
  sceneEnv = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0, window.innerWidth < 768 ? 4 : 3);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  // --- LIGHTING ---
  keyLight = new THREE.DirectionalLight(0xffffff, 4);
  keyLight.position.set(3, 4, 5);
  fillLight = new THREE.HemisphereLight(0xf5f5f5, 0xcccccc, 0.9);
  rimLight = new THREE.DirectionalLight(0xffffff, 1);
  rimLight.position.set(-3, 2, -4);
  ambLight = new THREE.AmbientLight(0xffffff, 0.5);
  sceneMain.add(keyLight, fillLight, rimLight, ambLight);
  sceneEnv.add(keyLight.clone(), fillLight.clone(), rimLight.clone(), ambLight.clone());

  // --- CUBE CAMERA ---
  cubeTarget = new THREE.WebGLCubeRenderTarget(1024, {
    format: THREE.RGBAFormat,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
  });
  cubeCam = new THREE.CubeCamera(0.1, 100, cubeTarget);
  sceneEnv.add(cubeCam);

  const loader = new GLTFLoader();

  // Background
  loader.load("./asset/clarity_bg.glb", (gltf) => {
    bgMain = gltf.scene;
    bgEnv = bgMain.clone();
    bgMain.position.z = -2.5;
    bgEnv.position.z = -2.5;
    bgMain.scale.set(6.5, 6.5, 6.5);
    bgEnv.scale.set(6.5, 6.5, 6.5);

    bgMain.traverse((child) => {
      if (child.isMesh)
        child.material = new THREE.MeshBasicMaterial({ map: child.material.map || null, toneMapped: false });
    });
    bgEnv.traverse((child) => {
      if (child.isMesh)
        child.material = new THREE.MeshBasicMaterial({ map: child.material.map || null, toneMapped: false });
    });

    sceneMain.add(bgMain);
    sceneEnv.add(bgEnv);
  });

  // Keychain
  loader.load("./asset/clarity_keychain.glb", (gltf) => {
    const model = gltf.scene;
    model.scale.set(4, 4, 4);
    sceneMain.add(model);

    keychainController =
      model.getObjectByName("Keychain Controler") ||
      model.getObjectByName("Keychain Controller") ||
      model;

    model.traverse((child) => {
      if (child.isMesh) {
        const name = child.name.toLowerCase();
        if (name.includes("plastik")) {
          const mat = new THREE.MeshPhysicalMaterial({
            color: 0xffffff,
            roughness: 0.05,
            metalness: 0,
            transmission: 1,
            ior: 1.3,
            thickness: 2,
            envMap: cubeTarget.texture,
            envMapIntensity: 1.0,
            clearcoat: 1,
            clearcoatRoughness: 0.1,
          });
          child.material = mat;
          glassMeshes.push(mat);
        }
        if (name.includes("besi")) {
          child.material = new THREE.MeshPhysicalMaterial({
            color: 0xffffff,
            metalness: 1,
            roughness: 0.3,
          });
        }
      }
    });

    if (glassMeshes.length > 0) setupGUI();
    animate();
  });

  // --- INTERAKSI ---
  window.addEventListener("mousemove", (e) => {
    cursor.x = (e.clientX / window.innerWidth - 0.5) * 2;
    cursor.y = -(e.clientY / window.innerHeight - 0.5) * 2;
  });

  // --- TOUCH INTERAKSI ---
  window.addEventListener("touchstart", (e) => {
    isTouching = true;
    handleTouchMove(e);
  });
  window.addEventListener("touchmove", handleTouchMove);
  window.addEventListener("touchend", () => (isTouching = false));

  window.addEventListener("resize", onResize);
}

function handleTouchMove(e) {
  if (e.touches.length > 0) {
    const t = e.touches[0];
    cursor.x = (t.clientX / window.innerWidth - 0.5) * 2;
    cursor.y = -(t.clientY / window.innerHeight - 0.5) * 2;
  }
}

function setupGUI() {
  gui = new GUI();
  const mat = glassMeshes[0];
  const glassFolder = gui.addFolder("Glass Material");
  glassFolder.add(mat, "transmission", 0, 1, 0.01);
  glassFolder.add(mat, "ior", 1.0, 2.0, 0.01);
  glassFolder.add(mat, "thickness", 0.1, 5, 0.1);
  glassFolder.add(mat, "roughness", 0, 1, 0.01);
  glassFolder.add(mat, "metalness", 0, 1, 0.01);
  glassFolder.add(mat, "envMapIntensity", 0, 3, 0.1);
  glassFolder.open();
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.position.z = window.innerWidth < 768 ? 4 : 3;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  requestAnimationFrame(animate);

  if (keychainController) {
    idleRotation += rotationSpeed;
    keychainController.rotation.y = idleRotation;
    keychainController.rotation.x = 1;
    keychainController.rotation.z = 0.6;

    const targetX = cursor.x * moveStrength;
    const targetY = cursor.y * moveStrength;
    keychainController.position.x += (targetX - keychainController.position.x) * lerpSpeed;
    keychainController.position.y += (targetY - keychainController.position.y) * lerpSpeed;

    frameCount++;
    if (frameCount % 3 === 0) {
      keychainController.visible = false;
      cubeCam.update(renderer, sceneEnv);
      keychainController.visible = true;
    }
  }

  renderer.render(sceneMain, camera);
}

init();
