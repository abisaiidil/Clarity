import * as THREE from "three";
import { GLTFLoader } from "GLTFLoader";
import GUI from "lil-gui";

let sceneMain, sceneEnv, camera, renderer;
let cubeCam, cubeTarget;
let keychainController;
let bgMain, bgEnv;
let glassMeshes = [];
let metalMeshes = [];
let cubeGlassMaterials = [];
let iconEntries = [];
let gui, guiVisible = false;

const cursor = { x: 0, y: 0 };
let idleRotation = 0;
let enableRotation = true;

const params = {
  moveStrength: 0.25,
  lerpSpeed: 0.05,
  rotationSpeed: 0.01,

  keyLightIntensity: 2.6,
  fillLightIntensity: 1.0,
  rimLightIntensity: 1.0,
  ambLightIntensity: 1.0,
};

let keyLight, fillLight, rimLight, ambLight;

const iconFiles = [
  "./asset/1_keys.glb",
  "./asset/2_home.glb",
  "./asset/3_backpack.glb",
  "./asset/4_bag.glb",
  "./asset/5_locker.glb",
  "./asset/6_suitcase.glb",
];

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

  // --- LIGHTS ---
  keyLight = new THREE.DirectionalLight(0xffffff, params.keyLightIntensity);
  keyLight.position.set(3, 4, 5);
  fillLight = new THREE.HemisphereLight(0xf5f5f5, 0xcccccc, params.fillLightIntensity);
  rimLight = new THREE.DirectionalLight(0xffffff, params.rimLightIntensity);
  rimLight.position.set(-3, 2, -4);
  ambLight = new THREE.AmbientLight(0xffffff, params.ambLightIntensity);
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
    bgEnv = bgMain.clone(true);
    bgMain.scale.set(3.35, 3.35, 3.35);
    bgEnv.scale.set(3.35, 3.35, 3.35);
    sceneMain.add(bgMain);
    sceneEnv.add(bgEnv);
  });

  // --- KEYCHAIN ---
  loader.load("./asset/clarity_keychain.glb", (gltf) => {
    const model = gltf.scene;
    model.scale.set(1.7, 1.7, 1.7);
    model.position.set(0, 0, 1.12);
    sceneMain.add(model);

    keychainController =
      model.getObjectByName("Keychain Controler") ||
      model.getObjectByName("Keychain Controller") ||
      model;

    model.traverse((child) => {
      const name = (child.name || "").toLowerCase();
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
      } else if (name.includes("besi")) {
        const mat = new THREE.MeshPhysicalMaterial({
          color: 0xffffff,
          metalness: 1.0,
          roughness: 0.2,
          envMap: cubeTarget.texture,
          envMapIntensity: 2.0,
        });
        child.material = mat;
        metalMeshes.push(mat);
      }
    });

    if (glassMeshes.length > 0) setupGUI();
    animate();
  });

  // --- ICONS ---
  const defaultPositions = [
    [-1.2, 0.9, 0.3], // keys
    [-0.7, 0.5, 0.3], // home
    [-0.8, -0.6, 0.3], // backpack
    [0.9, 0.4, 0.3], // bag
    [0.8, -0.3, 0.3], // locker
    [1.1, -0.9, 0.3], // suitcase
  ];

  iconFiles.forEach((path, idx) => {
    loader.load(
      path,
      (gltf) => {
        const sceneRoot = gltf.scene;
        let loct = null;
        sceneRoot.traverse((o) => {
          if (!loct && (o.name || "").toLowerCase().startsWith("loct_")) loct = o;
        });
        if (!loct) loct = sceneRoot;

        let rot = null;
        loct.traverse((o) => {
          if (!rot && (o.name || "").toLowerCase().startsWith("rot_")) rot = o;
        });
        if (!rot) rot = loct;

        let iconMesh = null;
        let iconGlassMesh = null;
        rot.traverse((m) => {
          if (m.isMesh) {
            const nm = (m.name || "").toLowerCase();
            if (nm.includes("glass_")) iconGlassMesh = m;
            else if (!iconMesh) iconMesh = m;
          }
        });

        loct.position.set(...defaultPositions[idx]);
        rot.rotation.set(Math.PI / 2, 0, 0); // rot X default

        loct.scale.set(2.5, 2.5, 2.5);

        if (iconGlassMesh) {
          const matGlass = new THREE.MeshPhysicalMaterial({
            color: 0xffffff,
            roughness: 0.1,
            metalness: 0,
            transmission: 1,
            ior: 1.33,
            thickness: 0,
            envMap: cubeTarget.texture,
            envMapIntensity: 2.0,
          });
          iconGlassMesh.material = matGlass;
          cubeGlassMaterials.push(matGlass);
        }

        if (iconMesh) {
          const matIcon = new THREE.MeshPhysicalMaterial({
            color: new THREE.Color(0xffffff),
            roughness: 0.2,
            metalness: 0.1,
            envMap: cubeTarget.texture,
            envMapIntensity: 2.0,
          });
          iconMesh.material = matIcon;
        }

        sceneMain.add(loct);
        sceneEnv.add(loct.clone(true));

        const entry = {
          name: loct.name || `icon_${idx}`,
          loct,
          rot,
          basePosition: loct.position.clone(),
          baseY: loct.position.y,
          iconMesh,
          iconGlassMesh,
          floatAmplitude: 0.15 + Math.random() * 0.1,
          floatSpeed: 0.6 + Math.random() * 0.4,
          phase: Math.random() * Math.PI * 2,
          scale: 2.5,
        };
        iconEntries.push(entry);

        if (gui) addIconGUI(entry);
      },
      undefined,
      (err) => console.error("❌ icon load failed:", path, err)
    );
  });

  window.addEventListener("mousemove", (e) => {
    cursor.x = (e.clientX / window.innerWidth - 0.5) * 2;
    cursor.y = -(e.clientY / window.innerHeight - 0.5) * 2;
  });
  window.addEventListener("resize", onResize);
  window.addEventListener("keydown", toggleGUI);
}

function setupGUI() {
  gui = new GUI({ width: 320 });
  gui.hide();

  if (glassMeshes.length > 0) {
    const g = glassMeshes[0];
    const gf = gui.addFolder("Glass Material (Keychain)");
    gf.add(g, "transmission", 0, 1, 0.01);
    gf.add(g, "ior", 1.0, 2.0, 0.01);
    gf.add(g, "thickness", 0.01, 2, 0.01);
    gf.add(g, "roughness", 0, 1, 0.01);
    gf.add(g, "envMapIntensity", 0, 3, 0.1);
  }

  if (cubeGlassMaterials.length > 0) {
    const gm = cubeGlassMaterials[0];
    const cf = gui.addFolder("Glass Cube (All Icons)");
    cf.add(gm, "transmission", 0, 1, 0.01);
    cf.add(gm, "ior", 1.0, 2.0, 0.01);
    cf.add(gm, "thickness", 0, 2, 0.01);
    cf.add(gm, "roughness", 0, 1, 0.01);
    cf.add(gm, "envMapIntensity", 0, 3, 0.1);
  }

  if (metalMeshes.length > 0) {
    const m = metalMeshes[0];
    const mf = gui.addFolder("Metal Material (Keychain)");
    mf.add(m, "metalness", 0, 1, 0.01);
    mf.add(m, "roughness", 0, 1, 0.01);
    mf.add(m, "envMapIntensity", 0, 3, 0.1);
  }

  iconEntries.forEach(addIconGUI);
}

function addIconGUI(entry) {
  const f = gui.addFolder(`Icon: ${entry.name}`);

  const pos = {
    x: entry.loct.position.x,
    y: entry.baseY,
    z: entry.loct.position.z,
  };
  f.add(pos, "x", -5, 5, 0.01).onChange((v) => (entry.loct.position.x = v));
  f.add(pos, "y", -3, 3, 0.01).onChange((v) => (entry.baseY = v));
  f.add(pos, "z", -5, 5, 0.01).onChange((v) => (entry.loct.position.z = v));

  const rot = {
    x: Math.PI / 2,
    y: 0,
    z: 0,
  };
  f.add(rot, "x", -Math.PI, Math.PI, 0.01).onChange((v) => (entry.rot.rotation.x = v));
  f.add(rot, "y", -Math.PI, Math.PI, 0.01).onChange((v) => (entry.rot.rotation.y = v));
  f.add(rot, "z", -Math.PI, Math.PI, 0.01).onChange((v) => (entry.rot.rotation.z = v));

  f.add(entry, "scale", 0.1, 5, 0.01).onChange((v) => entry.loct.scale.set(v, v, v));
  f.add(entry, "floatAmplitude", 0, 1, 0.01);
  f.add(entry, "floatSpeed", 0, 2, 0.01);
}

function toggleGUI(e) {
  if (e.key && e.key.toLowerCase() === "h" && gui) {
    guiVisible = !guiVisible;
    gui.domElement.style.display = guiVisible ? "block" : "none";
  }
}

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
  }

  const t = performance.now() / 1000;
  iconEntries.forEach((entry) => {
    const y = entry.baseY + Math.sin(t * entry.floatSpeed + entry.phase) * entry.floatAmplitude;
    entry.loct.position.y = y;
  });

  if (keychainController) keychainController.visible = false;
  iconEntries.forEach((entry) => (entry.loct.visible = false));
  cubeCam.update(renderer, sceneEnv);
  if (keychainController) keychainController.visible = true;
  iconEntries.forEach((entry) => (entry.loct.visible = true));

  renderer.render(sceneMain, camera);
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

init();
setupGUI();
animate();
