import * as THREE from "three";
import { GLTFLoader } from "GLTFLoader";
import GUI from "lil-gui";

let sceneMain, sceneEnv, camera, renderer;
let cubeCam, cubeTarget;
let keychainController;
let bgMain, bgEnv;
let frontGlass, frontGlassEnv;
let glassMeshes = [];
let gui, guiVisible = false;

const cursor = { x: 0, y: 0 };
let idleRotation = 0;
let enableRotation = true;
const params = {
  moveStrength: 0.15,
  lerpSpeed: 0.04,
  rotationSpeed: 0.004,
  keyLightIntensity: 5,
  frontGlassZ: 0.3,
  frontGlassScale: 3.35,
};

function init() {
  const canvas = document.getElementById("webgl");

  // --- SCENE SETUP ---
  sceneMain = new THREE.Scene();
  sceneMain.background = new THREE.Color(0xffffff);

  sceneEnv = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0, 3);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);

  // --- LIGHTING ---
  const keyLight = new THREE.DirectionalLight(0xffffff, params.keyLightIntensity);
  keyLight.position.set(3, 4, 5);

  const fillLight = new THREE.HemisphereLight(0xf5f5f5, 0xcccccc, 0.9);
  const rimLight = new THREE.DirectionalLight(0xffffff, 1);
  rimLight.position.set(-3, 2, -4);
  const ambLight = new THREE.AmbientLight(0xffffff, 0.5);

  sceneMain.add(keyLight, fillLight, rimLight, ambLight);
  sceneEnv.add(keyLight.clone(), fillLight.clone(), rimLight.clone(), ambLight.clone());

  // --- CUBECAMERA UNTUK REFRAKSI ---
  cubeTarget = new THREE.WebGLCubeRenderTarget(1024, {
    format: THREE.RGBAFormat,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
  });
  cubeCam = new THREE.CubeCamera(0.1, 100, cubeTarget);
  sceneEnv.add(cubeCam);

  const loader = new GLTFLoader();

  // --- BACKGROUND ---
  loader.load(
    "./asset/clarity_bg.glb",
    (gltf) => {
      bgMain = gltf.scene;
      bgEnv = bgMain.clone();

      bgMain.position.set(0, 0, 0);
      bgEnv.position.set(0, 0, 0);
      bgMain.scale.set(3.35, 3.35, 3.35);
      bgEnv.scale.set(3.35, 3.35, 3.35);

      bgMain.traverse((child) => {
        if (child.isMesh) {
          child.material = new THREE.MeshBasicMaterial({
            map: child.material.map || null,
            toneMapped: false,
          });
        }
      });
      bgEnv.traverse((child) => {
        if (child.isMesh) {
          child.material = new THREE.MeshBasicMaterial({
            map: child.material.map || null,
            toneMapped: false,
          });
        }
      });

      sceneMain.add(bgMain);
      sceneEnv.add(bgEnv);
      console.log("✅ clarity_bg.glb dimuat");
    },
    undefined,
    (err) => console.error("❌ Gagal memuat clarity_bg.glb:", err)
  );

  // --- KEYCHAIN ---
  loader.load(
    "./asset/clarity_keychain.glb",
    (gltf) => {
      const model = gltf.scene;
      model.scale.set(1.7, 1.7, 1.7);
      model.position.set(0, 0, 1.12);
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
              roughness: 0.4,
              metalness: 0,
              transmission: 1,
              ior: 1.3,
              thickness: 0.1,
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
      console.log("✅ clarity_keychain.glb dimuat");
    },
    undefined,
    (err) => console.error("❌ Gagal memuat clarity_keychain.glb:", err)
  );

  // --- FRONT GLASS LAYER (plane kaca di depan background) ---
  const glassPlaneGeo = new THREE.PlaneGeometry(6, 3.5);
  const glassPlaneMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.3,
    metalness: 0,
    transmission: 1,
    ior: 1.35,
    thickness: 0.1,
    envMap: cubeTarget.texture,
    envMapIntensity: 1.0,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
  });
  frontGlass = new THREE.Mesh(glassPlaneGeo, glassPlaneMat);
  frontGlass.position.z = params.frontGlassZ;
  frontGlass.scale.set(params.frontGlassScale, params.frontGlassScale, params.frontGlassScale);

  frontGlassEnv = frontGlass.clone();
  sceneMain.add(frontGlass);
  sceneEnv.add(frontGlassEnv);

  // --- EVENT LISTENERS ---
  window.addEventListener("mousemove", (e) => {
    cursor.x = (e.clientX / window.innerWidth - 0.5) * 2;
    cursor.y = -(e.clientY / window.innerHeight - 0.5) * 2;
  });
  window.addEventListener("resize", onResize);
  window.addEventListener("keydown", toggleGUI);
}

// --- GUI SETUP ---
function setupGUI() {
  gui = new GUI({ width: 300 });
  gui.domElement.classList.add("root");

  // 🎛️ Glass Material
  const mat = glassMeshes[0];
  const glassFolder = gui.addFolder("Glass Material");
  glassFolder.add(mat, "transmission", 0, 1, 0.01);
  glassFolder.add(mat, "ior", 1.0, 2.0, 0.01);
  glassFolder.add(mat, "thickness", 0.05, 2, 0.05);
  glassFolder.add(mat, "roughness", 0, 1, 0.01);
  glassFolder.add(mat, "envMapIntensity", 0, 3, 0.1);

  // 💡 Lighting
  const lightFolder = gui.addFolder("Lighting");
  lightFolder.add(params, "keyLightIntensity", 0, 10, 0.1).onChange((v) => {
    sceneMain.traverse((obj) => {
      if (obj.isDirectionalLight) obj.intensity = v;
    });
  });

  // 🔧 Background
  const bgFolder = gui.addFolder("Background Controls");
  const bgParams = { z: 0, scale: 3.35 };
  bgFolder.add(bgParams, "z", -5, 5, 0.1).onChange((v) => {
    if (bgMain && bgEnv) {
      bgMain.position.z = v;
      bgEnv.position.z = v;
    }
  });
  bgFolder.add(bgParams, "scale", 0.5, 10, 0.1).onChange((v) => {
    if (bgMain && bgEnv) {
      bgMain.scale.set(v, v, v);
      bgEnv.scale.set(v, v, v);
    }
  });

  // 🔩 Keychain
  const keychainFolder = gui.addFolder("Keychain Controls");
  keychainFolder.add(params, "rotationSpeed", 0, 0.02, 0.001).name("Rotation Speed");
  keychainFolder.add(params, "moveStrength", 0, 1, 0.01).name("Move Strength");
  keychainFolder.add(params, "lerpSpeed", 0.01, 0.2, 0.01).name("Lerp Speed");
  keychainFolder.add({ toggleRotation: () => (enableRotation = !enableRotation) }, "toggleRotation").name("Toggle Rotation");

  // 🌫️ Front Glass Layer
  const fgFolder = gui.addFolder("Front Glass Layer");
  const matFG = frontGlass.material;
  fgFolder.add(matFG, "roughness", 0, 1, 0.01);
  fgFolder.add(matFG, "transmission", 0, 1, 0.01);
  fgFolder.add(matFG, "thickness", 0.05, 2, 0.05);
  fgFolder.add(matFG, "envMapIntensity", 0, 3, 0.1);
  fgFolder.add(params, "frontGlassZ", -1, 2, 0.01).name("Z Offset").onChange((v) => {
    frontGlass.position.z = v;
    frontGlassEnv.position.z = v;
  });
  fgFolder.add(params, "frontGlassScale", 0.5, 10, 0.1).name("Scale").onChange((v) => {
    frontGlass.scale.set(v, v, v);
    frontGlassEnv.scale.set(v, v, v);
  });
}

// --- TOGGLE GUI ---
function toggleGUI(e) {
  if (e.key.toLowerCase() === "h" && gui) {
    guiVisible = !guiVisible;
    gui.domElement.style.display = guiVisible ? "block" : "none";
  }
}

// --- RESIZE ---
function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// --- LOOP ---
function animate() {
  requestAnimationFrame(animate);

  if (keychainController) {
    if (enableRotation) {
      idleRotation += params.rotationSpeed;
      keychainController.rotation.y = idleRotation;
      keychainController.rotation.x = 1;
      keychainController.rotation.z = 0.6;
    }

    const targetX = cursor.x * params.moveStrength;
    const targetY = cursor.y * params.moveStrength;
    keychainController.position.x += (targetX - keychainController.position.x) * params.lerpSpeed;
    keychainController.position.y += (targetY - keychainController.position.y) * params.lerpSpeed;

    keychainController.visible = false;
    cubeCam.update(renderer, sceneEnv);
    keychainController.visible = true;
  }

  renderer.render(sceneMain, camera);
}

init();
