import * as THREE from "three";
import { GLTFLoader } from "GLTFLoader";
import GUI from "lil-gui";

let sceneMain, sceneEnv, camera, renderer;
let cubeCam, cubeTarget;
let keychainController;
let glassMeshes = [];
let gui;

const cursor = { x: 0, y: 0 };
let idleRotation = 0;
const rotationSpeed = 0.01;
const moveStrength = 0.5;
const lerpSpeed = 0.05;

function init() {
  const canvas = document.getElementById("webgl");

  sceneMain = new THREE.Scene();
  sceneMain.background = new THREE.Color(0xffffff);

  sceneEnv = new THREE.Scene(); // untuk cubeCamera capture

  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0, 3);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);

  const ambLight = new THREE.AmbientLight(0xffffff, 1.5);
  const dirLight = new THREE.DirectionalLight(0xffffff, 3);
  dirLight.position.set(5, 5, 5);
  sceneMain.add(ambLight, dirLight);
  sceneEnv.add(ambLight.clone(), dirLight.clone());

  // CubeCamera for refraction
  cubeTarget = new THREE.WebGLCubeRenderTarget(1024, {
    format: THREE.RGBAFormat,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
  });
  cubeCam = new THREE.CubeCamera(0.1, 100, cubeTarget);
  sceneEnv.add(cubeCam);

  const loader = new GLTFLoader();

  // 1️⃣ Load Background (static)
  loader.load(
    "./asset/clarity_bg.glb",
    (gltf) => {
      const bg = gltf.scene;
      sceneEnv.add(bg);
      console.log("✅ clarity_bg.glb dimuat (background diam)");
    },
    undefined,
    (err) => console.error("❌ Gagal memuat clarity_bg.glb:", err)
  );

  // 2️⃣ Load Keychain (interactive)
  loader.load(
    "./asset/clarity_keychain.glb",
    (gltf) => {
      const model = gltf.scene;
      model.scale.set(4, 4, 4);
      sceneMain.add(model);

      keychainController =
        model.getObjectByName("Keychain Controler") || // nama dari Blender kamu
        model.getObjectByName("Keychain Controller") || // fallback
        model;

      model.traverse((child) => {
        if (child.isMesh) {
          const name = child.name.toLowerCase();

          // plastik (glass)
          if (name.includes("plastik")) {
            const mat = new THREE.MeshPhysicalMaterial({
              color: 0xffffff,
              roughness: 0.05,
              metalness: 0,
              transmission: 1,
              ior: 1.3,
              thickness: 2,
              envMap: cubeTarget.texture,
              envMapIntensity: 1.0,
              clearcoat: 1,
              clearcoatRoughness: 0.1,
            });
            child.material = mat;
            glassMeshes.push(mat);
          }

          // besi
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
      console.log("✅ clarity_keychain.glb dimuat (objek utama)");
    },
    undefined,
    (err) => console.error("❌ Gagal memuat clarity_keychain.glb:", err)
  );

  window.addEventListener("mousemove", (e) => {
    cursor.x = (e.clientX / window.innerWidth - 0.5) * 2;
    cursor.y = -(e.clientY / window.innerHeight - 0.5) * 2;
  });

  window.addEventListener("resize", onResize);
}

function setupGUI() {
  gui = new GUI();
  const folder = gui.addFolder("Glass Material");
  const mat = glassMeshes[0];

  folder.add(mat, "transmission", 0, 1, 0.01);
  folder.add(mat, "ior", 1.0, 2.0, 0.01);
  folder.add(mat, "thickness", 0.1, 5, 0.1);
  folder.add(mat, "roughness", 0, 1, 0.01);
  folder.add(mat, "metalness", 0, 1, 0.01);
  folder.add(mat, "envMapIntensity", 0, 3, 0.1);
  folder.open();
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  requestAnimationFrame(animate);

  if (keychainController) {
    idleRotation += rotationSpeed;
    keychainController.rotation.y = idleRotation;
    keychainController.rotation.x = 1;
    keychainController.rotation.z = 0.6;

    const targetX = cursor.x * moveStrength;
    const targetY = cursor.y * moveStrength;
    keychainController.position.x += (targetX - keychainController.position.x) * lerpSpeed;
    keychainController.position.y += (targetY - keychainController.position.y) * lerpSpeed;

    keychainController.visible = false;
    cubeCam.update(renderer, sceneEnv); // hanya tangkap background
    keychainController.visible = true;
  }

  renderer.render(sceneMain, camera);
}

init();
