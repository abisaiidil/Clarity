import * as THREE from "three";
import { GLTFLoader } from "GLTFLoader";
import GUI from "lil-gui";

let sceneMain, sceneEnv, camera, renderer;
let cubeCam, cubeTarget;
let keychainController;
let bgMain, bgEnv;
let glassMeshes = [];
let gui, guiVisible = false;

const cursor = { x: 0, y: 0 };
let idleRotation = 0;

// === DEFAULT PARAMETERS ===
const defaults = {
  // Interaction
  moveStrength: 0.15,
  lerpSpeed: 0.04,
  rotationSpeed: 0.004,
  rotationActive: true, // ✅ NEW toggle rotation

  // Background
  bgScale: 3.35,
  bgPosX: 0,
  bgPosY: 0,
  bgPosZ: 0,

  // Keychain
  keyScale: 1.7,
  keyPosX: 0,
  keyPosY: 0,
  keyPosZ: 1.12,
};

/* --------------------
   INIT
   -------------------- */
function init() {
  const canvasContainer = document.getElementById("webgl");

  // Scene
  sceneMain = new THREE.Scene();
  sceneMain.background = new THREE.Color(0xffffff);
  sceneEnv = new THREE.Scene();

  // Camera
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0, 3);

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  canvasContainer.appendChild(renderer.domElement);

  // === LIGHTING (default intensity = 5) ===
  const keyLight = new THREE.DirectionalLight(0xffffff, 5);
  keyLight.position.set(3, 4, 5);

  const fillLight = new THREE.HemisphereLight(0xf5f5f5, 0xcccccc, 0.9);
  const rimLight = new THREE.DirectionalLight(0xffffff, 1);
  rimLight.position.set(-3, 2, -4);
  const ambLight = new THREE.AmbientLight(0xffffff, 0.5);

  sceneMain.add(keyLight, fillLight, rimLight, ambLight);
  sceneEnv.add(keyLight.clone(), fillLight.clone(), rimLight.clone(), ambLight.clone());

  // === CUBECAMERA (for refraction) ===
  cubeTarget = new THREE.WebGLCubeRenderTarget(1024, {
    format: THREE.RGBAFormat,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
  });
  cubeCam = new THREE.CubeCamera(0.1, 100, cubeTarget);
  sceneEnv.add(cubeCam);

  const loader = new GLTFLoader();

  // === BACKGROUND ===
  loader.load(
    "./asset/clarity_bg.glb",
    (gltf) => {
      bgMain = gltf.scene;
      bgEnv = bgMain.clone(true);

      bgMain.scale.set(defaults.bgScale, defaults.bgScale, defaults.bgScale);
      bgEnv.scale.set(defaults.bgScale, defaults.bgScale, defaults.bgScale);
      bgMain.position.set(defaults.bgPosX, defaults.bgPosY, defaults.bgPosZ);
      bgEnv.position.set(defaults.bgPosX, defaults.bgPosY, defaults.bgPosZ);

      bgMain.traverse((c) => {
        if (c.isMesh) {
          c.material = new THREE.MeshBasicMaterial({
            map: c.material?.map || null,
            toneMapped: false,
          });
        }
      });
      bgEnv.traverse((c) => {
        if (c.isMesh) {
          c.material = new THREE.MeshBasicMaterial({
            map: c.material?.map || null,
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

  // === KEYCHAIN ===
  loader.load(
    "./asset/clarity_keychain.glb",
    (gltf) => {
      const model = gltf.scene;
      model.scale.set(defaults.keyScale, defaults.keyScale, defaults.keyScale);
      model.position.set(defaults.keyPosX, defaults.keyPosY, defaults.keyPosZ);
      sceneMain.add(model);

      keychainController =
        model.getObjectByName("Keychain Controler") ||
        model.getObjectByName("Keychain Controller") ||
        model;

      model.traverse((child) => {
        if (child.isMesh) {
          const name = (child.name || "").toLowerCase();

          // Plastik (Glass)
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

          // Besi
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

  // === EVENTS ===
  window.addEventListener("mousemove", (e) => {
    cursor.x = (e.clientX / window.innerWidth - 0.5) * 2;
    cursor.y = -(e.clientY / window.innerHeight - 0.5) * 2;
  });
  window.addEventListener("resize", onResize);
  window.addEventListener("keydown", toggleGUI);
}

/* --------------------
   GUI
   -------------------- */
function setupGUI() {
  gui = new GUI({ width: 300 });
  gui.domElement.classList.add("root");
  gui.hide();

  // Glass
  const mat = glassMeshes[0];
  const glassFolder = gui.addFolder("Glass Material");
  glassFolder.add(mat, "transmission", 0, 1, 0.01);
  glassFolder.add(mat, "ior", 1.0, 2.0, 0.01);
  glassFolder.add(mat, "thickness", 0.01, 5, 0.01);
  glassFolder.add(mat, "roughness", 0, 1, 0.01);
  glassFolder.add(mat, "metalness", 0, 1, 0.01);
  glassFolder.add(mat, "envMapIntensity", 0, 3, 0.1);

  // Background
  const bgFolder = gui.addFolder("Background Controls");
  const bgParams = { scale: defaults.bgScale, posZ: defaults.bgPosZ };
  bgFolder.add(bgParams, "scale", 0.5, 10, 0.01).onChange((v) => {
    if (bgMain && bgEnv) bgMain.scale.set(v, v, v), bgEnv.scale.set(v, v, v);
  });
  bgFolder.add(bgParams, "posZ", -10, 10, 0.01).onChange((v) => {
    if (bgMain && bgEnv) bgMain.position.z = v, bgEnv.position.z = v;
  });

  // Keychain
  const keyFolder = gui.addFolder("Keychain Controls");
  const keyParams = { scale: defaults.keyScale, posZ: defaults.keyPosZ };
  keyFolder.add(keyParams, "scale", 0.1, 10, 0.01).onChange((v) => {
    if (keychainController) keychainController.scale.set(v, v, v);
  });
  keyFolder.add(keyParams, "posZ", -5, 5, 0.01).onChange((v) => {
    if (keychainController) keychainController.position.z = v;
  });

  // Interaction
  const interFolder = gui.addFolder("Interaction");
  interFolder.add(defaults, "moveStrength", 0, 2, 0.01);
  interFolder.add(defaults, "lerpSpeed", 0.01, 0.3, 0.01);
  interFolder.add(defaults, "rotationSpeed", 0.001, 0.05, 0.001);
  interFolder.add(defaults, "rotationActive").name("Rotation Active"); // ✅ NEW toggle

  // Lighting (intensity)
  const lightFolder = gui.addFolder("Lighting");
  const lightParams = { intensity: 5 };
  lightFolder.add(lightParams, "intensity", 0, 8, 0.1).onChange((v) => {
    sceneMain.traverse((o) => {
      if (o.isDirectionalLight) o.intensity = v;
    });
  });

  glassFolder.close();
  bgFolder.close();
  keyFolder.close();
  interFolder.close();
  lightFolder.close();
}

/* --------------------
   TOGGLE GUI (H)
   -------------------- */
function toggleGUI(e) {
  if (e.key && e.key.toLowerCase() === "h" && gui) {
    guiVisible = !guiVisible;
    gui.domElement.style.display = guiVisible ? "block" : "none";
  }
}

/* --------------------
   ANIMATE LOOP
   -------------------- */
function animate() {
  requestAnimationFrame(animate);

  if (keychainController) {
    // ✅ Only rotate when active
    if (defaults.rotationActive) {
      idleRotation += defaults.rotationSpeed;
      keychainController.rotation.y = idleRotation;
      keychainController.rotation.x = 1;
      keychainController.rotation.z = 0.6;
    }

    // Follow cursor
    const targetX = cursor.x * defaults.moveStrength;
    const targetY = cursor.y * defaults.moveStrength;
    keychainController.position.x += (targetX - keychainController.position.x) * defaults.lerpSpeed;
    keychainController.position.y += (targetY - keychainController.position.y) * defaults.lerpSpeed;

    // Update reflection/refraction
    keychainController.visible = false;
    cubeCam.update(renderer, sceneEnv);
    keychainController.visible = true;
  }

  renderer.render(sceneMain, camera);
}

/* --------------------
   RESIZE
   -------------------- */
function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

/* --------------------
   START
   -------------------- */
init();
