import * as THREE from "three";
import { GLTFLoader } from "GLTFLoader";
import GUI from "lil-gui";

let sceneMain, sceneEnv, camera, renderer, cubeCam, cubeTarget;
let keychainController, bgMain, bgEnv;
let glassMeshes = [], metalMeshes = [];
let icons = [];
let gui, guiVisible = false;

const cursor = { x: 0, y: 0 };
let idleRotation = 0, rotationEnabled = true;

// --- PARAMETER DASAR ---
const params = {
  rotationSpeed: 0.01,
  moveStrength: 0.25,
  lerpSpeed: 0.05,
};

// --- INIT SCENE ---
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

  // --- LIGHTING ---
  const keyLight = new THREE.DirectionalLight(0xffffff, 2.6);
  keyLight.position.set(3, 4, 5);
  const fillLight = new THREE.DirectionalLight(0xffffff, 1);
  fillLight.position.set(-3, 2, 2);
  const rimLight = new THREE.DirectionalLight(0xffffff, 1);
  rimLight.position.set(-3, 2, -4);
  const ambLight = new THREE.AmbientLight(0xffffff, 1);

  sceneMain.add(keyLight, fillLight, rimLight, ambLight);
  sceneEnv.add(keyLight.clone(), fillLight.clone(), rimLight.clone(), ambLight.clone());

  // --- CUBECAMERA ---
  cubeTarget = new THREE.WebGLCubeRenderTarget(1024, {
    format: THREE.RGBAFormat,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
  });
  cubeCam = new THREE.CubeCamera(0.1, 100, cubeTarget);
  sceneEnv.add(cubeCam);

  const loader = new GLTFLoader();

  // --- BACKGROUND ---
  loader.load("./asset/clarity_bg.glb", (gltf) => {
    bgMain = gltf.scene;
    bgEnv = bgMain.clone();
    bgMain.scale.set(3.35, 3.35, 3.35);
    bgEnv.scale.set(3.35, 3.35, 3.35);
    bgMain.position.set(0, 0, 0);
    bgEnv.position.set(0, 0, 0);

    bgMain.traverse((child) => {
      if (child.isMesh) child.material = new THREE.MeshBasicMaterial({ map: child.material.map || null, toneMapped: false });
    });
    bgEnv.traverse((child) => {
      if (child.isMesh) child.material = new THREE.MeshBasicMaterial({ map: child.material.map || null, toneMapped: false });
    });

    sceneMain.add(bgMain);
    sceneEnv.add(bgEnv);
  });

  // --- KEYCHAIN ---
  loader.load("./asset/clarity_keychain.glb", (gltf) => {
    const model = gltf.scene;
    sceneMain.add(model);

    keychainController = model.getObjectByName("Keychain Controler") || model;
    keychainController.scale.set(1.7, 1.7, 1.7);
    keychainController.position.z = 1.12;

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

  // --- ICON PATHS ---
  const iconPaths = [
    { name: "home", path: "./asset/2_home.glb", x: -0.99, y: 0.49, amp: 0.09 },
    { name: "keys", path: "./asset/1_keys.glb", x: -0.58, y: 0.9, amp: 0.05 },
    { name: "locker", path: "./asset/5_locker.glb", x: 0.9, y: -0.45, amp: 0.08 },
    { name: "backpack", path: "./asset/3_backpack.glb", x: -1.1, y: -0.15, amp: 0.12 },
    { name: "suitcase", path: "./asset/6_suitcase.glb", x: 1.32, y: 0.05, amp: 0.07 },
    { name: "bag", path: "./asset/4_bag.glb", x: 0.95, y: 0.69, amp: 0.06 },
  ];

  // --- LOAD ICONS ---
  iconPaths.forEach((icon) => {
    loader.load(icon.path, (gltf) => {
      const iconRoot = gltf.scene;
      iconRoot.scale.set(2.5, 2.5, 2.5);
      iconRoot.position.set(icon.x, icon.y, 0.3);

      const glassMat = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        roughness: 0.1,
        metalness: 0,
        transmission: 1,
        ior: 1.33,
        thickness: 0,
        envMap: cubeTarget.texture,
        envMapIntensity: 2,
        clearcoat: 1,
        clearcoatRoughness: 0.1,
      });

      let iconMat;
      const colorMap = {
        home: "#c585d8",
        keys: "#e1a06a",
        locker: "#7281d8",
        backpack: "#b173cf",
        suitcase: "#c576a0",
        bag: "#f0ad76",
      };
      iconMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(colorMap[icon.name] || 0xffffff),
        roughness: 0.2,
        metalness: 0.2,
        envMap: cubeTarget.texture,
        envMapIntensity: 2,
      });

      iconRoot.traverse((child) => {
        const n = child.name.toLowerCase();
        if (n.includes("glass")) child.material = glassMat;
        else if (child.isMesh) child.material = iconMat;
      });

      icons.push({
        name: icon.name,
        root: iconRoot,
        loct: iconRoot,
        rot: iconRoot,
        float: { amplitude: icon.amp, speed: 1 },
        mats: { iconMat, glassMat },
      });
      sceneMain.add(iconRoot);
    });
  });

  window.addEventListener("mousemove", (e) => {
    cursor.x = (e.clientX / window.innerWidth - 0.5) * 2;
    cursor.y = -(e.clientY / window.innerHeight - 0.5) * 2;
  });
  window.addEventListener("resize", onResize);
  window.addEventListener("keydown", toggleGUI);
}

// --- GUI SETUP ---
function setupGUI(lights) {
  gui = new GUI({ width: 320 });
  gui.domElement.style.display = "none";

  // Lighting Intensity
  const lightFolder = gui.addFolder("I. Lighting Intensity");
  lightFolder.add(lights.keyLight, "intensity", 0, 10, 0.1).name("Key Light");
  lightFolder.add(lights.rimLight, "intensity", 0, 10, 0.1).name("Rim Light");
  lightFolder.add(lights.fillLight, "intensity", 0, 10, 0.1).name("Fill Light");
  lightFolder.add(lights.ambLight, "intensity", 0, 10, 0.1).name("Ambient Light");

  // Keychain
  const keychainFolder = gui.addFolder("II. Keychain");
  const controlFolder = keychainFolder.addFolder("Control");
  controlFolder.add(keychainController.scale, "x", 0.5, 3, 0.1).name("Scale").onChange((v) => keychainController.scale.set(v, v, v));
  controlFolder.add(keychainController.position, "z", -1, 3, 0.01).name("Z Position");
  controlFolder.add(params, "moveStrength", 0.05, 0.5, 0.01).name("Move Strength");
  controlFolder.add(params, "lerpSpeed", 0.01, 0.2, 0.01).name("Lerp Speed");
  controlFolder.add(params, "rotationSpeed", 0.001, 0.05, 0.001).name("Rotation Speed");
  controlFolder.add({ toggle: () => (rotationEnabled = !rotationEnabled) }, "toggle").name("Toggle Idle Rotation");

  const glassMat = glassMeshes[0];
  const metalMat = metalMeshes[0];
  const glassFolder = keychainFolder.addFolder("Glass Material");
  glassFolder.add(glassMat, "transmission", 0, 1, 0.01);
  glassFolder.add(glassMat, "ior", 1, 2, 0.01);
  glassFolder.add(glassMat, "thickness", 0, 5, 0.01);
  glassFolder.add(glassMat, "roughness", 0, 1, 0.01);
  glassFolder.add(glassMat, "envMapIntensity", 0, 3, 0.1);

  const metalFolder = keychainFolder.addFolder("Metal Material");
  metalFolder.add(metalMat, "roughness", 0, 1, 0.01);
  metalFolder.add(metalMat, "envMapIntensity", 0, 3, 0.1);

  // Icons
  const iconFolder = gui.addFolder("III. Icons");
  const cubeMat = icons.length > 0 ? icons[0].mats.glassMat : null;
  if (cubeMat) {
    const cubeFolder = iconFolder.addFolder("Glass Cube Material");
    cubeFolder.add(cubeMat, "thickness", 0, 2, 0.01);
    cubeFolder.add(cubeMat, "roughness", 0, 1, 0.01);
  }

  // each icon
  icons.forEach((icon) => {
    const f = iconFolder.addFolder(icon.name.toUpperCase());
    const pos = f.addFolder("Location");
    pos.add(icon.loct.position, "x", -2, 2, 0.01);
    pos.add(icon.loct.position, "y", -2, 2, 0.01);
    pos.add(icon.loct.position, "z", -1, 2, 0.01);
    const rot = f.addFolder("Rotation");
    rot.add(icon.rot.rotation, "x", 0, Math.PI * 2, 0.01);
    rot.add(icon.rot.rotation, "y", 0, Math.PI * 2, 0.01);
    rot.add(icon.rot.rotation, "z", 0, Math.PI * 2, 0.01);
    f.add(icon.root.scale, "x", 0.5, 4, 0.1).name("Scale").onChange((v) => icon.root.scale.set(v, v, v));
    const floatF = f.addFolder("Float Motion");
    floatF.add(icon.float, "amplitude", 0, 0.3, 0.01);
    floatF.add(icon.float, "speed", 0.5, 3, 0.1);
    const matF = f.addFolder("Material");
    matF.addColor(icon.mats.iconMat, "color");
    matF.add(icon.mats.iconMat, "roughness", 0, 1, 0.01);
    matF.add(icon.mats.iconMat, "metalness", 0, 1, 0.01);
    matF.add(icon.mats.iconMat, "envMapIntensity", 0, 3, 0.1);
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
    if (rotationEnabled) idleRotation += params.rotationSpeed;
    keychainController.rotation.y = idleRotation;
    keychainController.rotation.x = 1;
    keychainController.rotation.z = 0.6;

    const targetX = cursor.x * params.moveStrength;
    const targetY = cursor.y * params.moveStrength;
    keychainController.position.x += (targetX - keychainController.position.x) * params.lerpSpeed;
    keychainController.position.y += (targetY - keychainController.position.y) * params.lerpSpeed;

    keychainController.visible = false;
    cubeCam.update(renderer, sceneEnv);
    keychainController.visible = true;
  }

  const t = performance.now() * 0.001;
  icons.forEach((icon) => {
    icon.loct.position.y += Math.sin(t * icon.float.speed) * icon.float.amplitude * 0.02;
  });

  renderer.render(sceneMain, camera);
}

init();
