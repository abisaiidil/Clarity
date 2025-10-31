// update 79 – modern lighting fix + GUI sync
import * as THREE from "three";
import { GLTFLoader } from "GLTFLoader";
import { RectAreaLightUniformsLib } from "RectAreaLightUniformsLib";
import GUI from "lil-gui";

let renderer, sceneMain, sceneEnv, camera;
let cubeCam, cubeTarget;
let keychainController;
let icons = [];
let sharedGlassMat;
let gui, guiVisible = false;
let frameCount = 0;
let rotationEnabled = true;

// === Parameter global ===
const params = {
  rotationSpeed: 0.01,
  moveStrength: 0.15,
  lerpSpeed: 0.05,
  toneExposure: 1.0,
  keychainZ: 1.3
};

const CUBE_RESOLUTION = 512;
const CUBE_UPDATE_INTERVAL = 12;
const ICON_STANDARD_SCALE = 2.5;
const ICON_STANDARD_Z = 0.3;
const cursor = { x: 0, y: 0 };

// === INIT ===
function init() {
  const canvas = document.getElementById("webgl");

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  // ✅ Modern lighting system (no warnings)
  renderer.useLegacyLights = false;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = params.toneExposure;
  renderer.shadowMap.enabled = false;

  sceneMain = new THREE.Scene();
  sceneMain.background = new THREE.Color(0xffffff);
  sceneEnv = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0, 3);

  // --- Cube Camera ---
  cubeTarget = new THREE.WebGLCubeRenderTarget(CUBE_RESOLUTION, {
    format: THREE.RGBAFormat,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter
  });
  cubeCam = new THREE.CubeCamera(0.1, 100, cubeTarget);
  sceneEnv.add(cubeCam);

  // === LIGHTS ===
  RectAreaLightUniformsLib.init();

  const keyLight = new THREE.DirectionalLight(0xffffff, 1);
  keyLight.position.set(2, 3, 2);
  keyLight.target.position.set(0, 0, 0);
  sceneMain.add(keyLight);
  sceneMain.add(keyLight.target);

  const frontRect = new THREE.RectAreaLight(0xffffff, 1.6, 8, 4);
  frontRect.position.set(0, 0.5, 3);
  frontRect.lookAt(0, 0, 0);
  sceneMain.add(frontRect);

  const ambient = new THREE.AmbientLight(0xffffff, 1);
  sceneMain.add(ambient);

  sceneEnv.add(keyLight.clone(), frontRect.clone(), ambient.clone());

  // === BACKGROUND ===
  const loader = new GLTFLoader();
  loader.load("./asset/clarity_bg.glb", (gltf) => {
    const bg = gltf.scene;
    bg.scale.set(3.35, 3.35, 3.35);
    bg.position.set(0, 0, 0);
    bg.traverse((child) => {
      if (child.isMesh) {
        child.material = new THREE.MeshBasicMaterial({
          map: child.material.map || null,
          toneMapped: false
        });
      }
    });
    sceneMain.add(bg);
    sceneEnv.add(bg.clone());
  });

  // === KEYCHAIN ===
  loader.load("./asset/clarity_keychain.glb", (gltf) => {
    const model = gltf.scene;
    sceneMain.add(model);

    keychainController = model.getObjectByName("Keychain Controler") || model;
    keychainController.scale.set(1.7, 1.7, 1.7);
    keychainController.position.z = params.keychainZ;

    model.traverse((child) => {
      if (child.isMesh) {
        const n = child.name.toLowerCase();
        if (n.includes("plastik")) {
          child.material = new THREE.MeshPhysicalMaterial({
            color: 0xffffff,
            roughness: 0.4,
            metalness: 0,
            transmission: 1,
            ior: 1.33,
            thickness: 0.05,
            envMap: cubeTarget.texture,
            envMapIntensity: 2,
            clearcoat: 1,
            clearcoatRoughness: 0.1
          });
        } else if (n.includes("besi")) {
          child.material = new THREE.MeshPhysicalMaterial({
            color: 0xffffff,
            metalness: 1,
            roughness: 0.2,
            envMap: cubeTarget.texture,
            envMapIntensity: 2
          });
        }
      }
    });
  });

  // === SHARED GLASS CUBE MATERIAL ===
  sharedGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.2,
    metalness: 0,
    transmission: 1,
    ior: 1.33,
    thickness: 0,
    envMap: cubeTarget.texture,
    envMapIntensity: 1.5,
    clearcoat: 1,
    clearcoatRoughness: 0.08
  });

  // === ICONS ===
  const iconData = [
    { name: "keys", path: "./asset/1_keys.glb", pos:{x:0.12,y:0.01,z:0.3}, amp:0.05, spd:0.9, color:"#A888B5" },
    { name: "locker", path: "./asset/5_locker.glb", pos:{x:0.12,y:0.19,z:0.3}, amp:0.08, spd:1.1, color:"#FF7BCA" },
    { name: "home", path: "./asset/2_home.glb", pos:{x:-0.16,y:0.15,z:0.3}, amp:0.09, spd:1, color:"#FFD6BA" },
    { name: "suitcase", path: "./asset/6_suitcase.glb", pos:{x:-0.16,y:0.05,z:0.3}, amp:0.07, spd:0.8, color:"#A594F9" },
    { name: "bag", path: "./asset/4_bag.glb", pos:{x:-0.06,y:0.12,z:0.3}, amp:0.06, spd:1.2, color:"#FDB7EA" },
    { name: "backpack", path: "./asset/3_backpack.glb", pos:{x:0.12,y:0.08,z:0.3}, amp:0.12, spd:0.9, color:"#F39E60" }
  ];

  Promise.all(iconData.map(ic => loadIcon(loader, ic))).then(() => {
    buildGUI({ keyLight, frontRect, ambient });
  });

  // === EVENTS ===
  window.addEventListener("mousemove", (e) => {
    cursor.x = (e.clientX / window.innerWidth - 0.5) * 2;
    cursor.y = -(e.clientY / window.innerHeight - 0.5) * 2;
  });
  window.addEventListener("resize", onResize);
  window.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === "h") toggleGUI();
  });

  animate();
}

// === LOAD ICON ===
function loadIcon(loader, ic) {
  return new Promise((resolve) => {
    loader.load(ic.path, (gltf) => {
      const root = gltf.scene;
      root.scale.set(ICON_STANDARD_SCALE, ICON_STANDARD_SCALE, ICON_STANDARD_SCALE);
      root.position.set(ic.pos.x, ic.pos.y, ic.pos.z);

      const iconColorMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(ic.color),
        roughness: 0.5,
        metalness: 0.15,
        envMap: cubeTarget.texture,
        envMapIntensity: 1
      });

      root.traverse((child) => {
        if (child.isMesh) {
          if (child.name.toLowerCase().includes("glass")) {
            child.material = sharedGlassMat;
          } else {
            child.material = iconColorMat;
          }
        }
      });

      icons.push({
        name: ic.name,
        loct: root,
        float: { amplitude: ic.amp, speed: ic.spd },
        mats: { iconMat: iconColorMat }
      });

      sceneMain.add(root);
      resolve();
    });
  });
}

// === GUI ===
function buildGUI(lights) {
  gui = new GUI({ width: 320 });
  gui.domElement.style.display = "none";

  const lightFolder = gui.addFolder("Lighting Intensity");
  lightFolder.add(lights.keyLight, "intensity", 0, 5, 0.05).name("Key Light");
  lightFolder.add(lights.frontRect, "intensity", 0, 5, 0.05).name("Front Light");
  lightFolder.add(lights.ambient, "intensity", 0, 3, 0.05).name("Ambient");
  lightFolder.add(renderer, "toneMappingExposure", 0.2, 2.5, 0.01).name("Exposure");

  const keychainFolder = gui.addFolder("Keychain");
  const ctrlFolder = keychainFolder.addFolder("Control");
  ctrlFolder.add(params, "keychainZ", 0.5, 2, 0.01).onChange(v => keychainController.position.z = v);
  ctrlFolder.add(params, "moveStrength", 0.05, 0.5, 0.01);
  ctrlFolder.add(params, "lerpSpeed", 0.01, 0.12, 0.005);
  ctrlFolder.add(params, "rotationSpeed", 0.001, 0.03, 0.001);
  ctrlFolder.add({ toggle: () => rotationEnabled = !rotationEnabled }, "toggle").name("Toggle Idle");

  const cubeGlassFolder = keychainFolder.addFolder("Glass Material");
  cubeGlassFolder.add(sharedGlassMat, "roughness", 0, 1, 0.01);
  cubeGlassFolder.add(sharedGlassMat, "thickness", 0, 1, 0.01);
  cubeGlassFolder.add(sharedGlassMat, "envMapIntensity", 0, 3, 0.1);

  icons.forEach(ic => {
    const f = gui.addFolder(ic.name.toUpperCase());
    const posF = f.addFolder("Position");
    posF.add(ic.loct.position, "x", -2, 2, 0.01);
    posF.add(ic.loct.position, "y", -2, 2, 0.01);
    posF.add(ic.loct.position, "z", -1, 2, 0.01);
    const floatF = f.addFolder("Float Motion");
    floatF.add(ic.float, "amplitude", 0, 0.3, 0.01);
    floatF.add(ic.float, "speed", 0.2, 2, 0.01);
    const matF = f.addFolder("Material");
    matF.addColor(ic.mats.iconMat, "color");
    matF.add(ic.mats.iconMat, "roughness", 0, 1, 0.01);
    matF.add(ic.mats.iconMat, "metalness", 0, 1, 0.01);
  });
}

// === ANIMATE ===
function animate() {
  requestAnimationFrame(animate);

  if (keychainController) {
    if (rotationEnabled) keychainController.rotation.y += params.rotationSpeed;
    keychainController.rotation.x = 1;
    keychainController.rotation.z = 0.6;
    const targetX = cursor.x * params.moveStrength;
    const targetY = cursor.y * params.moveStrength;
    keychainController.position.x += (targetX - keychainController.position.x) * params.lerpSpeed;
    keychainController.position.y += (targetY - keychainController.position.y) * params.lerpSpeed;
    keychainController.position.z = params.keychainZ;
    frameCount++;
    if (frameCount % CUBE_UPDATE_INTERVAL === 0) {
      keychainController.visible = false;
      cubeCam.update(renderer, sceneEnv);
      keychainController.visible = true;
    }
  }

  const t = performance.now() * 0.001;
  icons.forEach((ic, i) => {
    const phase = i * 0.73;
    const baseY = ic.loct.userData.baseY ?? ic.loct.position.y;
    ic.loct.userData.baseY = baseY;
    ic.loct.position.y = baseY + Math.sin((t + phase) * ic.float.speed) * ic.float.amplitude;
  });

  renderer.render(sceneMain, camera);
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function toggleGUI() {
  guiVisible = !guiVisible;
  gui.domElement.style.display = guiVisible ? "block" : "none";
}

init();
