import * as THREE from "three";
import { GLTFLoader } from "GLTFLoader";

let scene, camera, renderer;
let model, cubeCam, cubeTarget;
const cursor = { x: 0, y: 0 };
const rotationLerp = 0.06;

function init() {
  const canvas = document.getElementById("webgl");
  scene = new THREE.Scene();

  const aspect = window.innerWidth / window.innerHeight;
  camera = new THREE.PerspectiveCamera(65, aspect, 0.1, 100);
  camera.position.set(0, 0, 3);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  scene.add(new THREE.AmbientLight(0xffffff, 1.2));
  const dirLight = new THREE.DirectionalLight(0xffffff, 2);
  dirLight.position.set(3, 4, 5);
  scene.add(dirLight);

  // CubeCamera for refraction
  cubeTarget = new THREE.WebGLCubeRenderTarget(512, {
    format: THREE.RGBAFormat,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
  });
  cubeCam = new THREE.CubeCamera(0.1, 100, cubeTarget);
  scene.add(cubeCam);

  const loader = new GLTFLoader();
  loader.load(
    "./asset/clarity.glb",
    (gltf) => {
      model = gltf.scene;
      model.scale.set(45, 45, 45);
      scene.add(model);

      model.traverse((child) => {
        if (child.isMesh) {
          child.material = new THREE.MeshPhysicalMaterial({
            color: 0xffffff,
            metalness: 0,
            roughness: 0,
            transmission: 1.0,
            thickness: 1.5,
            ior: 1.45,
            envMap: cubeTarget.texture,
            reflectivity: 0.9,
            clearcoat: 1.0,
            clearcoatRoughness: 0.05,
          });
        }
      });

      animate();
    },
    undefined,
    (err) => console.error("❌ gagal load model:", err)
  );

  window.addEventListener("mousemove", (e) => {
    cursor.x = (e.clientX / window.innerWidth - 0.5) * 2;
    cursor.y = -(e.clientY / window.innerHeight - 0.5) * 2;
  });

  window.addEventListener("resize", onResize);
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  requestAnimationFrame(animate);

  if (model) {
    model.rotation.y += (cursor.x * 0.8 - model.rotation.y) * rotationLerp;
    model.rotation.x += (cursor.y * 0.6 - model.rotation.x) * rotationLerp;
    model.rotation.y += 0.005;

    model.visible = false;
    cubeCam.update(renderer, scene);
    model.visible = true;
  }

  renderer.render(scene, camera);
}

init();
