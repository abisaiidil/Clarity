// main.js (icons + keychain + bg + GUI controls per-icon + glass cubes global)
// imports resolved by importmap in index.html
import * as THREE from "three";
import { GLTFLoader } from "GLTFLoader";
import GUI from "lil-gui";

/* -------------------------
   GLOBAL / DEFAULT SETTINGS
   ------------------------- */

let sceneMain, sceneEnv, camera, renderer;
let cubeCam, cubeTarget;
let keychainController;
let bgMain, bgEnv;
let glassMeshes = [];
let metalMeshes = [];
let cubeGlassMaterials = []; // khusus glass cube pada icon
let iconEntries = [];
let gui, guiVisible = false;

const cursor = { x: 0, y: 0 };
let idleRotation = 0;
let enableRotation = true;

// Default parameters dari tweak terakhirmu
const params = {
  // interaction
  moveStrength: 0.25,
  lerpSpeed: 0.05,
  rotationSpeed: 0.01,

  // lighting
  keyLightIntensity: 2.6,
  fillLightIntensity: 1.0,
  rimLightIntensity: 1.0,
  ambLightIntensity: 1.0,
};

// lighting handles
let keyLight, fillLight, rimLight, ambLight;

// icon GLB filenames
const iconFiles = [
  "./asset/1_keys.glb",
  "./asset/2_home.glb",
  "./asset/3_backpack.glb",
  "./asset/4_bag.glb",
  "./asset/5_locker.glb",
  "./asset/6_suitcase.glb",
];

/* -------------------------
   INIT
   ------------------------- */
function init() {
  const canvas = document.getElementById("webgl");

  sceneMain = new THREE.Scene();
  sceneMain.background = new THREE.Color(0xffffff);
  sceneEnv = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0, 3);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);

  // Lighting setup
  keyLight = new THREE.DirectionalLight(0xffffff, params.keyLightIntensity);
  keyLight.position.set(3, 4, 5);

  fillLight = new THREE.HemisphereLight(0xf5f5f5, 0xcccccc, params.fillLightIntensity);
  rimLight = new THREE.DirectionalLight(0xffffff, params.rimLightIntensity);
  rimLight.position.set(-3, 2, -4);
  ambLight = new THREE.AmbientLight(0xffffff, params.ambLightIntensity);

  sceneMain.add(keyLight, fillLight, rimLight, ambLight);
  sceneEnv.add(keyLight.clone(), fillLight.clone(), rimLight.clone(), ambLight.clone());

  // CubeCamera
  cubeTarget = new THREE.WebGLCubeRenderTarget(1024, {
    format: THREE.RGBAFormat,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
  });
  cubeCam = new THREE.CubeCamera(0.1, 100, cubeTarget);
  sceneEnv.add(cubeCam);

  const loader = new GLTFLoader();

  // === Load Background ===
  loader.load(
    "./asset/clarity_bg.glb",
    (gltf) => {
      bgMain = gltf.scene;
      bgEnv = bgMain.clone(true);
      bgMain.position.set(0, 0, 0);
      bgEnv.position.set(0, 0, 0);
      bgMain.scale.set(3.35, 3.35, 3.35);
      bgEnv.scale.set(3.35, 3.35, 3.35);

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
    },
    undefined,
    (err) => console.error("❌ clarity_bg.glb failed:", err)
  );

  // === Load Keychain ===
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
        }
      });

      if (glassMeshes.length > 0) setupGUI();
      animate();
    },
    undefined,
    (err) => console.error("❌ clarity_keychain.glb failed:", err)
  );

  // === Load 6 Icon GLB ===
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

        loct.position.set(0, 0, 0);
        rot.rotation.set(Math.PI / 2, 0, 0); // default rotX = 90°

        if (iconGlassMesh) {
          const matGlass = new THREE.MeshPhysicalMaterial({
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
          iconGlassMesh.material = matGlass;
          cubeGlassMaterials.push(matGlass);
        }

        if (iconMesh) {
          const matIcon = new THREE.MeshPhysicalMaterial({
            color: iconMesh.material?.color ? iconMesh.material.color.clone() : new THREE.Color(0xdddddd),
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
          iconMesh,
          iconGlassMesh,
          floatAmplitude: 0.15 + Math.random() * 0.1,
          floatSpeed: 0.6 + Math.random() * 0.4,
          phase: Math.random() * Math.PI * 2,
          scale: 1.0,
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

/* -------------------------
   GUI Setup
   ------------------------- */
function setupGUI() {
  gui = new GUI({ width: 320 });
  gui.domElement.classList.add("root");
  gui.hide();

  // Glass material (keychain)
  if (glassMeshes.length > 0) {
    const g = glassMeshes[0];
    const gf = gui.addFolder("Glass Material (Keychain)");
    gf.add(g, "transmission", 0, 1, 0.01);
    gf.add(g, "ior", 1.0, 2.0, 0.01);
    gf.add(g, "thickness", 0.01, 2, 0.01);
    gf.add(g, "roughness", 0, 1, 0.01);
    gf.add(g, "envMapIntensity", 0, 3, 0.1);
  }

  // Glass cubes (shared)
  if (cubeGlassMaterials.length > 0) {
    const gm = cubeGlassMaterials[0];
    const cf = gui.addFolder("Glass Cube (All Icons)");
    cf.add(gm, "transmission", 0, 1, 0.01);
    cf.add(gm, "ior", 1.0, 2.0, 0.01);
    cf.add(gm, "roughness", 0, 1, 0.01);
    cf.add(gm, "envMapIntensity", 0, 3, 0.1);
  }

  // Metal (keychain)
  if (metalMeshes.length > 0) {
    const m = metalMeshes[0];
    const mf = gui.addFolder("Metal Material (Keychain)");
    mf.add(m, "metalness", 0, 1, 0.01);
    mf.add(m, "roughness", 0, 1, 0.01);
    mf.add(m, "envMapIntensity", 0, 3, 0.1);
  }

  // Lighting controls
  const lf = gui.addFolder("Lighting Controls");
  lf.add(params, "keyLightIntensity", 0, 10, 0.1).name("Key Light").onChange((v) => (keyLight.intensity = v));
  lf.add(params, "fillLightIntensity", 0, 3, 0.1).name("Fill Light").onChange((v) => (fillLight.intensity = v));
  lf.add(params, "rimLightIntensity", 0, 3, 0.1).name("Rim Light").onChange((v) => (rimLight.intensity = v));
  lf.add(params, "ambLightIntensity", 0, 2, 0.1).name("Ambient").onChange((v) => (ambLight.intensity = v));

  // Keychain
  const kf = gui.addFolder("Keychain Controls");
  kf.add(params, "rotationSpeed", 0, 0.05, 0.001);
  kf.add(params, "moveStrength", 0, 1, 0.01);
  kf.add(params, "lerpSpeed", 0.01, 0.2, 0.01);
  kf.add({ toggleRotation: () => (enableRotation = !enableRotation) }, "toggleRotation").name("Toggle Rotation");

  iconEntries.forEach(addIconGUI);
}

function addIconGUI(entry) {
  const f = gui.addFolder(`Icon: ${entry.name}`);

  // Position
  const pos = { x: 0, y: 0, z: 0 };
  f.add(pos, "x", -5, 5, 0.01).onChange((v) => (entry.loct.position.x = v));
  f.add(pos, "y", -5, 5, 0.01).onChange((v) => (entry.loct.position.y = v));
  f.add(pos, "z", -5, 5, 0.01).onChange((v) => (entry.loct.position.z = v));

  // Rotation
  const rot = { x: Math.PI / 2, y: 0, z: 0 };
  f.add(rot, "x", -Math.PI, Math.PI, 0.01).onChange((v) => (entry.rot.rotation.x = v));
  f.add(rot, "y", -Math.PI, Math.PI, 0.01).onChange((v) => (entry.rot.rotation.y = v));
  f.add(rot, "z", -Math.PI, Math.PI, 0.01).onChange((v) => (entry.rot.rotation.z = v));

  // Scale
  f.add(entry, "scale", 0.1, 5, 0.01).name("Scale").onChange((v) => entry.loct.scale.set(v, v, v));

  // Float motion
  f.add(entry, "floatAmplitude", 0, 1, 0.01);
  f.add(entry, "floatSpeed", 0, 2, 0.01);

  // Material controls (icon only)
  if (entry.iconMesh) {
    const mat = entry.iconMesh.material;
    const mf = f.addFolder("Material");
    mf.addColor({ color: `#${mat.color.getHexString()}` }, "color").onChange((v) => mat.color.set(v));
    mf.add(mat, "metalness", 0, 1, 0.01);
    mf.add(mat, "roughness", 0, 1, 0.01);
    mf.add(mat, "envMapIntensity", 0, 3, 0.1);
  }

  f.close();
}

/* -------------------------
   TOGGLE GUI
   ------------------------- */
function toggleGUI(e) {
  if (e.key && e.key.toLowerCase() === "h" && gui) {
    guiVisible = !guiVisible;
    gui.domElement.style.display = guiVisible ? "block" : "none";
  }
}

/* -------------------------
   ANIMATE LOOP
   ------------------------- */
function animate() {
  requestAnimationFrame(animate);

  // Keychain rotation
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
    const y = entry.basePosition.y + Math.sin(t * entry.floatSpeed + entry.phase) * entry.floatAmplitude;
    entry.loct.position.y = y;
  });

  if (keychainController) keychainController.visible = false;
  iconEntries.forEach((entry) => (entry.loct.visible = false));

  cubeCam.update(renderer, sceneEnv);

  if (keychainController) keychainController.visible = true;
  iconEntries.forEach((entry) => (entry.loct.visible = true));

  renderer.render(sceneMain, camera);
}

/* -------------------------
   RESIZE
   ------------------------- */
function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

/* -------------------------
   START
   ------------------------- */
init();
setupGUI();
animate();
