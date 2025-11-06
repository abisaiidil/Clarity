// main.js — Update 80.1 (fix shader + use shared glass defaults that show up)
// Imports come from importmap in index.html
import * as THREE from "three";
import { GLTFLoader } from "GLTFLoader";
import { RectAreaLightUniformsLib } from "RectAreaLightUniformsLib";
import GUI from "lil-gui";

/* ========= RENDERER & SCENE ========= */
const canvas = document.getElementById("webgl");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

// modern color space + tone mapping (r155+)
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2; // sedikit boost default
renderer.shadowMap.enabled = false;

const sceneMain = new THREE.Scene();
sceneMain.background = new THREE.Color(0xffffff);
const sceneEnv = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 3);

/* ========= CUBE CAMERA (static one-time capture) ========= */
const CUBE_RES = 512;
const cubeTarget = new THREE.WebGLCubeRenderTarget(CUBE_RES, {
  format: THREE.RGBAFormat,
  generateMipmaps: true,
  minFilter: THREE.LinearMipmapLinearFilter
});
const cubeCam = new THREE.CubeCamera(0.1, 100, cubeTarget);
sceneEnv.add(cubeCam);

/* ========= LIGHTING ========= */
RectAreaLightUniformsLib.init();

const keyLight = new THREE.DirectionalLight(0xffffff, 2.0);
keyLight.position.set(1.2, 2.0, 1.8);
keyLight.target.position.set(0,0,0);
sceneMain.add(keyLight, keyLight.target);

const frontRect = new THREE.RectAreaLight(0xffffff, 1.6, 6, 3.5);
frontRect.position.set(0, 0.6, 2.6);
frontRect.lookAt(0,0,0);
sceneMain.add(frontRect);

const rimLight = new THREE.DirectionalLight(0xffffff, 0.8);
rimLight.position.set(-1.8, 1.8, -1.8);
rimLight.target.position.set(0,0,0);
sceneMain.add(rimLight, rimLight.target);

const hemi = new THREE.HemisphereLight(0xf6f6ff, 0xf2e9dc, 0.8);
sceneMain.add(hemi);

// add clones to env scene so cube capture sees similar lighting
sceneEnv.add(keyLight.clone(), frontRect.clone(), rimLight.clone(), hemi.clone());

/* ========= SHARED GLASS MATERIAL (NO onBeforeCompile) ========= */
/* Updated defaults so glass is visible on white background
   - transmission < 1 so cube shape remains visible
   - thicker thickness + attenuation to see form
*/
const sharedGlassMat = new THREE.MeshPhysicalMaterial({
  color: 0xffffff,
  roughness: 0.15,
  metalness: 0,
  transmission: 0.95,
  ior: 1.45,
  thickness: 0.2,
  envMap: cubeTarget.texture,
  envMapIntensity: 2.0,
  clearcoat: 1,
  clearcoatRoughness: 0.05,
  side: THREE.DoubleSide,
  transparent: true,
  opacity: 1.0,
  attenuationDistance: 1.2,
  attenuationColor: new THREE.Color(0xffffff)
});

/* ========= LOADER & ASSET LIST ========= */
const loader = new GLTFLoader();

let keychainController = null;
const icons = [];
const iconList = [
  { name: "keys", path: "./asset/1_keys.glb", pos:{x:0.12,y:0.01,z:0.3}, amp:0.05, spd:0.9, color:"#A888B5" },
  { name: "locker", path: "./asset/5_locker.glb", pos:{x:0.12,y:0.19,z:0.3}, amp:0.08, spd:1.1, color:"#FF7BCA" },
  { name: "home", path: "./asset/2_home.glb", pos:{x:-0.16,y:0.15,z:0.3}, amp:0.09, spd:1.0, color:"#FFD6BA" },
  { name: "suitcase", path: "./asset/6_suitcase.glb", pos:{x:-0.16,y:0.05,z:0.3}, amp:0.07, spd:0.8, color:"#A594F9" },
  { name: "bag", path: "./asset/4_bag.glb", pos:{x:-0.06,y:0.12,z:0.3}, amp:0.06, spd:1.2, color:"#FDB7EA" },
  { name: "backpack", path: "./asset/3_backpack.glb", pos:{x:0.12,y:0.08,z:0.3}, amp:0.12, spd:0.9, color:"#F39E60" }
];

let bgLoaded=false, keychainLoaded=false, iconsLoaded=0;

/* ========= LOAD BACKGROUND ========= */
loader.load("./asset/clarity_bg.glb",
  (g) => {
    const bg = g.scene;
    bg.traverse((c) => {
      if (c.isMesh) {
        c.material = new THREE.MeshBasicMaterial({ map: c.material.map || null, toneMapped: false });
      }
    });
    bg.scale.set(3.35,3.35,3.35);
    bg.position.set(0,0,0);
    sceneMain.add(bg);
    sceneEnv.add(bg.clone());
    bgLoaded = true;
    tryUpdateCube();
  },
  undefined,
  (err) => console.error("bg load err", err)
);

/* ========= LOAD KEYCHAIN ========= */
loader.load("./asset/clarity_keychain.glb",
  (g) => {
    const model = g.scene;
    model.traverse((c) => {
      if (c.isMesh) {
        const lname = (c.name || "").toLowerCase();
        if (lname.includes("plastik") || lname.includes("plast")) {
          // use sharedGlassMat (the same instance)
          c.material = sharedGlassMat;
        } else if (lname.includes("besi") || lname.includes("metal")) {
          c.material = new THREE.MeshPhysicalMaterial({
            color: 0xffffff,
            metalness: 1,
            roughness: 0.2,
            envMap: cubeTarget.texture,
            envMapIntensity: 2
          });
        }
      }
    });

    sceneMain.add(model);
    keychainController = model.getObjectByName("Keychain Controler") || model.getObjectByName("Keychain Controller") || model;
    keychainController.scale.set(1.7,1.7,1.7);
    keychainController.position.z = 1.3;
    keychainLoaded = true;
    tryUpdateCube();
  },
  undefined,
  (err) => console.error("keychain load err", err)
);

/* ========= LOAD ICONS ========= */
function loadIcon(ic) {
  return new Promise((resolve) => {
    loader.load(ic.path, (g) => {
      const root = g.scene;
      root.scale.set(2.5,2.5,2.5);
      root.position.set(ic.pos.x, ic.pos.y, ic.pos.z);

      const iconMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(ic.color),
        roughness: 0.5,
        metalness: 0.15,
        envMap: cubeTarget.texture,
        envMapIntensity: 1.0
      });

      root.traverse((c) => {
        if (c.isMesh) {
          const n = (c.name || "").toLowerCase();
          if (n.includes("glass")) {
            c.material = sharedGlassMat;
            c.material.side = THREE.DoubleSide;
            c.material.transparent = true;
          } else {
            c.material = iconMat;
          }
        }
      });

      icons.push({
        name: ic.name,
        root,
        float: { amplitude: ic.amp, speed: ic.spd },
        mats: { iconMat }
      });

      sceneMain.add(root);
      resolve();
    }, undefined, (err) => {
      console.error("icon load err", ic.name, err);
      resolve();
    });
  });
}

Promise.all(iconList.map(i => loadIcon(i))).then(() => {
  iconsLoaded = iconList.length;
  tryUpdateCube();
});

/* ========= CUBECAM UPDATE (single) ========= */
function tryUpdateCube() {
  if (!bgLoaded || !keychainLoaded || iconsLoaded !== iconList.length) return;

  if (keychainController) keychainController.visible = false;

  // Create temp group of clones (bg already in sceneEnv)
  const tempGroup = new THREE.Group();
  sceneMain.children.forEach(ch => {
    // clone groups/meshes that are not lights or camera
    if (ch.type === "Group" || ch.type === "Mesh") {
      tempGroup.add(ch.clone());
    }
  });
  sceneEnv.add(tempGroup);

  cubeCam.update(renderer, sceneEnv);

  sceneEnv.remove(tempGroup);

  if (keychainController) keychainController.visible = true;
}

/* ========= GUI ========= */
let gui = null;
function buildGUI() {
  gui = new GUI({ width: 340 });
  gui.domElement.style.display = "none";

  // Lighting
  const lf = gui.addFolder("Lighting (intensity)");
  lf.add(keyLight, "intensity", 0, 5, 0.01).name("Key Light");
  lf.add(frontRect, "intensity", 0, 5, 0.01).name("Front Light");
  lf.add(rimLight, "intensity", 0, 5, 0.01).name("Rim Light");
  lf.add(hemi, "intensity", 0, 3, 0.01).name("Hemisphere");
  lf.add(renderer, "toneMappingExposure", 0.2, 2, 0.01).name("Exposure");

  // Keychain
  const kf = gui.addFolder("Keychain");
  const keyParams = {
    rotationSpeed: 0.01,
    moveStrength: 0.15,
    lerpSpeed: 0.05,
    playIdle: true
  };
  kf.add(keyParams, "rotationSpeed", 0.001, 0.03, 0.001).name("Rotation Speed");
  kf.add(keyParams, "moveStrength", 0.01, 0.5, 0.01).name("Follow Strength");
  kf.add(keyParams, "lerpSpeed", 0.01, 0.12, 0.005).name("Lerp Speed");
  kf.add(keyParams, "playIdle").name("Idle Rotation");

  // Shared glass GUI
  const gm = gui.addFolder("Shared Glass (Keychain & Cubes)");
  gm.add(sharedGlassMat, "transmission", 0, 1, 0.01).name("Transmission");
  gm.add(sharedGlassMat, "opacity", 0.15, 1, 0.01).name("Opacity").onChange(v => {
    sharedGlassMat.opacity = v;
    sharedGlassMat.transparent = (v < 1.0) || (sharedGlassMat.transmission < 1.0);
  });
  gm.add(sharedGlassMat, "roughness", 0, 1, 0.01).name("Roughness");
  gm.add(sharedGlassMat, "thickness", 0, 1, 0.01).name("Thickness");
  gm.add(sharedGlassMat, "ior", 1.0, 2.0, 0.01).name("IOR");
  gm.add(sharedGlassMat, "envMapIntensity", 0, 3, 0.05).name("Env Intensity");
  gm.add(sharedGlassMat, "attenuationDistance", 0, 3, 0.01).name("AttenuationDist");
  const attColor = { color: `#${sharedGlassMat.attenuationColor.getHexString()}` };
  gm.addColor(attColor, "color").name("AttenuationColor").onChange((val) => {
    sharedGlassMat.attenuationColor = new THREE.Color(val);
  });

  // Icons GUI
  icons.forEach((ic) => {
    const f = gui.addFolder(ic.name.toUpperCase());
    const posF = f.addFolder("Position");
    posF.add(ic.root.position, "x", -2, 2, 0.01).name("X");
    posF.add(ic.root.position, "y", -2, 2, 0.01).name("Y");
    posF.add(ic.root.position, "z", -1, 2, 0.01).name("Z");
    const floatF = f.addFolder("Float");
    floatF.add(ic.float, "amplitude", 0, 0.3, 0.01).name("Amplitude");
    floatF.add(ic.float, "speed", 0.2, 2, 0.01).name("Speed");
    const matF = f.addFolder("Material");
    matF.addColor(ic.mats.iconMat, "color").name("Color");
    matF.add(ic.mats.iconMat, "roughness", 0, 1, 0.01).name("Roughness");
    matF.add(ic.mats.iconMat, "metalness", 0, 1, 0.01).name("Metalness");
  });

  // toggle GUI with H
  window.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === "h") {
      gui.domElement.style.display = gui.domElement.style.display === "none" ? "block" : "none";
    }
  });

  window._CLARITY_KEY_PARAMS = {
    rotationSpeed: 0.01,
    moveStrength: 0.15,
    lerpSpeed: 0.05,
    playIdle: true
  };
}

setTimeout(() => buildGUI(), 800);

/* ========= INTERACTION ========= */
const pointer = { x: 0, y: 0 };
window.addEventListener("mousemove", (e) => {
  pointer.x = (e.clientX / window.innerWidth - 0.5) * 2;
  pointer.y = -(e.clientY / window.innerHeight - 0.5) * 2;
});

/* ========= ANIMATION ========= */
let lastTime = performance.now();
function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = (now - lastTime) * 0.001;
  lastTime = now;

  const kp = window._CLARITY_KEY_PARAMS || { rotationSpeed: 0.01, moveStrength: 0.15, lerpSpeed: 0.05, playIdle: true };

  if (keychainController) {
    if (kp.playIdle) keychainController.rotation.y += kp.rotationSpeed;
    keychainController.rotation.x = 1;
    keychainController.rotation.z = 0.6;

    const targetX = pointer.x * kp.moveStrength;
    const targetY = pointer.y * kp.moveStrength;
    keychainController.position.x += (targetX - keychainController.position.x) * kp.lerpSpeed;
    keychainController.position.y += (targetY - keychainController.position.y) * kp.lerpSpeed;
  }

  const t = performance.now() * 0.001;
  icons.forEach((ic, i) => {
    const phase = i * 0.73;
    const baseY = ic.root.userData.baseY ?? ic.root.position.y;
    ic.root.userData.baseY = baseY;
    ic.root.position.y = baseY + Math.sin((t + phase) * ic.float.speed) * ic.float.amplitude;
  });

  renderer.render(sceneMain, camera);
}

animate();

/* ========= RESIZE ========= */
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
