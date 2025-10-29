// main.js (icons + keychain + bg + GUI controls per-icon)
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
let iconEntries = []; // store loaded icon objects + meta
let gui, guiVisible = false;

const cursor = { x: 0, y: 0 };
let idleRotation = 0;
let enableRotation = true;

// Default parameters (use your tweaked values)
const params = {
  // interaction (keychain)
  moveStrength: 0.25,
  lerpSpeed: 0.05,
  rotationSpeed: 0.01,

  // lighting intensities (defaults from your tweak)
  keyLightIntensity: 2.6,
  fillLightIntensity: 1.0,
  rimLightIntensity: 1.0,
  ambLightIntensity: 1.0,
};

// lighting handles (set later)
let keyLight, fillLight, rimLight, ambLight;

// icon GLB filenames (in asset/ folder)
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

  // Basic scenes
  sceneMain = new THREE.Scene();
  sceneMain.background = new THREE.Color(0xffffff);
  sceneEnv = new THREE.Scene();

  // Camera
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0, 3);

  // Renderer
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);

  // Lighting (defaults and references)
  keyLight = new THREE.DirectionalLight(0xffffff, params.keyLightIntensity);
  keyLight.position.set(3, 4, 5);

  fillLight = new THREE.HemisphereLight(0xf5f5f5, 0xcccccc, params.fillLightIntensity);

  rimLight = new THREE.DirectionalLight(0xffffff, params.rimLightIntensity);
  rimLight.position.set(-3, 2, -4);

  ambLight = new THREE.AmbientLight(0xffffff, params.ambLightIntensity);

  sceneMain.add(keyLight, fillLight, rimLight, ambLight);
  sceneEnv.add(keyLight.clone(), fillLight.clone(), rimLight.clone(), ambLight.clone());

  // Cube camera for env/reflections used by glass & metal
  cubeTarget = new THREE.WebGLCubeRenderTarget(1024, {
    format: THREE.RGBAFormat,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
  });
  cubeCam = new THREE.CubeCamera(0.1, 100, cubeTarget);
  sceneEnv.add(cubeCam);

  const loader = new GLTFLoader();

  // Load background (clarity_bg.glb) into both scenes (main + env)
  loader.load(
    "./asset/clarity_bg.glb",
    (gltf) => {
      bgMain = gltf.scene;
      bgEnv = bgMain.clone(true);

      // default transform (your preferred defaults)
      bgMain.position.set(0, 0, 0);
      bgEnv.position.set(0, 0, 0);
      bgMain.scale.set(3.35, 3.35, 3.35);
      bgEnv.scale.set(3.35, 3.35, 3.35);

      // convert background materials to MeshBasicMaterial (not affected by lights)
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
      console.log("✅ clarity_bg.glb loaded");
    },
    undefined,
    (err) => console.error("❌ clarity_bg.glb failed:", err)
  );

  // Load keychain (clarity_keychain.glb) — same material defaults you requested
  loader.load(
    "./asset/clarity_keychain.glb",
    (gltf) => {
      const model = gltf.scene;
      model.scale.set(1.7, 1.7, 1.7);
      model.position.set(0, 0, 1.12);
      sceneMain.add(model);

      // find controller empty
      keychainController =
        model.getObjectByName("Keychain Controler") ||
        model.getObjectByName("Keychain Controller") ||
        model;

      // replace materials for glass & metal parts like before (defaults from you)
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
              roughness: 0.2, // from your final tweak
              envMap: cubeTarget.texture,
              envMapIntensity: 2.0,
            });
            child.material = mat;
            metalMeshes.push(mat);
          }
        }
      });

      if (glassMeshes.length > 0) setupGUI(); // setup GUI once we have glass material reference
      animate();
      console.log("✅ clarity_keychain.glb loaded");
    },
    undefined,
    (err) => console.error("❌ clarity_keychain.glb failed:", err)
  );

  // Load icons (array of GLBs). Each icon GLB expected to follow structure:
  // loct_name -> rot_name -> [icon mesh, glass mesh]
  iconFiles.forEach((path, idx) => {
    loader.load(
      path,
      (gltf) => {
        // root may already be the loct_ empty or a group containing it.
        // We'll try to locate an object whose name starts with 'loct_'
        const sceneRoot = gltf.scene;
        let loct = null;

        // search for loct_ name in the loaded scene
        sceneRoot.traverse((o) => {
          if (!loct && o.type === "Object3D" && (o.name || "").toLowerCase().startsWith("loct_")) {
            loct = o;
          }
        });

        // If not found, use the root of gltf (fallback)
        if (!loct) loct = sceneRoot;

        // find rot_ child under loct (search immediate children first)
        let rot = null;
        loct.children.forEach((c) => {
          if ((c.name || "").toLowerCase().startsWith("rot_")) rot = c;
        });
        if (!rot) {
          // fallback: search deeper
          loct.traverse((o) => {
            if (!rot && (o.name || "").toLowerCase().startsWith("rot_")) rot = o;
          });
        }
        if (!rot) rot = loct; // fallback to loct itself

        // expect icon mesh and glass mesh nested under rot
        // find icon mesh (not glass) and glass mesh by name includes 'glass_'
        let iconMesh = null;
        let iconGlassMesh = null;
        rot.traverse((m) => {
          if (m.isMesh) {
            const nm = (m.name || "").toLowerCase();
            if (nm.includes("glass_")) iconGlassMesh = m;
            else if (!iconMesh) iconMesh = m; // first non-glass mesh becomes icon
          }
        });

        // ensure loct transform defaults
        loct.position.set(0, 0, 0);
        rot.rotation.set(0, 0, 0);

        // Materials: apply consistent materials that share cubeTarget.texture
        if (iconGlassMesh) {
          iconGlassMesh.material = new THREE.MeshPhysicalMaterial({
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
        }
        if (iconMesh) {
          // colored icon material, slightly glossy
          iconMesh.material = new THREE.MeshPhysicalMaterial({
            color: iconMesh.material?.color ? iconMesh.material.color.clone() : new THREE.Color(0xdddddd),
            roughness: 0.2,
            metalness: 0.1,
            envMap: cubeTarget.texture,
            envMapIntensity: 2.0,
          });
        }

        // Add to sceneMain and sceneEnv clones
        sceneMain.add(loct);
        const loctEnv = loct.clone(true);
        // Ensure env clone also uses similar material types (we just add clone to sceneEnv);
        sceneEnv.add(loctEnv);

        // Save metadata entry for animation & GUI control
        const entry = {
          name: loct.name || `icon_${idx}`,
          loct,
          rot,
          basePosition: loct.position.clone(),
          // per-icon float defaults (you get GUI to change)
          floatAmplitude: 0.15 + Math.random() * 0.1,
          floatSpeed: 0.6 + Math.random() * 0.4,
          phase: Math.random() * Math.PI * 2, // random offset
        };
        iconEntries.push(entry);

        // Add GUI folder for this icon (if GUI already exists)
        if (gui) addIconGUI(entry);

        console.log(`✅ icon loaded: ${path} -> ${entry.name}`);
      },
      undefined,
      (err) => console.error("❌ icon load failed:", path, err)
    );
  });

  // events
  window.addEventListener("mousemove", (e) => {
    cursor.x = (e.clientX / window.innerWidth - 0.5) * 2;
    cursor.y = -(e.clientY / window.innerHeight - 0.5) * 2;
  });
  window.addEventListener("resize", onResize);
  window.addEventListener("keydown", toggleGUI);
}

/* -------------------------
   GUI Setup
   - single glass/metal folders (global)
   - lighting folder (separate controls for 4 lights)
   - keychain controls
   - per-icon folders added when icon loads
   ------------------------- */
function setupGUI() {
  gui = new GUI({ width: 320 });
  gui.domElement.classList.add("root");
  gui.hide(); // hidden by default, show with H

  // GLASS material controls (first glass material from keychain)
  if (glassMeshes.length > 0) {
    const g = glassMeshes[0];
    const gf = gui.addFolder("Glass Material");
    gf.add(g, "transmission", 0, 1, 0.01);
    gf.add(g, "ior", 1.0, 2.0, 0.01);
    gf.add(g, "thickness", 0.01, 2, 0.01);
    gf.add(g, "roughness", 0, 1, 0.01);
    gf.add(g, "envMapIntensity", 0, 3, 0.1);
  }

  // METAL material controls (first metal material)
  if (metalMeshes.length > 0) {
    const m = metalMeshes[0];
    const mf = gui.addFolder("Metal Material");
    mf.add(m, "metalness", 0, 1, 0.01);
    mf.add(m, "roughness", 0, 1, 0.01);
    mf.add(m, "envMapIntensity", 0, 3, 0.1);
  }

  // Lighting controls (4 lights separately)
  const lightFolder = gui.addFolder("Lighting Controls");
  lightFolder.add(params, "keyLightIntensity", 0, 10, 0.1).name("Key Light").onChange((v) => (keyLight.intensity = v));
  lightFolder.add(params, "fillLightIntensity", 0, 3, 0.1).name("Fill Light").onChange((v) => (fillLight.intensity = v));
  lightFolder.add(params, "rimLightIntensity", 0, 3, 0.1).name("Rim Light").onChange((v) => (rimLight.intensity = v));
  lightFolder.add(params, "ambLightIntensity", 0, 2, 0.1).name("Ambient").onChange((v) => (ambLight.intensity = v));

  // Keychain controls and interaction params
  const keyFolder = gui.addFolder("Keychain Controls");
  keyFolder.add(params, "rotationSpeed", 0, 0.05, 0.001).name("Rotation Speed");
  keyFolder.add(params, "moveStrength", 0, 1, 0.01).name("Move Strength");
  keyFolder.add(params, "lerpSpeed", 0.01, 0.2, 0.01).name("Lerp Speed");
  keyFolder.add({ toggleRotation: () => (enableRotation = !enableRotation) }, "toggleRotation").name("Toggle Rotation");

  // Add folders for icons that already loaded
  iconEntries.forEach(addIconGUI);
}

/* helper: add GUI controls for a single icon entry */
function addIconGUI(entry) {
  // avoid duplicate folder
  const existing = gui.__folders && gui.__folders[`Icon: ${entry.name}`];
  if (existing) return;

  const folder = gui.addFolder(`Icon: ${entry.name}`);
  // position controls (X/Y/Z)
  const pos = { x: entry.loct.position.x, y: entry.loct.position.y, z: entry.loct.position.z };
  folder.add(pos, "x", -5, 5, 0.01).name("posX").onChange((v) => (entry.loct.position.x = v));
  folder.add(pos, "y", -5, 5, 0.01).name("posY").onChange((v) => (entry.loct.position.y = v));
  folder.add(pos, "z", -5, 5, 0.01).name("posZ").onChange((v) => (entry.loct.position.z = v));

  // rotation (rot_ empty controls orientation)
  const rot = { x: entry.rot.rotation.x, y: entry.rot.rotation.y, z: entry.rot.rotation.z };
  folder.add(rot, "x", -Math.PI, Math.PI, 0.01).name("rotX").onChange((v) => (entry.rot.rotation.x = v));
  folder.add(rot, "y", -Math.PI, Math.PI, 0.01).name("rotY").onChange((v) => (entry.rot.rotation.y = v));
  folder.add(rot, "z", -Math.PI, Math.PI, 0.01).name("rotZ").onChange((v) => (entry.rot.rotation.z = v));

  // floating controls
  folder.add(entry, "floatAmplitude", 0, 1, 0.01).name("floatAmplitude");
  folder.add(entry, "floatSpeed", 0, 2, 0.01).name("floatSpeed");

  folder.close();
}

/* -------------------------
   GUI Toggle (H)
   ------------------------- */
function toggleGUI(e) {
  if (e.key && e.key.toLowerCase() === "h" && gui) {
    guiVisible = !guiVisible;
    gui.domElement.style.display = guiVisible ? "block" : "none";
  }
}

/* -------------------------
   ANIMATE / LOOP
   ------------------------- */
function animate() {
  requestAnimationFrame(animate);

  // Keychain rotation + follow cursor
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

  // Update icon floating animation
  const t = performance.now() / 1000;
  iconEntries.forEach((entry) => {
    // baseY is entry.basePosition.y — use stored base + sin offset
    const amplitude = entry.floatAmplitude;
    const speed = entry.floatSpeed;
    const y = entry.basePosition.y + Math.sin(t * speed + entry.phase) * amplitude;
    entry.loct.position.y = y;
    // we intentionally DO NOT change rot here (rot is static orientation controlled by GUI)
  });

  // Update cube camera for env/reflection: hide keychain + icons in main, render env, then show
  if (keychainController) {
    keychainController.visible = false;
  }
  // also hide icon meshes in main (to avoid capturing themselves in environment) — optional.
  iconEntries.forEach((entry) => {
    entry.loct.visible = false;
  });

  // render cube camera from the center (we use sceneEnv)
  cubeCam.update(renderer, sceneEnv);

  // restore visibility
  if (keychainController) keychainController.visible = true;
  iconEntries.forEach((entry) => (entry.loct.visible = true));

  // finally render main scene
  renderer.render(sceneMain, camera);
}

/* -------------------------
   RESIZE Handler
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
setupGUI(); // create GUI (it will add per-icon folders when icons load)
animate();
