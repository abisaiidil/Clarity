import * as THREE from "three";
import { GLTFLoader } from "GLTFLoader";
import GUI from "lil-gui";

let scene, camera, renderer;
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
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffffff);

  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0, 3);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);

  // Lighting
  const ambLight = new THREE.AmbientLight(0xffffff, 1.5);
  const dirLight = new THREE.DirectionalLight(0xffffff, 3);
  dirLight.position.set(5, 5, 5);
  scene.add(ambLight, dirLight);

  // CubeCamera for refraction
  cubeTarget = new THREE.WebGLCubeRenderTarget(1024, {
    format: THREE.RGBAFormat,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
  });
  cubeCam = new THREE.CubeCamera(0.1, 100, cubeTarget);
  scene.add(cubeCam);

  // Load model
  const loader = new GLTFLoader();
  loader.load(
    "./asset/clarity.glb",
    (gltf) => {
      const model = gltf.scene;
      model.scale.set(4, 4, 4);
      scene.add(model);

      keychainController = model.getObjectByName("Keychain Controler") || model;

      model.traverse((child) => {
        if (child.isMesh) {
          if (child.name.toLowerCase().includes("plastik") || child.material?.name.toLowerCase().includes("plastik")) {
            const mat = new THREE.MeshPhysicalMaterial({
              color: 0xffffff,
              metalness: 0,
              roughness: 0.05,
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
          } else if (child.name.toLowerCase().includes("besi")) {
            child.material = new THREE.MeshPhysicalMaterial({
              color: 0xffffff,
              metalness: 1,
              roughness: 0.3,
            });
          } else if (child.name.toLowerCase().includes("clarity web hero")) {
            // background plane stays fixed
            child.material = new THREE.MeshBasicMaterial({
              map: child.material.map || null,
              toneMapped: false,
            });
          }
        }
      });

      setupGUI();
      animate();
    },
    undefined,
    (err) => console.error("❌ Failed to load GLB:", err)
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
    // idle rotation
    idleRotation += rotationSpeed;
    keychainController.rotation.y = idleRotation;
    keychainController.rotation.x = 1;
    keychainController.rotation.z = 0.6;

    // movement follow cursor
    const targetX = cursor.x * moveStrength;
    const targetY = cursor.y * moveStrength;
    keychainController.position.x += (targetX - keychainController.position.x) * lerpSpeed;
    keychainController.position.y += (targetY - keychainController.position.y) * lerpSpeed;

    // update refraction
    keychainController.visible = false;
    cubeCam.update(renderer, scene);
    keychainController.visible = true;
  }

  renderer.render(scene, camera);
}

init();
