import * as THREE from "three";
import { GLTFLoader } from "GLTFLoader";
import GUI from "lil-gui";

/* --------------------
   CONFIG / DEFAULTS
   -------------------- */
let sceneMain, sceneEnv, camera, renderer;
let cubeCam, cubeTarget;
let keychainController;
let bgMain, bgEnv;
let glassMeshes = [];
let gui, guiVisible = false;

const cursor = { x: 0, y: 0 };
let idleRotation = 0;

// Defaults you requested
const defaults = {
  // interaction
  moveStrength: 0.15,
  lerpSpeed: 0.04,
  rotationSpeed: 0.004, // used as idle speed multiplier

  // background defaults (point 3)
  bgScale: 3.35,
  bgPosX: 0,
  bgPosY: 0,
  bgPosZ: 0,

  // keychain defaults (point 4)
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

  // scenes
  sceneMain = new THREE.Scene();
  sceneMain.background = new THREE.Color(0xffffff);

  sceneEnv = new THREE.Scene();

  // camera (perspective main)
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0, 3);

  // renderer
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  canvasContainer.appendChild(renderer.domElement);

  // LIGHTING (as in your snippet)
  const keyLight = new THREE.DirectionalLight(0xffffff, 4);
  keyLight.position.set(3, 4, 5);

  const fillLight = new THREE.HemisphereLight(0xf5f5f5, 0xcccccc, 0.9);

  const rimLight = new THREE.DirectionalLight(0xffffff, 1);
  rimLight.position.set(-3, 2, -4);

  const ambLight = new THREE.AmbientLight(0xffffff, 0.5);

  sceneMain.add(keyLight, fillLight, rimLight, ambLight);
  sceneEnv.add(keyLight.clone(), fillLight.clone(), rimLight.clone(), ambLight.clone());

  // CUBECAMERA for env/refraction
  cubeTarget = new THREE.WebGLCubeRenderTarget(1024, {
    format: THREE.RGBAFormat,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
  });
  cubeCam = new THREE.CubeCamera(0.1, 100, cubeTarget);
  sceneEnv.add(cubeCam);

  // LOADERS
  const loader = new GLTFLoader();

  // Background loader (we clone to add to both scenes)
  loader.load(
    "./asset/clarity_bg.glb",
    (gltf) => {
      bgMain = gltf.scene;
      bgEnv = bgMain.clone(true);

      // apply your defaults
      bgMain.scale.set(defaults.bgScale, defaults.bgScale, defaults.bgScale);
      bgEnv.scale.set(defaults.bgScale, defaults.bgScale, defaults.bgScale);

      bgMain.position.set(defaults.bgPosX, defaults.bgPosY, defaults.bgPosZ);
      bgEnv.position.set(defaults.bgPosX, defaults.bgPosY, defaults.bgPosZ);

      // ensure materials on bg are MeshBasic so they render as-is
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

      console.log("✅ clarity_bg.glb dimuat (bgMain & bgEnv)");
    },
    undefined,
    (err) => console.error("❌ Gagal memuat clarity_bg.glb:", err)
  );

  // Keychain loader (interactive)
  loader.load(
    "./asset/clarity_keychain.glb",
    (gltf) => {
      const model = gltf.scene;

      // apply default scale & position to root model
      model.scale.set(defaults.keyScale, defaults.keyScale, defaults.keyScale);
      model.position.set(defaults.keyPosX, defaults.keyPosY, defaults.keyPosZ);

      sceneMain.add(model);

      // find the controller empty (allow both spellings)
      keychainController =
        model.getObjectByName("Keychain Controler") ||
        model.getObjectByName("Keychain Controller") ||
        model;

      // traverse and replace materials as in your snippet
      model.traverse((child) => {
        if (child.isMesh) {
          const name = (child.name || "").toLowerCase();

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

      // after load: setup GUI if we have glass materials
      if (glassMeshes.length > 0) setupGUI();

      animate();
      console.log("✅ clarity_keychain.glb dimuat");
    },
    undefined,
    (err) => console.error("❌ Gagal memuat clarity_keychain.glb:", err)
  );

  // mouse interaction
  window.addEventListener("mousemove", (e) => {
    cursor.x = (e.clientX / window.innerWidth - 0.5) * 2;
    cursor.y = -(e.clientY / window.innerHeight - 0.5) * 2;
  });

  window.addEventListener("resize", onResize, false);
  window.addEventListener("keydown", toggleGUI);
}

/* --------------------
   GUI
   -------------------- */
function setupGUI() {
  gui = new GUI({ width: 300 });
  gui.domElement.classList.add("root"); // will be hidden by CSS by default

  // Glass folder: match your earlier params and ensure no duplicates with sandblasted
  const mat = glassMeshes[0];
  const glassFolder = gui.addFolder("Glass Material");
  glassFolder.add(mat, "transmission", 0, 1, 0.01).name("transmission");
  glassFolder.add(mat, "ior", 1.0, 2.0, 0.01).name("ior");
  glassFolder.add(mat, "thickness", 0.1, 5, 0.1).name("thickness");
  glassFolder.add(mat, "roughness", 0, 1, 0.01).name("roughness");
  glassFolder.add(mat, "metalness", 0, 1, 0.01).name("metalness");
  glassFolder.add(mat, "envMapIntensity", 0, 3, 0.1).name("envMapIntensity");

  // Background controls
  const bgFolder = gui.addFolder("Background Controls");
  const bgParams = {
    scale: bgMain ? bgMain.scale.x : defaults.bgScale,
    posX: bgMain ? bgMain.position.x : defaults.bgPosX,
    posY: bgMain ? bgMain.position.y : defaults.bgPosY,
    posZ: bgMain ? bgMain.position.z : defaults.bgPosZ,
  };

  bgFolder.add(bgParams, "scale", 0.5, 10, 0.01).name("Scale").onChange((v) => {
    if (bgMain && bgEnv) {
      bgMain.scale.set(v, v, v);
      bgEnv.scale.set(v, v, v);
    }
  });
  bgFolder.add(bgParams, "posX", -5, 5, 0.01).name("Pos X").onChange((v) => {
    if (bgMain && bgEnv) {
      bgMain.position.x = v;
      bgEnv.position.x = v;
    }
  });
  bgFolder.add(bgParams, "posY", -5, 5, 0.01).name("Pos Y").onChange((v) => {
    if (bgMain && bgEnv) {
      bgMain.position.y = v;
      bgEnv.position.y = v;
    }
  });
  bgFolder.add(bgParams, "posZ", -10, 10, 0.01).name("Pos Z").onChange((v) => {
    if (bgMain && bgEnv) {
      bgMain.position.z = v;
      bgEnv.position.z = v;
    }
  });

  // Keychain controls (scale & pos)
  const keyFolder = gui.addFolder("Keychain Controls");
  const keyParams = {
    scale: defaults.keyScale,
    posX: defaults.keyPosX,
    posY: defaults.keyPosY,
    posZ: defaults.keyPosZ,
  };

  keyFolder.add(keyParams, "scale", 0.1, 10, 0.01).name("Scale").onChange((v) => {
    if (keychainController) keychainController.scale.set(v, v, v);
  });
  keyFolder.add(keyParams, "posX", -5, 5, 0.01).name("Pos X").onChange((v) => {
    if (keychainController) keychainController.position.x = v;
  });
  keyFolder.add(keyParams, "posY", -5, 5, 0.01).name("Pos Y").onChange((v) => {
    if (keychainController) keychainController.position.y = v;
  });
  keyFolder.add(keyParams, "posZ", -5, 5, 0.01).name("Pos Z").onChange((v) => {
    if (keychainController) keychainController.position.z = v;
  });

  // Interaction controls for follow cursor & rotation
  const interFolder = gui.addFolder("Interaction");
  interFolder.add(defaults, "moveStrength", 0, 2, 0.01).name("Move Strength");
  interFolder.add(defaults, "lerpSpeed", 0.01, 0.3, 0.01).name("Lerp Speed");
  interFolder.add(defaults, "rotationSpeed", 0.001, 0.05, 0.001).name("Rotation Speed");

  // minimal lighting control: global intensity (we added lights manually in init)
  const lightFolder = gui.addFolder("Lighting");
  // manipulate key directional intensity on all clones in sceneMain
  const lightParams = { intensity: 5 }; // default as in snippet
  lightFolder.add(lightParams, "intensity", 0, 8, 0.1).name("Key Intensity").onChange((v) => {
    // find directional lights in sceneMain and set their intensity
    sceneMain.traverse((o) => {
      if (o.isDirectionalLight) o.intensity = v;
    });
    // sceneEnv clones already made earlier will remain same but they are clones of initial lights
  });

  // Hide gui by default (we use class .root style in index.html)
  gui.hide();
  // keep folders closed by default for cleanliness
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
   ANIMATE
   -------------------- */
function animate() {
  requestAnimationFrame(animate);

  if (keychainController) {
    // Idle rotation: keep x,z fixed and rotate y continuously
    idleRotation += defaults.rotationSpeed;
    // set rotation as you requested: (x=1, y=idle, z=0.6)
    keychainController.rotation.x = 1; // in radians (if you prefer degrees we can convert)
    keychainController.rotation.y = idleRotation;
    keychainController.rotation.z = 0.6;

    // follow cursor with lerp
    const targetX = cursor.x * defaults.moveStrength;
    const targetY = cursor.y * defaults.moveStrength;
    keychainController.position.x += (targetX - keychainController.position.x) * defaults.lerpSpeed;
    keychainController.position.y += (targetY - keychainController.position.y) * defaults.lerpSpeed;

    // update cube camera: hide object while capturing
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
