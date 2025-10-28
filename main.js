import * as THREE from 'https://unpkg.com/three@0.155.0/build/three.module.js';
import { GLTFLoader } from 'https://unpkg.com/three@0.155.0/examples/jsm/loaders/GLTFLoader.js';
import GUI from 'https://cdn.jsdelivr.net/npm/lil-gui@0.19/+esm';

// === SETUP DASAR ===
let scene, camera, renderer;
let keychain, background;
let clock = new THREE.Clock();

// === PARAMETER INTERAKSI ===
const params = {
  moveStrength: 0.4,
  lerpSpeed: 0.05,
  rotationSpeed: 0.3,
  glassRoughness: 0.05,
  glassTransmission: 1.0,
  sandIntensity: 0.15,
};

// === SETUP SCENE ===
const container = document.getElementById('three-container');
scene = new THREE.Scene();

// === CAMERA ===
camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 3);

// === RENDERER ===
renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

// === LIGHTING ===
const ambient = new THREE.AmbientLight(0xffffff, 1.2);
scene.add(ambient);

const dirLight = new THREE.DirectionalLight(0xffffff, 2.5);
dirLight.position.set(2, 4, 3);
scene.add(dirLight);

// === NOISE TEXTURE (untuk efek sandblasted) ===
const noiseCanvas = document.createElement('canvas');
noiseCanvas.width = 128;
noiseCanvas.height = 128;
const nctx = noiseCanvas.getContext('2d');
const nimg = nctx.createImageData(128, 128);
for (let i = 0; i < nimg.data.length; i += 4) {
  const shade = Math.random() * 255;
  nimg.data[i] = nimg.data[i + 1] = nimg.data[i + 2] = shade;
  nimg.data[i + 3] = 255;
}
nctx.putImageData(nimg, 0, 0);
const noiseTexture = new THREE.CanvasTexture(noiseCanvas);
noiseTexture.wrapS = noiseTexture.wrapT = THREE.RepeatWrapping;
noiseTexture.repeat.set(4, 4);

// === LOADERS ===
const loader = new GLTFLoader();
const cubeRenderTarget = new THREE.WebGLCubeRenderTarget(256, {
  format: THREE.RGBAFormat,
  generateMipmaps: true,
  minFilter: THREE.LinearMipmapLinearFilter,
});
const cubeCamera = new THREE.CubeCamera(0.1, 10, cubeRenderTarget);
scene.add(cubeCamera);

// === LOAD BACKGROUND ===
loader.load('./asset/clarity_bg.glb', (gltf) => {
  background = gltf.scene;
  background.scale.set(6.5, 6.5, 6.5);
  background.position.set(0, 0, -0.3);
  scene.add(background);
});

// === LOAD KEYCHAIN ===
loader.load('./asset/clarity_keychain.glb', (gltf) => {
  keychain = gltf.scene.getObjectByName('Keychain Controler') || gltf.scene;
  keychain.scale.set(4, 4, 4);
  scene.add(keychain);

  keychain.traverse((child) => {
    if (child.isMesh && child.name === 'plastik') {
      child.material = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        roughness: params.glassRoughness,
        transmission: params.glassTransmission,
        ior: 1.33,
        thickness: 0.5,
        envMap: cubeRenderTarget.texture,
        envMapIntensity: 1,
        normalMap: noiseTexture,
        normalScale: new THREE.Vector2(params.sandIntensity, params.sandIntensity),
      });
    }
    if (child.isMesh && child.name === 'besi') {
      child.material = new THREE.MeshPhysicalMaterial({
        color: 0x888888,
        metalness: 1,
        roughness: 0.3,
      });
    }
  });

  setupGUI();
  animate();
});

// === INTERAKSI MOUSE ===
const targetPos = new THREE.Vector3();
const mouse = new THREE.Vector2();
window.addEventListener('mousemove', (e) => {
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
});

// === RESIZE ===
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// === GUI ===
let gui;
function setupGUI() {
  gui = new GUI({ title: 'Controls' });
  gui.hide();

  const glass = gui.addFolder('Glass Material');
  glass.add(params, 'glassRoughness', 0, 1, 0.01).onChange(updateMaterial);
  glass.add(params, 'glassTransmission', 0, 1, 0.01).onChange(updateMaterial);
  glass.add(params, 'sandIntensity', 0, 1, 0.01).onChange(updateMaterial);

  const inter = gui.addFolder('Interaction');
  inter.add(params, 'moveStrength', 0, 2, 0.01);
  inter.add(params, 'lerpSpeed', 0.01, 0.2, 0.01);
  inter.add(params, 'rotationSpeed', 0.1, 1, 0.01);

  window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'g') {
      gui._hidden ? gui.show() : gui.hide();
    }
  });
}

function updateMaterial() {
  if (!keychain) return;
  keychain.traverse((child) => {
    if (child.isMesh && child.name === 'plastik') {
      child.material.roughness = params.glassRoughness;
      child.material.transmission = params.glassTransmission;
      child.material.normalScale.set(params.sandIntensity, params.sandIntensity);
      child.material.needsUpdate = true;
    }
  });
}

// === ANIMATE ===
function animate() {
  requestAnimationFrame(animate);

  if (keychain) {
    const t = clock.getElapsedTime();

    // Idle rotation
    keychain.rotation.x = Math.sin(t * params.rotationSpeed) * 0.5 + 1;
    keychain.rotation.y += 0.005;

    // Follow cursor (smooth movement)
    const targetX = mouse.x * params.moveStrength;
    const targetY = mouse.y * params.moveStrength;
    targetPos.lerp(new THREE.Vector3(targetX, targetY, 0), params.lerpSpeed);
    keychain.position.x = targetPos.x;
    keychain.position.y = targetPos.y;

    // Update refractive cube camera
    keychain.visible = false;
    cubeCamera.update(renderer, scene);
    keychain.visible = true;
  }

  renderer.render(scene, camera);
}
