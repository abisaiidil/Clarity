import * as THREE from "three";
import { GLTFLoader } from "GLTFLoader";
import { RGBELoader } from "RGBELoader";
import { RectAreaLightHelper } from "RectAreaLightHelper";
import { RectAreaLightUniformsLib } from "RectAreaLightUniformsLib";
import GUI from "lil-gui";

RectAreaLightUniformsLib.init();

let scene, camera, renderer, cubeCam, cubeTarget;
let bgMain, bgEnv, keychainController;
let glassMeshes = [], metalMeshes = [];
let gui, guiVisible = false;
let idleRotation = 0;
const cursor = { x: 0, y: 0 };
let idlePaused = false;

// sensitivitas interaksi
const params = {
  moveStrength: 0.15,
  lerpSpeed: 0.05,
  rotationSpeed: 0.01
};

function init() {
  const canvas = document.getElementById("webgl");
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffffff);

  camera = new THREE.PerspectiveCamera(60, window.innerWidth/window.innerHeight, 0.1, 100);
  camera.position.set(0,0,3);

  renderer = new THREE.WebGLRenderer({canvas,antialias:true,alpha:true});
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  // --- HDRI Environment ---
  new RGBELoader()
    .setPath("https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/")
    .load("studio_small_03_1k.hdr", (texture)=>{
      texture.mapping = THREE.EquirectangularReflectionMapping;
      scene.environment = texture;
      scene.background = new THREE.Color(0xffffff);
    });

  // --- Lighting setup ---
  const keyLight = new THREE.DirectionalLight(0xffffff, 1);
  keyLight.position.set(3,4,5);

  const fillLight = new THREE.DirectionalLight(0xffffff,1.5);
  fillLight.position.set(-3,2,2);

  const rimLight = new THREE.DirectionalLight(0xffffff,3.5);
  rimLight.position.set(-3,2,-4);

  const ambLight = new THREE.AmbientLight(0xffffff,1);

  // Soft RectAreaLight dari bawah depan
  const areaLight = new THREE.RectAreaLight(0xffffff,2,3,3);
  areaLight.position.set(0,-1.5,2);
  areaLight.lookAt(0,0,0);
  scene.add(keyLight,fillLight,rimLight,ambLight,areaLight);
  // scene.add(new RectAreaLightHelper(areaLight));

  // --- CubeCamera untuk refraksi keychain ---
  cubeTarget = new THREE.WebGLCubeRenderTarget(1024,{
    format:THREE.RGBAFormat,
    generateMipmaps:true,
    minFilter:THREE.LinearMipmapLinearFilter
  });
  cubeCam = new THREE.CubeCamera(0.1,100,cubeTarget);
  scene.add(cubeCam);

  const loader = new GLTFLoader();

  // --- Background ---
  loader.load("./asset/clarity_bg.glb",(gltf)=>{
    bgMain = gltf.scene;
    bgEnv = bgMain.clone();
    bgMain.position.z = -2.5;
    bgEnv.position.z = -2.5;
    bgMain.scale.set(3.35,3.35,3.35);
    bgEnv.scale.set(3.35,3.35,3.35);
    bgMain.traverse(c=>{
      if(c.isMesh){
        c.material = new THREE.MeshBasicMaterial({
          map:c.material.map||null,
          toneMapped:false
        });
      }
    });
    scene.add(bgMain);
    console.log("✅ clarity_bg.glb loaded");
  });

  // --- Keychain ---
  loader.load("./asset/clarity_keychain.glb",(gltf)=>{
    const model = gltf.scene;
    model.scale.set(1.7,1.7,1.7);
    scene.add(model);

    keychainController =
      model.getObjectByName("Keychain Controler") ||
      model.getObjectByName("Keychain Controller") ||
      model;

    model.traverse(c=>{
      if(c.isMesh){
        const n = c.name.toLowerCase();
        if(n.includes("plastik")){
          const mat = new THREE.MeshPhysicalMaterial({
            color:0xffffff,
            roughness:0.4,
            metalness:0,
            transmission:1,
            ior:1.33,
            thickness:0.05,
            envMap:cubeTarget.texture,
            envMapIntensity:2,
            clearcoat:1,
            clearcoatRoughness:0.1
          });
          c.material = mat;
          glassMeshes.push(mat);
        }
        if(n.includes("besi")){
          const mat = new THREE.MeshPhysicalMaterial({
            color:0xffffff,
            metalness:1,
            roughness:0.2,
            envMapIntensity:2
          });
          c.material = mat;
          metalMeshes.push(mat);
        }
      }
    });
    setupGUI(keyLight,fillLight,rimLight,ambLight,areaLight);
    animate();
    console.log("✅ clarity_keychain.glb loaded");
  });

  // --- event listener ---
  window.addEventListener("resize",onResize);
  window.addEventListener("mousemove",(e)=>{
    cursor.x = (e.clientX/window.innerWidth - 0.5)*2;
    cursor.y = -(e.clientY/window.innerHeight - 0.5)*2;
  });
  window.addEventListener("keydown",toggleGUI);
  window.addEventListener("click",()=>{ idlePaused=!idlePaused; });
}

// --- GUI ---
function setupGUI(key,fill,rim,amb,area){
  gui = new GUI({width:300});
  gui.domElement.classList.add("root");

  // lighting intensity
  const lf = gui.addFolder("Lighting Intensity");
  lf.add(key,"intensity",0,5,0.1).name("Key Light");
  lf.add(fill,"intensity",0,5,0.1).name("Fill Light");
  lf.add(rim,"intensity",0,5,0.1).name("Rim Light");
  lf.add(amb,"intensity",0,5,0.1).name("Ambient Light");
  lf.add(area,"intensity",0,5,0.1).name("Area Light");

  // keychain control
  const kf = gui.addFolder("Keychain Control");
  kf.add(params,"rotationSpeed",0,0.05,0.001).name("Idle Rotation");
  kf.add(params,"moveStrength",0,1,0.01).name("Follow Strength");
  kf.add(params,"lerpSpeed",0,0.1,0.01).name("Lerp Speed");
  kf.add({z:1.3},"z",0,5,0.01).name("Z Position").onChange(v=>{
    if(keychainController) keychainController.position.z=v;
  });

  // glass
  if(glassMeshes.length>0){
    const gf = gui.addFolder("Glass Material");
    const g = glassMeshes[0];
    gf.add(g,"roughness",0,1,0.01);
    gf.add(g,"transmission",0,1,0.01);
    gf.add(g,"ior",1,2,0.01);
    gf.add(g,"thickness",0,1,0.01);
    gf.add(g,"envMapIntensity",0,3,0.1);
  }

  // metal
  if(metalMeshes.length>0){
    const mf = gui.addFolder("Metal Material");
    const m = metalMeshes[0];
    mf.add(m,"roughness",0,1,0.01);
    mf.add(m,"metalness",0,1,0.01);
    mf.add(m,"envMapIntensity",0,3,0.1);
  }
}

// --- toggle GUI ---
function toggleGUI(e){
  if(e.key.toLowerCase()==="h" && gui){
    guiVisible=!guiVisible;
    gui.domElement.style.display = guiVisible?"block":"none";
  }
}

// --- resize ---
function onResize(){
  camera.aspect = window.innerWidth/window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth,window.innerHeight);
}

// --- animation loop ---
function animate(){
  requestAnimationFrame(animate);
  if(keychainController){
    if(!idlePaused){
      idleRotation+=params.rotationSpeed;
      keychainController.rotation.y=idleRotation;
      keychainController.rotation.x=1;
      keychainController.rotation.z=0.6;
    }
    const tx=cursor.x*params.moveStrength;
    const ty=cursor.y*params.moveStrength;
    keychainController.position.x += (tx - keychainController.position.x)*params.lerpSpeed;
    keychainController.position.y += (ty - keychainController.position.y)*params.lerpSpeed;

    keychainController.visible=false;
    cubeCam.update(renderer,scene);
    keychainController.visible=true;
  }
  renderer.render(scene,camera);
}

init();
