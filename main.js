import * as THREE from "three";
import { GLTFLoader } from "GLTFLoader";
import GUI from "lil-gui";

let sceneMain, sceneEnv, camera, renderer, cubeCam, cubeTarget;
let keychainController, bgMain, bgEnv;
let glassMeshes = [], metalMeshes = [];
let icons = [];
let gui, guiVisible = false;
let sharedGlassMat;

const cursor = { x: 0, y: 0 };
let idleRotation = 0, rotationEnabled = true;

const params = {
  rotationSpeed: 0.01,
  moveStrength: 0.15,
  lerpSpeed: 0.05,
};

// --- INIT ---
function init() {
  const canvas = document.getElementById("webgl");

  sceneMain = new THREE.Scene();
  sceneMain.background = new THREE.Color(0xffffff);
  sceneEnv = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0, 3);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);

  // LIGHTING
  const keyLight = new THREE.DirectionalLight(0xffffff, 1);
  keyLight.position.set(3, 4, 5);
  const fillLight = new THREE.DirectionalLight(0xffffff, 1.5);
  fillLight.position.set(-3, 2, 2);
  const rimLight = new THREE.DirectionalLight(0xffffff, 3.5);
  rimLight.position.set(-3, 2, -4);
  const ambLight = new THREE.AmbientLight(0xffffff, 1);
  sceneMain.add(keyLight, fillLight, rimLight, ambLight);
  sceneEnv.add(keyLight.clone(), fillLight.clone(), rimLight.clone(), ambLight.clone());

  // CUBECAMERA
  cubeTarget = new THREE.WebGLCubeRenderTarget(1024, {
    format: THREE.RGBAFormat,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
  });
  cubeCam = new THREE.CubeCamera(0.1, 100, cubeTarget);
  sceneEnv.add(cubeCam);

  const loader = new GLTFLoader();

  // BACKGROUND
  loader.load("./asset/clarity_bg.glb", (gltf) => {
    bgMain = gltf.scene;
    bgEnv = bgMain.clone();
    bgMain.scale.set(3.35, 3.35, 3.35);
    bgEnv.scale.set(3.35, 3.35, 3.35);
    bgMain.position.set(0, 0, 0);
    bgEnv.position.set(0, 0, 0);
    bgMain.traverse((c) => {
      if (c.isMesh) c.material = new THREE.MeshBasicMaterial({ map: c.material.map || null, toneMapped: false });
    });
    bgEnv.traverse((c) => {
      if (c.isMesh) c.material = new THREE.MeshBasicMaterial({ map: c.material.map || null, toneMapped: false });
    });
    sceneMain.add(bgMain);
    sceneEnv.add(bgEnv);
  });

  // KEYCHAIN
  loader.load("./asset/clarity_keychain.glb", (gltf) => {
    const model = gltf.scene;
    sceneMain.add(model);

    keychainController = model.getObjectByName("Keychain Controler") || model;
    keychainController.scale.set(1.7, 1.7, 1.7);
    keychainController.position.z = 1.3;

    model.traverse((child) => {
      if (child.isMesh) {
        const n = child.name.toLowerCase();
        if (n.includes("plastik")) {
          const mat = new THREE.MeshPhysicalMaterial({
            color: 0xffffff,
            roughness: 0.4,
            metalness: 0,
            transmission: 1,
            ior: 1.33,
            thickness: 0.05,
            envMap: cubeTarget.texture,
            envMapIntensity: 2,
            clearcoat: 1,
            clearcoatRoughness: 0.1,
          });
          child.material = mat;
          glassMeshes.push(mat);
        } else if (n.includes("besi")) {
          const mat = new THREE.MeshPhysicalMaterial({
            color: 0xffffff,
            metalness: 1,
            roughness: 0.2,
            envMap: cubeTarget.texture,
            envMapIntensity: 2,
          });
          child.material = mat;
          metalMeshes.push(mat);
        }
      }
    });

    setupGUI({ keyLight, fillLight, rimLight, ambLight });
    animate();
  });

  // ICON PATHS
  const iconPaths = [
    { name: "keys", path: "./asset/1_keys.glb", pos: { x: 0.12, y: 0.01, z: 0.3 }, amp: 0.05, spd: 0.9, color: "#A888B5" },
    { name: "locker", path: "./asset/5_locker.glb", pos: { x: 0.12, y: 0.19, z: 0.3 }, amp: 0.08, spd: 1.1, color: "#FF7BCA" },
    { name: "home", path: "./asset/2_home.glb", pos: { x: -0.16, y: 0.15, z: 0.3 }, amp: 0.09, spd: 1.0, color: "#FFD6BA" },
    { name: "suitcase", path: "./asset/6_suitcase.glb", pos: { x: -0.16, y: 0.05, z: 0.3 }, amp: 0.07, spd: 0.8, color: "#A594F9" },
    { name: "bag", path: "./asset/4_bag.glb", pos: { x: -0.06, y: 0.12, z: 0.3 }, amp: 0.06, spd: 1.2, color: "#FDB7EA" },
    { name: "backpack", path: "./asset/3_backpack.glb", pos: { x: 0.12, y: 0.08, z: 0.3 }, amp: 0.12, spd: 0.9, color: "#F39E60" },
  ];

  // --- Shared Glass Material (benar-benar global)
  sharedGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.2,
    metalness: 0,
    transmission: 1,
    ior: 1.33,
    thickness: 0,
    envMapIntensity: 2,
    envMap: cubeTarget.texture,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
  });

  // LOAD ICONS
  const loaderPromises = iconPaths.map((icon) => {
    return new Promise((resolve) => {
      loader.load(icon.path, (gltf) => {
        const root = gltf.scene;
        root.scale.set(2.5, 2.5, 2.5);
        root.position.set(icon.pos.x, icon.pos.y, icon.pos.z);

        const iconMat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(icon.color),
          roughness: 0.5,
          metalness: 0.15,
          envMapIntensity: 1,
          envMap: cubeTarget.texture,
        });

        root.traverse((child) => {
          const n = child.name.toLowerCase();
          if (n.includes("glass")) child.material = sharedGlassMat;
          else if (child.isMesh) child.material = iconMat;
        });

        icons.push({
          name: icon.name,
          root,
          loct: root,
          rot: root,
          float: { amplitude: icon.amp, speed: icon.spd },
          mats: { iconMat },
        });

        sceneMain.add(root);
        resolve();
      });
    });
  });

  // Setelah semua icon selesai load, paksa glass cube pakai material shared
  Promise.all(loaderPromises).then(() => {
    icons.forEach((icon) => {
      icon.root.traverse((child) => {
        i
