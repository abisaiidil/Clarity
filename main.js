// main.js — Update 85
import * as THREE from "three";
import { GLTFLoader } from "GLTFLoader";
import { RGBELoader } from "RGBELoader";
import GUI from "lil-gui";

/*
Features:
- Responsive fullscreen fit for background GLB (keeps aspect)
- HDRI via RGBELoader + PMREMGenerator
- ACES tone mapping + exposure control
- MeshPhysicalMaterial for glass + metal (attenuation, thickness)
- Small RectAreaLight for highlight (like Blender area)
- GUI for lighting, exposure, materials, camera fit
- Idle rotation + follow cursor + click toggle pause
*/

let renderer, scene, camera;
let keychainController = null;
let bgMain = null, bgEnv = null;
let pmremGenerator;
let clock = new THREE.Clock();

const canvas = document.getElementById("webgl");

// default params (tweakable via GUI)
const PARAMS = {
  // interaction
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

  // glass defaults
  glass_roughness: 0.25,
  glass_transmission: 1.0,
  glass_ior: 1.45,
  glass_thickness: 0.25,
  glass_attenuationDistance: 0.8,
  glass_envIntensity: 2.0,

  // metal defaults
  metal_roughness: 0.15,
  metal_metalness: 1.0,
  metal_envIntensity: 2.5,

  // camera fit controls
  cameraFitPadding: 0.02, // small padding so background not flush to edges
  cameraZoomMultiplier: 1.0
};

const cursor = { x: 0, y: 0 };
let idleRot = 0;

// light references
let keyLight, fillLight, rimLight, areaLight, ambientLight;

// materials arrays (for GUI to control instances)
const glassMaterials = [];
const metalMaterials = [];

// init
function init() {
  // renderer
  renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: true,
    alpha: true,
    powerPreference: "high-performance"
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = PARAMS.exposure;

  // scene + camera
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffffff);

  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.05, 200);
  camera.position.set(0, 0, 3);

  // PMREM generator
  pmremGenerator = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();

  // Lights
  keyLight = new THREE.DirectionalLight(0xffffff, PARAMS.keyLight);
  keyLight.position.set(3, 4, 5);

  fillLight = new THREE.DirectionalLight(0xffffff, PARAMS.fillLight);
  fillLight.position.set(-3, 2, 2);

  rimLight = new THREE.DirectionalLight(0xffffff, PARAMS.rimLight);
  rimLight.position.set(-3, 2, -4);

  // small area light to mimic a small studio lamp (adds crisp highlights)
  areaLight = new THREE.RectAreaLight(0xffffff, PARAMS.areaLight, 0.6, 0.6);
  areaLight.position.set(1.4, 1.4, 1.2);
  areaLight.lookAt(0, 0, 0);

  ambientLight = new THREE.AmbientLight(0xffffff, PARAMS.ambientLight);

  scene.add(keyLight, fillLight, rimLight, areaLight, ambientLight);

  // cube camera (optional) — used for envmap updates on dynamic scene
  const cubeTarget = new THREE.WebGLCubeRenderTarget(1024, {
    format: THREE.RGBAFormat,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter
  });
  const cubeCamera = new THREE.CubeCamera(0.1, 100, cubeTarget);
  scene.add(cubeCamera);

  // loaders
  const loader = new GLTFLoader();

  // load background first
  loader.load("./asset/clarity_bg.glb",
    (g) => {
      bgMain = g.scene;
      // keep original pivot/rotation
      bgMain.traverse((c) => {
        if (c.isMesh) {
          // preserve texture; use MeshBasic so it doesn't get affected by toneMapping
          const m = c.material;
          c.material = new THREE.MeshBasicMaterial({ map: m.map || null, toneMapped: false });
          c.material.map && (c.material.map.encoding = THREE.sRGBEncoding);
        }
      });
      scene.add(bgMain);
      // after load fit camera to bg
      fitBackgroundToViewport();
      console.log("✅ bg loaded");
    },
    undefined,
    (err) => console.error("❌ failed loading bg:", err)
  );

  // load keychain
  loader.load("./asset/clarity_keychain.glb",
    (g) => {
      const model = g.scene;
      // model default scale — will be adjusted by fitBackgroundToViewport later if needed
      model.scale.set(1.7, 1.7, 1.7);
      scene.add(model);

      // find controller empty
      keychainController = model.getObjectByName("Keychain Controler") ||
        model.getObjectByName("Keychain Controller") || model;

      // traverse and replace materials with PBR physical
      model.traverse((c) => {
        if (c.isMesh) {
          const name = c.name.toLowerCase();

          // glass part: match naming used in your .blend (plastik/plastic/glass)
          if (name.includes("plastik") || name.includes("plastik") || name.includes("plastic") || name.includes("glass")) {
            const glassMat = new THREE.MeshPhysicalMaterial({
              color: 0xffffff,
              roughness: PARAMS.glass_roughness,
              metalness: 0,
              transmission: PARAMS.glass_transmission,
              ior: PARAMS.glass_ior,
              thickness: PARAMS.glass_thickness,
              attenuationDistance: PARAMS.glass_attenuationDistance,
              attenuationColor: new THREE.Color(0xffffff),
              envMapIntensity: PARAMS.glass_envIntensity,
              clearcoat: 1,
              clearcoatRoughness: 0.05
            });
            c.material = glassMat;
            glassMaterials.push(glassMat);
            // ensure maps (if any) are sRGB
            if (c.material.map) c.material.map.encoding = THREE.sRGBEncoding;
          }

          // metal part: ring/metal
          else if (name.includes("besi") || name.includes("metal") || name.includes("ring")) {
            const metalMat = new THREE.MeshPhysicalMaterial({
              color: 0xffffff,
              metalness: PARAMS.metal_metalness,
              roughness: PARAMS.metal_roughness,
              envMapIntensity: PARAMS.metal_envIntensity,
              clearcoat: 1.0,
              clearcoatRoughness: 0.05
            });
            c.material = metalMat;
            metalMaterials.push(metalMat);
          } else {
            // fallback: keep as standard physical with reasonable defaults
            const fallback = new THREE.MeshPhysicalMaterial({
              color: c.material.color ? c.material.color.clone() : new THREE.Color(0xffffff),
              roughness: 0.4,
              metalness: 0,
              envMapIntensity: 1
            });
            c.material = fallback;
          }
        }
      });

      // initial fit for camera after both loaded
      fitBackgroundToViewport();
      console.log("✅ keychain loaded");

      // update env maps once scene is ready (we will update in render loop too)
    },
    undefined,
    (err) => console.error("❌ failed loading keychain:", err)
  );

  // load HDRI (PMREM) — non-blocking
  if (PARAMS.hdri) {
    const rgbe = new RGBELoader();
    rgbe.setPath("https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/");
    rgbe.load("studio_small_03_1k.hdr", (tex) => {
      const envMap = pmremGenerator.fromEquirectangular(tex).texture;
      scene.environment = envMap;
      // important: dispose original
      tex.dispose();
      console.log("✅ HDRI loaded (pmrem)");
    }, undefined, (err) => {
      console.warn("HDRI load failed:", err);
    });
  }

  // events
  window.addEventListener("resize", onWindowResize);
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("click", () => (PARAMS.pauseIdle = !PARAMS.pauseIdle));
  window.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === "h") toggleGUI();
    if (e.key === "0") fitBackgroundToViewport();
  });

  // GUI
  createGUI();

  // first resize
  onWindowResize();

  // start loop
  animate();
}

/* ---------- utilities ---------- */

function onMouseMove(e) {
  cursor.x = (e.clientX / window.innerWidth - 0.5) * 2;
  cursor.y = -(e.clientY / window.innerHeight - 0.5) * 2;
}

function onWindowResize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;

  // adapt FOV slightly with aspect to avoid extreme zooms
  const aspect = window.innerWidth / window.innerHeight;
  camera.fov = THREE.MathUtils.lerp(50, 65, Math.min(Math.max((aspect - 1) / 1.5, 0), 1));
  camera.updateProjectionMatrix();

  // if bg loaded, refit background scale to viewport
  if (bgMain) {
    fitBackgroundToViewport();
  }
}

// Fit background GLB to viewport height while preserving aspect and padding
function fitBackgroundToViewport() {
  if (!bgMain || !bgMain.isObject3D) return;

  // compute bounding box of bgMain
  const box = new THREE.Box3().setFromObject(bgMain);
  const size = new THREE.Vector3();
  box.getSize(size);

  // target: make bgMain height cover ~ 80-92% of viewport height (configurable)
  const viewportHeight = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * Math.abs(camera.position.z);
  const desiredViewportCoverage = 0.86 - PARAMS.cameraFitPadding; // 0..1
  const targetWorldHeight = viewportHeight * desiredViewportCoverage;

  if (size.y > 0.0001) {
    const scaleFactor = targetWorldHeight / size.y;
    bgMain.scale.setScalar(scaleFactor);
  } else {
    // fallback scale
    bgMain.scale.setScalar(3.35);
  }

  // ensure background stays a bit behind
  bgMain.position.z = -2.5;
}

// small convenience to create GUI
let gui;
function createGUI() {
  gui = new GUI({ width: 320 });
  gui.domElement.classList.add("lil-gui");

  // Lighting folder
  const fLight = gui.addFolder("Lighting");
  fLight.add(PARAMS, "hdri").name("Use HDRI").onChange((v) => {
    if (!v) {
      scene.environment = null;
    } else {
      // reload HDRI
      const rgbe = new RGBELoader();
      rgbe.setPath("https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/");
      rgbe.load("studio_small_03_1k.hdr", (tex) => {
        const envMap = pmremGenerator.fromEquirectangular(tex).texture;
        scene.environment = envMap;
        tex.dispose();
      });
    }
  });
  fLight.add(PARAMS, "exposure", 0.3, 2, 0.01).name("Exposure").onChange((v) => (renderer.toneMappingExposure = v));
  fLight.add(PARAMS, "keyLight", 0, 5, 0.01).name("Key").onChange((v) => keyLight.intensity = v);
  fLight.add(PARAMS, "fillLight", 0, 5, 0.01).name("Fill").onChange((v) => fillLight.intensity = v);
  fLight.add(PARAMS, "rimLight", 0, 5, 0.01).name("Rim").onChange((v) => rimLight.intensity = v);
  fLight.add(PARAMS, "areaLight", 0, 5, 0.01).name("Area").onChange((v) => areaLight.intensity = v);
  fLight.add(PARAMS, "ambientLight", 0, 2, 0.01).name("Ambient").onChange((v) => ambientLight.intensity = v);
  fLight.open();

  // Keychain controls
  const fKC = gui.addFolder("Keychain");
  fKC.add(PARAMS, "rotationSpeed", 0, 0.05, 0.001).name("Idle Rotation Speed");
  fKC.add(PARAMS, "moveStrength", 0, 1, 0.01).name("Follow Strength");
  fKC.add(PARAMS, "lerpSpeed", 0.01, 0.2, 0.005).name("Lerp Speed");
  fKC.add(PARAMS, "cameraZoomMultiplier", 0.6, 1.6, 0.01).name("Camera Zoom");
  fKC.add({ resetFit: () => fitBackgroundToViewport() }, "resetFit").name("Fit Background");
  fKC.open();

  // Glass material
  const fGlass = gui.addFolder("Glass Material (Keychain)");
  fGlass.add(PARAMS, "glass_roughness", 0, 1, 0.01).name("roughness").onChange(v => glassMaterials.forEach(m => m.roughness = v));
  fGlass.add(PARAMS, "glass_transmission", 0, 1, 0.01).name("transmission").onChange(v => glassMaterials.forEach(m => m.transmission = v));
  fGlass.add(PARAMS, "glass_ior", 1, 2, 0.01).name("ior").onChange(v => glassMaterials.forEach(m => m.ior = v));
  fGlass.add(PARAMS, "glass_thickness", 0, 1, 0.01).name("thickness").onChange(v => glassMaterials.forEach(m => m.thickness = v));
  fGlass.add(PARAMS, "glass_attenuationDistance", 0, 2, 0.01).name("attenuationDist").onChange(v => glassMaterials.forEach(m => m.attenuationDistance = v));
  fGlass.add(PARAMS, "glass_envIntensity", 0, 4, 0.1).name("envMapIntensity").onChange(v => glassMaterials.forEach(m => m.envMapIntensity = v));
  fGlass.open();

  // Metal material
  const fMetal = gui.addFolder("Metal Material (Keychain)");
  fMetal.add(PARAMS, "metal_roughness", 0, 1, 0.01).name("roughness").onChange(v => metalMaterials.forEach(m => m.roughness = v));
  fMetal.add(PARAMS, "metal_metalness", 0, 1, 0.01).name("metalness").onChange(v => metalMaterials.forEach(m => m.metalness = v));
  fMetal.add(PARAMS, "metal_envIntensity", 0, 4, 0.1).name("envMapIntensity").onChange(v => metalMaterials.forEach(m => m.envMapIntensity = v));
  fMetal.open();
}

// show/hide GUI
function toggleGUI() {
  if (!gui) return;
  gui.domElement.style.display = gui.domElement.style.display === "none" ? "" : "none";
}

/* ---------- render loop ---------- */
function animate() {
  requestAnimationFrame(animate);

  // update lights from params in case user changed values programmatically
  keyLight.intensity = PARAMS.keyLight;
  fillLight.intensity = PARAMS.fillLight;
  rimLight.intensity = PARAMS.rimLight;
  areaLight.intensity = PARAMS.areaLight;
  ambientLight.intensity = PARAMS.ambientLight;
  renderer.toneMappingExposure = PARAMS.exposure;

  // update materials envMap if a scene.environment is present (pmrem)
  if (scene.environment && glassMaterials.length) {
    glassMaterials.forEach(m => {
      if (m.envMap !== scene.environment) {
        m.envMap = scene.environment;
        m.needsUpdate = true;
      }
    });
  }
  if (scene.environment && metalMaterials.length) {
    metalMaterials.forEach(m => {
      if (m.envMap !== scene.environment) {
        m.envMap = scene.environment;
        m.needsUpdate = true;
      }
    });
  }

  // idle rotation + follow cursor
  if (keychainController) {
    if (!PARAMS.pauseIdle) {
      idleRot += PARAMS.rotationSpeed;
      keychainController.rotation.y = idleRot;
      // keep X/Z baseline
      keychainController.rotation.x = 1;
      keychainController.rotation.z = 0.6;
    }

    // follow movement (lerp)
    const targetX = cursor.x * PARAMS.moveStrength;
    const targetY = cursor.y * PARAMS.moveStrength;
    keychainController.position.x += (targetX - keychainController.position.x) * PARAMS.lerpSpeed;
    keychainController.position.y += (targetY - keychainController.position.y) * PARAMS.lerpSpeed;
  }

  renderer.render(scene, camera);
}

init();
