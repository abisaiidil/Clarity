import * as THREE from "three";
import { GLTFLoader } from "GLTFLoader";
import GUI from "lil-gui";

let scene, camera, renderer;
let keychainController, cubeCam, cubeTarget;
let gui;

const cursor = { x: 0, y: 0 };
const rotationLerp = 0.05;
let idleRotation = 0;

function init() {
  const canvas = document.getElementById("webgl");
  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0, 3);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);

  const ambLight = new THREE.AmbientLight(0xffffff, 1.2);
  const dirLight = new THREE.DirectionalLight(0xffffff, 2);
  dirLight.position.set(3, 5, 6);
  scene.add(ambLight, dirLight);

  cubeTarget = new THREE.WebGLCubeRenderTarget(1024, {
    format: THREE.RGBAFormat,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
  });
  cubeCam = new THREE.CubeCamera(0.1, 100, cubeTarget);
  scene.add(cubeCam);

  const loader = new GLTFLoader();
  loader.load(
    "./asset/clarity_keychain.glb",
    (gltf) => {
      const model = gltf.scene;
      model.scale.set(4, 4, 4); // scale dasar
      scene.add(model);

      keychainController = model.getObjectByName("Keychain Controller") || model;
      keychainController.rotation.set(0, 0, 0); // rotasi awal

      model.traverse((child) => {
        if (child.isMesh) {
          if (child.name.toLowerCase().includes("plastik")) {
            child.material = new THREE.MeshPhysicalMaterial({
              color: 0xffffff,
              transmission: 1,
              ior: 1.3,
              thickness: 1.5,
              roughness: 0,
              metalness: 0,
              envMap: cubeTarget.texture,
            });
          } else if (child.name.toLowerCase().includes("besi")) {
            child.material = new THREE.MeshPhysicalMaterial({
              color: 0xffffff,
              metalness: 1,
              roughness: 0.3,
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
  const folder = gui.addFolder("Keychain Transform");

  const pos = keychainController.position;
  const rot = keychainController.rotation;
  const scl = keychainController.scale;

  folder.add(pos, "x", -2, 2, 0.01).name("Pos X");
  folder.add(pos, "y", -2, 2, 0.01).name("Pos Y");
  folder.add(pos, "z", -2, 2, 0.01).name("Pos Z");

  folder.add(rot, "x", -Math.PI, Math.PI, 0.01).name("Rot X");
  folder.add(rot, "y", -Math.PI, Math.PI, 0.01).name("Rot Y");
  folder.add(rot, "z", -Math.PI, Math.PI, 0.01).name("Rot Z");

  folder.add(scl, "x", 0.1, 20, 0.1).name("Scale X");
  folder.add(scl, "y", 0.1, 20, 0.1).name("Scale Y");
  folder.add(scl, "z", 0.1, 20, 0.1).name("Scale Z");

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
    idleRotation += 0.01; // rotasi idle 360 derajat
    keychainController.rotation.y = idleRotation;

    // follow mouse smooth (overlay sedikit di atas idle spin)
    keychainController.rotation.x += (cursor.y * 0.3 - keychainController.rotation.x) * rotationLerp;
    keychainController.rotation.z += (cursor.x * 0.3 - keychainController.rotation.z) * rotationLerp;

    // refraksi realtime
    keychainController.visible = false;
    cubeCam.update(renderer, scene);
    keychainController.visible = true;
  }

  renderer.render(scene, camera);
}

init();
