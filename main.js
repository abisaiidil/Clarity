// main.js — Update final (implementasi semua rekomendasi)
// Menggunakan importmap bare specifiers dari index.html
import * as THREE from "three";
import { GLTFLoader } from "GLTFLoader";
import { RectAreaLightUniformsLib } from "RectAreaLightUniformsLib";
import GUI from "lil-gui";

/*
  Ringkasan:
  - Shared glass material dengan Fresnel highlight (onBeforeCompile)
  - Lighting: RectArea (soft front), Hemisphere (ambient fill), Directional rim
  - Static cubeCamera update ONCE setelah load agar refleksi konsisten
  - No shadows (untuk performa)
  - GUI (H toggle)
*/

// ----------------------- PARAMS -----------------------
const PARAMS = {
  // interaction
  rotationSpeed: 0.01,
  moveStrength: 0.15,
  lerpSpeed: 0.05,
  rotationEnabled: true,

  // lighting baseline (bisa di-GUI tweak)
  keyLightIntensity: 2.0,    // small top/front area
  frontLightIntensity: 1.6,  // big soft rect
  rimLightIntensity: 0.8,
  hemiIntensity: 0.8,
  exposure: 1.0,

  // shared glass defaults
  glass_roughness: 0.05,
  glass_thickness: 0.05,
  glass_envIntensity: 2.0,
  glass_ior: 1.4,

  // icon defaults
  icon_standard_scale: 2.5,
  icon_standard_z: 0.3
};

const canvas = document.getElementById("webgl");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

// Modern Three.js settings (r155+)
renderer.useLegacyLights = false;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = PARAMS.exposure;
renderer.shadowMap.enabled = false; // off for perf

const sceneMain = new THREE.Scene();
sceneMain.background = new THREE.Color(0xffffff);
const sceneEnv = new THREE.Scene(); // mirrored scene used for cube camera capture

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 3);

// cube camera for reflections (static update once)
const CUBE_RES = 512;
const cubeTarget = new THREE.WebGLCubeRenderTarget(CUBE_RES, {
  format: THREE.RGBAFormat,
  generateMipmaps: true,
  minFilter: THREE.LinearMipmapLinearFilter
});
const cubeCam = new THREE.CubeCamera(0.1, 100, cubeTarget);
sceneEnv.add(cubeCam);

// init RectArea lib
RectAreaLightUniformsLib.init();

// ----------------------- LIGHTING -----------------------
// 1) small top/front "key" (Directional used as small focused source)
// 2) front large RectArea = softbox
// 3) rim light (directional) to separate silhouettes
// 4) hemisphere light for uniform ambient fill

const keyLight = new THREE.DirectionalLight(0xffffff, PARAMS.keyLightIntensity);
keyLight.position.set(1.2, 2.0, 1.8);
keyLight.target.position.set(0, 0, 0);
sceneMain.add(keyLight, keyLight.target);

const frontRect = new THREE.RectAreaLight(0xffffff, PARAMS.frontLightIntensity, 6, 3.5);
frontRect.position.set(0, 0.6, 2.6);
frontRect.lookAt(0, 0, 0);
sceneMain.add(frontRect);

const rimLight = new THREE.DirectionalLight(0xffffff, PARAMS.rimLightIntensity);
rimLight.position.set(-1.8, 1.8, -1.8);
rimLight.target.position.set(0, 0, 0);
sceneMain.add(rimLight, rimLight.target);

const hemi = new THREE.HemisphereLight(0xf6f6ff, 0xf2e9dc, PARAMS.hemiIntensity);
sceneMain.add(hemi);

// Also add clones to sceneEnv so cubeCam sees similar lighting
sceneEnv.add(keyLight.clone(), frontRect.clone(), rimLight.clone(), hemi.clone());

// ----------------------- SHARED GLASS MATERIAL -----------------------
let sharedGlassMat = new THREE.MeshPhysicalMaterial({
  color: 0xffffff,
  roughness: PARAMS.glass_roughness,
  metalness: 0,
  transmission: 1,
  ior: PARAMS.glass_ior,
  thickness: PARAMS.glass_thickness,
  envMap: cubeTarget.texture,
  envMapIntensity: PARAMS.glass_envIntensity,
  clearcoat: 1,
  clearcoatRoughness: 0.05
});

// Add small Fresnel highlight via onBeforeCompile to avoid black edges
(function addFresnelToMaterial(mat) {
  mat.onBeforeCompile = function (shader) {
    shader.uniforms.uFresnelBoost = { value: 0.6 };
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `#include <dithering_fragment>
      // fresnel highlight (subtle)
      float fresnel = pow(1.0 - dot(normalize(vNormal), normalize(vViewPosition)), 2.0);
      vec3 fresnelTint = mix(vec3(1.0), vec3(1.05,1.05,1.05), fresnel * uFresnelBoost);
      gl_FragColor.rgb *= fresnelTint;
      `
    );
  };
})(sharedGlassMat);

// ----------------------- LOADER & ASSET NAMES -----------------------
const loader = new GLTFLoader();

let keychainController = null;
const icons = []; // { name, root, float:{amplitude,speed}, mats:{iconMat} }
const iconList = [
  { name: "keys", path: "./asset/1_keys.glb", pos:{x:0.12,y:0.01,z:PARAMS.icon_standard_z}, amp:0.05, spd:0.9, color:"#A888B5" },
  { name: "locker", path: "./asset/5_locker.glb", pos:{x:0.12,y:0.19,z:PARAMS.icon_standard_z}, amp:0.08, spd:1.1, color:"#FF7BCA" },
  { name: "home", path: "./asset/2_home.glb", pos:{x:-0.16,y:0.15,z:PARAMS.icon_standard_z}, amp:0.09, spd:1.0, color:"#FFD6BA" },
  { name: "suitcase", path: "./asset/6_suitcase.glb", pos:{x:-0.16,y:0.05,z:PARAMS.icon_standard_z}, amp:0.07, spd:0.8, color:"#A594F9" },
  { name: "bag", path: "./asset/4_bag.glb", pos:{x:-0.06,y:0.12,z:PARAMS.icon_standard_z}, amp:0.06, spd:1.2, color:"#FDB7EA" },
  { name: "backpack", path: "./asset/3_backpack.glb", pos:{x:0.12,y:0.08,z:PARAMS.icon_standard_z}, amp:0.12, spd:0.9, color:"#F39E60" }
];

let bgLoaded = false, keychainLoaded = false, iconsLoaded = 0;

// ----------------------- LOAD BACKGROUND -----------------------
loader.load("./asset/clarity_bg.glb",
  (g) => {
    const bg = g.scene;
    // use MeshBasicMaterial to keep bg color consistent
    bg.traverse((c) => {
      if (c.isMesh) {
        c.material = new THREE.MeshBasicMaterial({ map: c.material.map || null, toneMapped: false });
      }
    });
    // default transform (user can tweak via GUI later)
    bg.scale.set(3.35, 3.35, 3.35);
    bg.position.set(0, 0, 0);
    sceneMain.add(bg);
    sceneEnv.add(bg.clone());
    bgLoaded = true;
    tryUpdateCube();
  },
  undefined,
  (err) => console.error("bg load err", err)
);

// ----------------------- LOAD KEYCHAIN -----------------------
loader.load("./asset/clarity_keychain.glb",
  (g) => {
    const model = g.scene;
    model.traverse((c) => {
      if (c.isMesh) {
        const lname = (c.name || "").toLowerCase();
        if (lname.includes("plastik") || lname.includes("plast")) {
          c.material = sharedGlassMat.clone(); // keychain can reuse same params but clone to tweak individually if needed
          // keep a reference to glass mats on keychain parts if needed
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
    // find controller empty - try both name variants
    keychainController = model.getObjectByName("Keychain Controler") || model.getObjectByName("Keychain Controller") || model;
    keychainController.scale.set(1.7,1.7,1.7);
    keychainController.position.z = 1.3;

    keychainLoaded = true;
    tryUpdateCube();
  },
  undefined,
  (err) => console.error("keychain load err", err)
);

// ----------------------- LOAD ICONS -----------------------
function loadIcon(ic) {
  return new Promise((resolve) => {
    loader.load(ic.path, (g) => {
      const root = g.scene;
      // standard transform
      root.scale.set(PARAMS.icon_standard_scale, PARAMS.icon_standard_scale, PARAMS.icon_standard_scale);
      root.position.set(ic.pos.x, ic.pos.y, ic.pos.z);

      // create icon color material
      const iconMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(ic.color),
        roughness: 0.5,
        metalness: 0.15,
        envMap: cubeTarget.texture,
        envMapIntensity: 1.0
      });

      // replace meshes: glass parts -> sharedGlassMat, icons -> iconMat
      root.traverse((c) => {
        if (c.isMesh) {
          const n = (c.name || "").toLowerCase();
          if (n.includes("glass")) {
            c.material = sharedGlassMat; // shared across all cubes
          } else {
            c.material = iconMat;
          }
        }
      });

      // push to icons array and scene
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
      resolve(); // resolve anyway to avoid blocking
    });
  });
}

Promise.all(iconList.map(i => loadIcon(i))).then(() => {
  iconsLoaded = iconList.length;
  tryUpdateCube();
});

// ----------------------- cube update once -----------------------
function tryUpdateCube() {
  // update cube once when all assets loaded (bg + keychain + icons)
  if (!bgLoaded || !keychainLoaded || iconsLoaded !== iconList.length) return;

  // temporarily hide keychain (so cubeCam won't capture it self-reflection strong)
  if (keychainController) keychainController.visible = false;

  // ensure sceneEnv has similar lights/elements
  // (we earlier cloned lights and bg; ensure icons geometry present)
  // For env capture, add icons & bg clones to sceneEnv (light clones already added)
  sceneEnv.add(...sceneMain.children.filter(c => c.type === "Mesh" || c.type === "Group").map(obj => obj.clone()));

  // do one-time cube update
  cubeCam.update(renderer, sceneEnv);

  // restore keychain
  if (keychainController) keychainController.visible = true;

  // all set — start animation loop (if not already)
}

// ----------------------- GUI -----------------------
let gui = null;
function buildGUI() {
  gui = new GUI({ width: 340 });
  gui.domElement.style.display = "none"; // hidden by default

  // Lighting folder
  const lightF = gui.addFolder("Lighting (intensity)");
  lightF.add(PARAMS, "keyLightIntensity", 0, 5, 0.05).name("Key Light").onChange(v => keyLight.intensity = v);
  lightF.add(PARAMS, "frontLightIntensity", 0, 5, 0.05).name("Front Light").onChange(v => frontRect.intensity = v);
  lightF.add(PARAMS, "rimLightIntensity", 0, 5, 0.05).name("Rim Light").onChange(v => rimLight.intensity = v);
  lightF.add(PARAMS, "hemiIntensity", 0, 3, 0.05).name("Hemisphere").onChange(v => hemi.intensity = v);
  lightF.add(PARAMS, "exposure", 0.2, 2.0, 0.01).name("Exposure").onChange(v => renderer.toneMappingExposure = v);

  // Keychain controls
  const kf = gui.addFolder("Keychain");
  const ctrl = kf.addFolder("Control");
  ctrl.add(PARAMS, "rotationSpeed", 0.001, 0.03, 0.001).name("Rotation Speed");
  ctrl.add(PARAMS, "moveStrength", 0.01, 0.5, 0.01).name("Follow Strength");
  ctrl.add(PARAMS, "lerpSpeed", 0.01, 0.12, 0.005).name("Lerp Speed");
  ctrl.add(PARAMS, "rotationEnabled").name("Idle Rotation");

  // Glass material (shared)
  const gm = kf.addFolder("Glass Material (shared)");
  gm.add(sharedGlassMat, "roughness", 0, 1, 0.01).name("Roughness");
  gm.add(sharedGlassMat, "thickness", 0, 1, 0.01).name("Thickness");
  gm.add(sharedGlassMat, "ior", 1.0, 2.0, 0.01).name("IOR").onChange(v => sharedGlassMat.ior = v);
  gm.add(sharedGlassMat, "envMapIntensity", 0, 3, 0.1).name("Env Intensity");

  // Icon glass folder (shared)
  const ig = gui.addFolder("Icon Glass (shared)");
  ig.add(sharedGlassMat, "roughness", 0, 1, 0.01).name("Roughness");
  ig.add(sharedGlassMat, "thickness", 0, 1, 0.01).name("Thickness");
  ig.add(sharedGlassMat, "envMapIntensity", 0, 3, 0.1).name("Env Intensity");

  // Icons: position + float + material
  icons.forEach((ic) => {
    const f = gui.addFolder(ic.name.toUpperCase());
    const posf = f.addFolder("Position");
    posf.add(ic.root.position, "x", -2, 2, 0.01).name("X");
    posf.add(ic.root.position, "y", -2, 2, 0.01).name("Y");
    posf.add(ic.root.position, "z", -1, 2, 0.01).name("Z");
    const floatF = f.addFolder("Float");
    floatF.add(ic.float, "amplitude", 0, 0.3, 0.01).name("Amplitude");
    floatF.add(ic.float, "speed", 0.2, 2.0, 0.01).name("Speed");
    const matF = f.addFolder("Material");
    matF.addColor(ic.mats.iconMat, "color").name("Color");
    matF.add(ic.mats.iconMat, "roughness", 0, 1, 0.01).name("Roughness");
    matF.add(ic.mats.iconMat, "metalness", 0, 1, 0.01).name("Metalness");
  });

  // Make gui accessible via H toggle
  window.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === "h") gui.domElement.style.display = (gui.domElement.style.display === "none") ? "block" : "none";
  });
}

// Build GUI after small timeout to ensure icons array ready
setTimeout(() => {
  buildGUI();
}, 700);

// ----------------------- INTERACTION -----------------------
const cursor = { x: 0, y: 0 };
window.addEventListener("mousemove", (e) => {
  cursor.x = (e.clientX / window.innerWidth - 0.5) * 2;
  cursor.y = -(e.clientY / window.innerHeight - 0.5) * 2;
});

// ----------------------- ANIMATION -----------------------
let lastTime = performance.now();
function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = (now - lastTime) * 0.001;
  lastTime = now;

  // Keychain movement + rotation
  if (keychainController) {
    if (PARAMS.rotationEnabled) keychainController.rotation.y += PARAMS.rotationSpeed;
    // fixed X & Z rotation like design
    keychainController.rotation.x = 1;
    keychainController.rotation.z = 0.6;

    const targetX = cursor.x * PARAMS.moveStrength;
    const targetY = cursor.y * PARAMS.moveStrength;
    keychainController.position.x += (targetX - keychainController.position.x) * PARAMS.lerpSpeed;
    keychainController.position.y += (targetY - keychainController.position.y) * PARAMS.lerpSpeed;
  }

  // icons float (sin + small random phase)
  const t = performance.now() * 0.001;
  icons.forEach((ic, i) => {
    const phase = i * 0.73; // per-icon offset so not in sync
    const baseY = ic.root.userData.baseY ?? ic.root.position.y;
    ic.root.userData.baseY = baseY;
    // small rotation while floating can be added later
    ic.root.position.y = baseY + Math.sin((t + phase) * ic.float.speed) * ic.float.amplitude;
  });

  renderer.render(sceneMain, camera);
}

animate();

// ----------------------- RESIZE -----------------------
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// End of file
