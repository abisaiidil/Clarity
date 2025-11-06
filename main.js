import * as THREE from "three";
import { GLTFLoader } from "GLTFLoader";
import GUI from "lil-gui";

let sceneMain, sceneEnv, camera, renderer;
let cubeCam, cubeTarget;
let bgMain, bgEnv, keychainController;
let glassMeshes = [], metalMeshes = [];
let gui, guiVisible = false;

const cursor = { x: 0, y: 0 };
let idleRotation = 0;
let isIdlePaused = false;

// baseline (from your last tweaks)
const baseline = {
  bgScale: 4.5,
  bgZ: -1,
  keyScale: 2.75,
  keyZ: 0.2
};

// animation params
const anim = { moveStrength: 0.15, lerpSpeed: 0.05, rotationSpeed: 0.01 };

function init() {
  const canvas = document.getElementById("webgl");
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  sceneMain = new THREE.Scene();
  sceneMain.background = new THREE.Color(0xffffff);
  sceneEnv = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    100
  );
  camera.position.set(0, 0, 3);

  // lighting
  const keyLight = new THREE.DirectionalLight(0xffffff, 1);
  keyLight.position.set(3, 4, 5);
  const rimLight = new THREE.DirectionalLight(0xffffff, 3.5);
  rimLight.position.set(-3, 2, -4);
  const fillLight = new THREE.HemisphereLight(0xf5f5f5, 0xcccccc, 1.5);
  const ambLight = new THREE.AmbientLight(0xffffff, 1);
  sceneMain.add(keyLight, rimLight, fillLight, ambLight);
  sceneEnv.add(keyLight.clone(), rimLight.clone(), fillLight.clone(), ambLight.clone());

  // cube camera
  cubeTarget = new THREE.WebGLCubeRenderTarget(1024, {
    format: THREE.RGBAFormat,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter
  });
  cubeCam = new THREE.CubeCamera(0.1, 100, cubeTarget);
  sceneEnv.add(cubeCam);

  const loader = new GLTFLoader();

  // load bg
  loader.load(
    "./asset/clarity_bg.glb",
    (gltf) => {
      bgMain = gltf.scene;
      bgEnv = bgMain.clone();
      sceneMain.add(bgMain);
      sceneEnv.add(bgEnv);
      applyBGScale();
      bgMain.position.z = baseline.bgZ;
      bgEnv.position.z = baseline.bgZ;

      bgMain.traverse((child) => {
        if (child.isMesh)
          child.material = new THREE.MeshBasicMaterial({
            map: child.material.map || null,
            toneMapped: false
          });
      });
      bgEnv.traverse((child) => {
        if (child.isMesh)
          child.material = new THREE.MeshBasicMaterial({
            map: child.material.map || null,
            toneMapped: false
          });
      });
      console.log("✅ clarity_bg.glb loaded");
    },
    undefined,
    (e) => console.error("❌ BG load fail:", e)
  );

  // load keychain
  loader.load(
    "./asset/clarity_keychain.glb",
    (gltf) => {
      const model = gltf.scene;
      model.scale.set(baseline.keyScale, baseline.keyScale, baseline.keyScale);
      model.position.z = baseline.keyZ;
      sceneMain.add(model);

      keychainController =
        model.getObjectByName("Keychain Controller") ||
        model.getObjectByName("Keychain Controler") ||
        model;

      model.traverse((child) => {
        if (child.isMesh) {
          const n = child.name.toLowerCase();

          // glass
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
              clearcoatRoughness: 0.1
            });
            child.material = mat;
            glassMeshes.push(mat);
          }

          // metal
          if (n.includes("besi")) {
            const mat = new THREE.MeshPhysicalMaterial({
              color: 0xffffff,
              metalness: 1,
              roughness: 0.2,
              envMap: cubeTarget.texture,
              envMapIntensity: 2
            });
            child.material = mat;
            metalMeshes.push(mat);
          }
        }
      });

      setupGUI();
      animate();
      console.log("✅ clarity_keychain.glb loaded");
    },
    undefined,
    (e) => console.error("❌ Keychain load fail:", e)
  );

  window.addEventListener("mousemove", (e) => {
    cursor.x = (e.clientX / window.innerWidth - 0.5) * 2;
    cursor.y = -(e.clientY / window.innerHeight - 0.5) * 2;
  });

  window.addEventListener("resize", onResize);
  window.addEventListener("keydown", toggleGUI);
  window.addEventListener("click", toggleIdleRotation);
}

function applyBGScale() {
  if (!bgMain || !bgEnv) return;
  const heightFactor = window.innerHeight / 1080; // normalized to 1080p baseline
  const scale = baseline.bgScale * heightFactor;
  bgMain.scale.set(scale, scale, scale);
  bgEnv.scale.set(scale, scale, scale);
}

function applyKeychainScale() {
  if (!keychainController) return;
  const heightFactor = window.innerHeight / 1080;
  const scale = baseline.keyScale * heightFactor;
  keychainController.scale.set(scale, scale, scale);
}

// GUI
function setupGUI() {
  gui = new GUI({ width: 310 });
  gui.domElement.classList.add("root");

  // lighting
  const lightFolder = gui.addFolder("Lighting Intensity");
  sceneMain.children.forEach((l) => {
    if (l.isLight) {
      lightFolder
        .add(l, "intensity", 0, 10, 0.1)
        .name(l.type.replace("Light", ""));
    }
  });

  // keychain
  const keyFolder = gui.addFolder("Keychain Controls");
  const keyParams = {
    scale: baseline.keyScale,
    z: baseline.keyZ,
    moveStrength: anim.moveStrength,
    lerpSpeed: anim.lerpSpeed,
    rotationSpeed: anim.rotationSpeed
  };
  keyFolder.add(keyParams, "scale", 0.5, 6, 0.01).onChange((v) => {
    baseline.keyScale = v;
    applyKeychainScale();
  });
  keyFolder.add(keyParams, "z", -2, 2, 0.01).onChange((v) => {
    baseline.keyZ = v;
    if (keychainController) keychainController.position.z = v;
  });
  keyFolder
    .add(keyParams, "moveStrength", 0, 1, 0.01)
    .onChange((v) => (anim.moveStrength = v));
  keyFolder
    .add(keyParams, "lerpSpeed", 0, 0.2, 0.005)
    .onChange((v) => (anim.lerpSpeed = v));
  keyFolder
    .add(keyParams, "rotationSpeed", 0, 0.05, 0.001)
    .onChange((v) => (anim.rotationSpeed = v));

  // glass
  if (glassMeshes.length) {
    const glassFolder = keyFolder.addFolder("Glass Material");
    const g = glassMeshes[0];
    glassFolder.add(g, "roughness", 0, 1, 0.01);
    glassFolder.add(g, "ior", 1, 2, 0.01);
    glassFolder.add(g, "thickness", 0, 1, 0.01);
    glassFolder.add(g, "envMapIntensity", 0, 3, 0.1);
  }

  // metal
  if (metalMeshes.length) {
    const metalFolder = keyFolder.addFolder("Metal Material");
    const m = metalMeshes[0];
    metalFolder.add(m, "roughness", 0, 1, 0.01);
    metalFolder.add(m, "envMapIntensity", 0, 3, 0.1);
  }

  // bg
  const bgFolder = gui.addFolder("Background Controls");
  const bgParams = { scale: baseline.bgScale, z: baseline.bgZ };
  bgFolder.add(bgParams, "scale", 0.5, 8, 0.1).onChange((v) => {
    baseline.bgScale = v;
    applyBGScale();
  });
  bgFolder.add(bgParams, "z", -5, 2, 0.1).onChange((v) => {
    baseline.bgZ = v;
    if (bgMain && bgEnv) {
      bgMain.position.z = v;
      bgEnv.position.z = v;
    }
  });
}

// toggle gui
function toggleGUI(e) {
  if (e.key.toLowerCase() === "h" && gui) {
    guiVisible = !guiVisible;
    gui.domElement.style.display = guiVisible ? "block" : "none";
  }
}

// click toggle idle rotation
function toggleIdleRotation() {
  isIdlePaused = !isIdlePaused;
}

// resize
function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  applyBGScale();
  applyKeychainScale();
}

// loop
function animate() {
  requestAnimationFrame(animate);

  if (keychainController) {
    if (!isIdlePaused) idleRotation += anim.rotationSpeed;
    keychainController.rotation.y = idleRotation;
    keychainController.rotation.x = 1;
    keychainController.rotation.z = 0.6;

    const tx = cursor.x * anim.moveStrength;
    const ty = cursor.y * anim.moveStrength;
    keychainController.position.x += (tx - keychainController.position.x) * anim.lerpSpeed;
    keychainController.position.y += (ty - keychainController.position.y) * anim.lerpSpeed;

    keychainController.visible = false;
    cubeCam.update(renderer, sceneEnv);
    keychainController.visible = true;
  }

  renderer.render(sceneMain, camera);
}

init();
