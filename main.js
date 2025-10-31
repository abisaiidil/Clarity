// update 78
import * as THREE from "three";
import { GLTFLoader } from "GLTFLoader";
import RectAreaLightUniformsLib from "RectAreaLightUniformsLib";
import GUI from "lil-gui";

// ---------- CONFIG / PERF TWEAK ----------
const CUBE_RESOLUTION = 512;       // 512 is a good perf/quality tradeoff
const CUBE_UPDATE_INTERVAL = 12;   // update envmap every 12 frames => lighter
const ICON_STANDARD_SCALE = 2.5;
const ICON_STANDARD_Z = 0.3;

// ---------- GLOBALS ----------
let renderer, sceneMain, sceneEnv, camera;
let cubeCam, cubeTarget;
let keychainController = null;
let icons = [];
let sharedGlassMat = null;
let frameCount = 0;

let gui, guiVisible = false;

// interaction params (you've been tweaking these)
const params = {
  rotationSpeed: 0.01,
  moveStrength: 0.15,
  lerpSpeed: 0.05,
  toneExposure: 1.0
};

// simple cursor tracking
const cursor = { x: 0, y: 0 };

// ---------- Init ----------
function init() {
  const canvas = document.getElementById("webgl");

  // renderer
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = params.toneExposure;
  renderer.physicallyCorrectLights = true;
  renderer.shadowMap.enabled = false; // explicit: no shadows for perf

  // scenes
  sceneMain = new THREE.Scene();
  sceneMain.background = new THREE.Color(0xffffff);
  sceneEnv = new THREE.Scene();

  // camera
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0, 3);

  // cube camera (for reflections). lower res + infrequent updates to save perf
  cubeTarget = new THREE.WebGLCubeRenderTarget(CUBE_RESOLUTION, {
    format: THREE.RGBAFormat,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter
  });
  cubeCam = new THREE.CubeCamera(0.1, 100, cubeTarget);
  sceneEnv.add(cubeCam);

  // lighting approximation of your Blender setup:
  // - small key (Directional approximating small area pointing downward)
  // - large soft front RectAreaLight for overall soft illumination
  RectAreaLightUniformsLib.init && RectAreaLightUniformsLib.init();

  const keyArea = new THREE.DirectionalLight(0xffffff, 2.8); // small strong key
  keyArea.position.set(1.8, 2.8, 1.6);
  keyArea.target.position.set(0, 0, 0);
  sceneMain.add(keyArea);
  sceneMain.add(keyArea.target);

  // big soft front
  const rect = new THREE.RectAreaLight(0xffffff, 1.8, 8, 4.2); // wide soft panel
  rect.position.set(0, 0.5, 3.2);
  rect.lookAt(0, 0, 0);
  sceneMain.add(rect);

  // little ambient filler
  const amb = new THREE.AmbientLight(0xffffff, 0.8);
  sceneMain.add(amb);

  // keep copies into sceneEnv for envmap captures (so cubeCam sees same lights)
  sceneEnv.add(keyArea.clone(), rect.clone(), amb.clone());

  // loader
  const loader = new GLTFLoader();

  // background (basic textured plane inside GLB) - keep as MeshBasicMaterial (no tone mapping)
  loader.load("./asset/clarity_bg.glb", (g) => {
    const bg = g.scene;
    bg.scale.set(3.35, 3.35, 3.35);
    bg.position.set(0, 0, 0);
    bg.traverse((c) => {
      if (c.isMesh) {
        c.material = new THREE.MeshBasicMaterial({ map: c.material.map || null, toneMapped: false });
        c.renderOrder = 0;
      }
    });
    sceneMain.add(bg);
    sceneEnv.add(bg.clone());
  });

  // keychain model
  loader.load("./asset/clarity_keychain.glb", (g) => {
    const model = g.scene;
    sceneMain.add(model);

    keychainController = model.getObjectByName("Keychain Controler") || model;
    keychainController.scale.set(1.7, 1.7, 1.7);
    keychainController.position.z = 1.3;

    model.traverse((c) => {
      if (c.isMesh) {
        const n = c.name.toLowerCase();
        if (n.includes("plastik")) {
          // keychain glass material (separate from icon cubes)
          c.material = new THREE.MeshPhysicalMaterial({
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
          c.material = new THREE.MeshPhysicalMaterial({
            color: 0xffffff,
            metalness: 1,
            roughness: 0.2,
            envMap: cubeTarget.texture,
            envMapIntensity: 2
          });
        }
        c.castShadow = false;
        c.receiveShadow = false;
      }
    });

    // after keychain model, build GUI (some controls need keychain materials)
    // GUI will be (re)built later once icons are loaded so we can show all icon folders
  });

  // create single shared glass material for icon cubes
  sharedGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.2,        // your requested default
    metalness: 0,
    transmission: 1,
    ior: 1.33,
    thickness: 0,
    envMap: cubeTarget.texture,
    envMapIntensity: 1.5,
    clearcoat: 1,
    clearcoatRoughness: 0.08
  });

  // ICONS array with your latest positions/colors/amplitudes
  const iconData = [
    { name: "keys", path: "./asset/1_keys.glb", pos:{x:0.12,y:0.01,z:0.3}, amp:0.05, spd:0.9, color:"#A888B5" },
    { name: "locker", path: "./asset/5_locker.glb", pos:{x:0.12,y:0.19,z:0.3}, amp:0.08, spd:1.1, color:"#FF7BCA" },
    { name: "home", path: "./asset/2_home.glb", pos:{x:-0.16,y:0.15,z:0.3}, amp:0.09, spd:1.0, color:"#FFD6BA" },
    { name: "suitcase", path: "./asset/6_suitcase.glb", pos:{x:-0.16,y:0.05,z:0.3}, amp:0.07, spd:0.8, color:"#A594F9" },
    { name: "bag", path: "./asset/4_bag.glb", pos:{x:-0.06,y:0.12,z:0.3}, amp:0.06, spd:1.2, color:"#FDB7EA" },
    { name: "backpack", path: "./asset/3_backpack.glb", pos:{x:0.12,y:0.08,z:0.3}, amp:0.12, spd:0.9, color:"#F39E60" },
  ];

  // load icons (Promise all to ensure GUI rebuild after load)
  const iconPromises = iconData.map((ic) => {
    return new Promise((res) => {
      loader.load(ic.path, (g) => {
        const root = g.scene;
        root.name = ic.name;
        root.scale.set(ICON_STANDARD_SCALE, ICON_STANDARD_SCALE, ICON_STANDARD_SCALE);
        root.position.set(ic.pos.x, ic.pos.y, ic.pos.z);

        // per-icon material for the colored symbol(s)
        const iconColorMat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(ic.color),
          roughness: 0.5,
          metalness: 0.15,
          envMap: cubeTarget.texture,
          envMapIntensity: 1
        });

        root.traverse((c) => {
          if (c.isMesh) {
            const n = c.name.toLowerCase();
            if (n.includes("glass")) {
              // assign shared glass material (force reference)
              c.material = sharedGlassMat;
            } else {
              c.material = iconColorMat;
            }
            c.castShadow = false;
            c.receiveShadow = false;
          }
        });

        icons.push({
          name: ic.name,
          root,
          loct: root,   // in your exports loct_ is top; here we assume root is loct
          rot: root,    // for simplicity we keep rot as root (you can adapt if your glbs contain separate empties)
          float: { amplitude: ic.amp, speed: ic.spd },
          mats: { iconMat: iconColorMat, glassMat: sharedGlassMat }
        });

        sceneMain.add(root);
        res();
      });
    });
  });

  // when all icons loaded -> setup GUI (now we have proper references)
  Promise.all(iconPromises).then(() => {
    buildGUI({ keyArea, rect, amb });
  });

  // event listeners
  window.addEventListener("mousemove", (e) => {
    cursor.x = (e.clientX / window.innerWidth - 0.5) * 2;
    cursor.y = -(e.clientY / window.innerHeight - 0.5) * 2;
  });
  window.addEventListener("resize", onResize);
  window.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === "h") toggleGUI();
  });

  // start loop
  animate();
}

// ---------- GUI ----------
function buildGUI(lights) {
  gui = new GUI({ width: 320 });
  gui.domElement.style.display = "none";

  // Lighting (expose intensity + rect size)
  const lf = gui.addFolder("Lighting (approx Blender)");
  const keyF = lf.addFolder("Small Key (Directional)");
  keyF.add(lights.keyArea, "intensity", 0, 6, 0.05).name("Intensity");
  keyF.add(lights.keyArea.position, "x", -10, 10, 0.1);
  keyF.add(lights.keyArea.position, "y", -10, 10, 0.1);
  keyF.add(lights.keyArea.position, "z", -10, 10, 0.1);

  const rectF = lf.addFolder("Front Soft Panel (Rect)");
  rectF.add(lights.rect, "intensity", 0, 4, 0.05).name("Intensity");
  rectF.add(lights.rect, "width", 1, 12, 0.1).name("Width");
  rectF.add(lights.rect, "height", 1, 8, 0.1).name("Height");

  lf.add(renderer, "toneMappingExposure", 0.2, 2.5, 0.01).name("Exposure");

  // Keychain controls
  const kc = gui.addFolder("Keychain");
  const keyCtl = kc.addFolder("Control");
  // scale: manipulate x only and sync to y/z
  keyCtl.add(keychainController?.scale ?? {x:1}, "x", 0.5, 3, 0.01).name("Scale").onChange(v => {
    if (keychainController) keychainController.scale.set(v, v, v);
  });
  keyCtl.add(keychainController?.position ?? {z:1.3}, "z", -1, 3, 0.01).name("Z");
  keyCtl.add(params, "moveStrength", 0.02, 0.5, 0.01).name("Move Strength");
  keyCtl.add(params, "lerpSpeed", 0.01, 0.12, 0.005).name("Lerp Speed");
  keyCtl.add(params, "rotationSpeed", 0.001, 0.03, 0.001).name("Rotation Speed");
  keyCtl.add({toggle:()=>rotationEnableToggle()}, "toggle").name("Toggle Idle");

  // Keychain materials (assume first glass/metal present)
  const sampleGlass = keychainController ? findFirstMaterialByName(keychainController, "plastik") : null;
  const sampleMetal = keychainController ? findFirstMaterialByName(keychainController, "besi") : null;
  if (sampleGlass) {
    const gmat = sampleGlass.material;
    const gf = kc.addFolder("Glass Material");
    gf.add(gmat, "transmission", 0, 1, 0.01);
    gf.add(gmat, "ior", 1, 2, 0.01);
    gf.add(gmat, "thickness", 0, 2, 0.01);
    gf.add(gmat, "roughness", 0, 1, 0.01);
    gf.add(gmat, "envMapIntensity", 0, 3, 0.1);
  }
  if (sampleMetal) {
    const mmat = sampleMetal.material;
    const mf = kc.addFolder("Metal Material");
    mf.add(mmat, "roughness", 0, 1, 0.01);
    mf.add(mmat, "envMapIntensity", 0, 3, 0.1);
  }

  // Icons: shared glass material + per icon controls
  const iconsF = gui.addFolder("Icons");
  const cubeF = iconsF.addFolder("Glass Cube (shared)");
  cubeF.add(sharedGlassMat, "roughness", 0, 1, 0.01).name("roughness");
  cubeF.add(sharedGlassMat, "thickness", 0, 1, 0.01).name("thickness");
  cubeF.add(sharedGlassMat, "envMapIntensity", 0, 3, 0.1).name("envMapIntensity");

  // per-icon folders
  icons.forEach((ic) => {
    const f = iconsF.addFolder(ic.name.toUpperCase());
    const posF = f.addFolder("Location");
    posF.add(ic.loct.position, "x", -2, 2, 0.01);
    posF.add(ic.loct.position, "y", -2, 2, 0.01);
    posF.add(ic.loct.position, "z", -1, 2, 0.01);
    const rotF = f.addFolder("Rotation");
    rotF.add(ic.rot.rotation, "x", 0, Math.PI*2, 0.01).name("rotX");
    rotF.add(ic.rot.rotation, "y", 0, Math.PI*2, 0.01).name("rotY");
    rotF.add(ic.rot.rotation, "z", 0, Math.PI*2, 0.01).name("rotZ");
    f.add(ic.root.scale, "x", 0.5, 4, 0.1).name("Scale").onChange(v => ic.root.scale.set(v,v,v));
    const floatF = f.addFolder("Float");
    floatF.add(ic.float, "amplitude", 0, 0.3, 0.01);
    floatF.add(ic.float, "speed", 0.2, 2, 0.01);
    const matF = f.addFolder("Material");
    matF.addColor(ic.mats.iconMat, "color").name("color");
    matF.add(ic.mats.iconMat, "roughness", 0, 1, 0.01);
    matF.add(ic.mats.iconMat, "metalness", 0, 1, 0.01);
    matF.add(ic.mats.iconMat, "envMapIntensity", 0, 3, 0.1);
  });
}

// small helper: find first mesh whose name contains token (loose)
function findFirstMaterialByName(root, token) {
  let found = null;
  root.traverse((c) => {
    if (!found && c.isMesh && c.name.toLowerCase().includes(token)) found = c;
  });
  return found;
}

function rotationEnableToggle() { rotationEnabled = !rotationEnabled; }

// ---------- RESIZE ----------
function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// ---------- ANIMATE ----------
function animate() {
  requestAnimationFrame(animate);

  // keychain idle + follow
  if (keychainController) {
    if (rotationEnabled) keychainController.rotation.y += params.rotationSpeed;
    // maintain stylistic x,z
    keychainController.rotation.x = 1;
    keychainController.rotation.z = 0.6;

    const targetX = cursor.x * params.moveStrength;
    const targetY = cursor.y * params.moveStrength;
    keychainController.position.x += (targetX - keychainController.position.x) * params.lerpSpeed;
    keychainController.position.y += (targetY - keychainController.position.y) * params.lerpSpeed;

    // update cubeCam only periodically for perf
    frameCount++;
    if (frameCount % CUBE_UPDATE_INTERVAL === 0) {
      keychainController.visible = false;
      cubeCam.update(renderer, sceneEnv);
      keychainController.visible = true;
    }
  }

  // icons floating (sinusoidal) with slight randomized phase so they don't sync
  const t = performance.now() * 0.001;
  icons.forEach((ic, idx) => {
    const phase = idx * 0.73; // simple offset
    const baseY = ic.loct.userData.baseY ?? ic.loct.position.y;
    ic.loct.userData.baseY = baseY;
    // small organic rotation during float can be added later; for now vertical float
    ic.loct.position.y = baseY + Math.sin((t + phase) * ic.float.speed) * ic.float.amplitude;
  });

  renderer.render(sceneMain, camera);
}

// ---------- GUI TOGGLE ----------
function toggleGUI() {
  if (!gui) return;
  guiVisible = !guiVisible;
  gui.domElement.style.display = guiVisible ? "block" : "none";
}

// ---------- START ----------
init();
window.addEventListener("resize", onResize);
