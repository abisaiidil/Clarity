import * as THREE from "three";
import { GLTFLoader } from "GLTFLoader";
import GUI from "lil-gui";

let sceneMain, sceneEnv, camera, renderer;
let cubeCam, cubeTarget;
let keychainController;
let bgMain, bgEnv;
let glassMeshes = [];
let metalMeshes = [];
let gui, guiVisible = false;

const cursor = { x: 0, y: 0 };
let idleRotation = 0;
let enableRotation = true;

const params = {
  // 🔧 Interactions
  moveStrength: 0.25,
  lerpSpeed: 0.05,
  rotationSpeed: 0.01,

  // 💡 Lighting intensities
  keyLightIntensity: 2.6,
  fillLightIntensity: 1.0,
  rimLightIntensity: 1.0,
  ambLightIntensity: 1.0,
};

let keyLight, fillLight, rimLight, ambLight;

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
  keyLight = new THREE.DirectionalLight(0xffffff, params.keyLightIntensity);
  keyLight.position.set(3, 4, 5);

  fillLight = new THREE.HemisphereLight(0xf5f5f5, 0xcccccc, params.fillLightIntensity);

  rimLight = new THREE.DirectionalLight(0xffffff, params.rimLightIntensity);
  rimLight.position.set(-3, 2, -4);

  ambLight = new THREE.AmbientLight(0xffffff, params.ambLightIntensity);

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

          // 🧊 GLASS
          if (name.includes("plastik")) {
            const mat = new THREE.MeshPhysicalMaterial({
              color: 0xffffff,
              roughness: 0.4,
              metalness: 0,
              transmission: 1,
              ior: 1.33,
              thickness: 0.05,
              envMap: cubeTarget.texture,
              envMapIntensity: 2.0,
              clearcoat: 1,
              clearcoatRoughness: 0.1,
            });
            child.material = mat;
            glassMeshes.push(mat);
          }

          // 🪙 METAL
          if (name.includes("besi")) {
            const mat = new THREE.MeshPhysicalMaterial({
              color: 0xffffff,
              metalness: 1.0,
              roughness: 0.3,
              envMap: cubeTarget.texture,
              envMapIntensity: 1.0,
            });
            child.material = mat;
            metalMeshes.push(mat);
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
  const glass = glassMeshes[0];
  const glassFolder = gui.addFolder("Glass Material");
  glassFolder.add(glass, "transmission", 0, 1, 0.01);
  glassFolder.add(glass, "ior", 1.0, 2.0, 0.01);
  glassFolder.add(glass, "thickness", 0.01, 2, 0.01);
  glassFolder.add(glass, "roughness", 0, 1, 0.01);
  glassFolder.add(glass, "envMapIntensity", 0, 3, 0.1);

  // 🪙 Metal Material
  if (metalMeshes.length > 0) {
    const metal = metalMeshes[0];
    const metalFolder = gui.addFolder("Metal Material");
    metalFolder.add(metal, "metalness", 0, 1, 0.01);
    metalFolder.add(metal, "roughness", 0, 1, 0.01);
    metalFolder.add(metal, "envMapIntensity", 0, 3, 0.1);
  }

  // 💡 Lighting (4 lampu)
  const lightFolder = gui.addFolder("Lighting Controls");
  lightFolder.add(params, "keyLightIntensity", 0, 10, 0.1).name("Key Light").onChange((v) => (keyLight.intensity = v));
  lightFolder.add(params, "fillLightIntensity", 0, 3, 0.1).name("Fill Light").onChange((v) => (fillLight.intensity = v));
  lightFolder.add(params, "rimLightIntensity", 0, 3, 0.1).name("Rim Light").onChange((v) => (rimLight.intensity = v));
  lightFolder.add(params, "ambLightIntensity", 0, 2, 0.1).name("Ambient").onChange((v) => (ambLight.intensity = v));

  // 🔩 Keychain Interaction
  const keychainFolder = gui.addFolder("Keychain Controls");
  keychainFolder.add(params, "rotationSpeed", 0, 0.05, 0.001).name("Rotation Speed");
  keychainFolder.add(params, "moveStrength", 0, 1, 0.01).name("Move Strength");
  keychainFolder.add(params, "lerpSpeed", 0.01, 0.2, 0.01).name("Lerp Speed");
  keychainFolder.add({ toggleRotation: () => (enableRotation = !enableRotation) }, "toggleRotation").name("Toggle Rotation");
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
