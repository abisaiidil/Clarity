// main.js — Update 82
import * as THREE from "three";
import { GLTFLoader } from "GLTFLoader";
import { RectAreaLightUniformsLib } from "RectAreaLightUniformsLib";
import GUI from "lil-gui";

/* === Renderer === */
const canvas = document.getElementById("webgl");
const renderer = new THREE.WebGLRenderer({canvas,antialias:true,alpha:true});
renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
renderer.setSize(window.innerWidth,window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffffff);
const camera = new THREE.PerspectiveCamera(60,window.innerWidth/window.innerHeight,0.1,100);
camera.position.set(0,0,3);

/* === Lights === */
RectAreaLightUniformsLib.init();
const keyLight = new THREE.DirectionalLight(0xffffff,2);
keyLight.position.set(1.2,2.0,1.8);
scene.add(keyLight);

const frontRect = new THREE.RectAreaLight(0xffffff,1.5,6,3.5);
frontRect.position.set(0,0.6,2.6);
frontRect.lookAt(0,0,0);
scene.add(frontRect);

const rimLight = new THREE.DirectionalLight(0xffffff,0.9);
rimLight.position.set(-1.8,1.8,-1.8);
scene.add(rimLight);

const hemi = new THREE.HemisphereLight(0xf6f6ff,0xf2e9dc,0.8);
scene.add(hemi);

/* === Env Map for glass & metal === */
const cubeTarget = new THREE.WebGLCubeRenderTarget(512,{format:THREE.RGBAFormat,generateMipmaps:true,minFilter:THREE.LinearMipmapLinearFilter});
const cubeCam = new THREE.CubeCamera(0.1,100,cubeTarget);
scene.add(cubeCam);

/* === Materials === */
const glassMat = new THREE.MeshPhysicalMaterial({
  color:0xffffff,
  roughness:0.25,
  metalness:0,
  transmission:0.95,
  ior:1.45,
  thickness:0.25,
  envMap:cubeTarget.texture,
  envMapIntensity:2.2,
  clearcoat:1,
  clearcoatRoughness:0.05,
  transparent:true
});

const metalMat = new THREE.MeshPhysicalMaterial({
  color:0xffffff,
  metalness:1,
  roughness:0.2,
  envMap:cubeTarget.texture,
  envMapIntensity:2.5
});

/* === Loaders === */
const loader = new GLTFLoader();
let keychainCtrl=null,bgLoaded=false,keychainLoaded=false;

/* background */
loader.load("./asset/clarity_bg.glb",g=>{
  const bg=g.scene;
  bg.traverse(c=>{
    if(c.isMesh)c.material=new THREE.MeshBasicMaterial({map:c.material.map,toneMapped:false});
  });
  bg.scale.set(3.35,3.35,3.35);
  bg.position.set(0,0,0);
  scene.add(bg);
  bgLoaded=true;tryUpdateEnv();
});

/* keychain */
loader.load("./asset/clarity_keychain.glb",g=>{
  const m=g.scene;
  m.traverse(c=>{
    if(!c.isMesh)return;
    const n=c.name.toLowerCase();
    if(n.includes("plastik")||n.includes("plast"))c.material=glassMat;
    else if(n.includes("besi")||n.includes("metal"))c.material=metalMat;
  });
  keychainCtrl=m.getObjectByName("Keychain Controler")||m.getObjectByName("Keychain Controller")||m;
  keychainCtrl.scale.set(1.7,1.7,1.7);
  keychainCtrl.position.z=1.3;
  scene.add(m);
  keychainLoaded=true;tryUpdateEnv();
});

function tryUpdateEnv(){
  if(!bgLoaded||!keychainLoaded)return;
  keychainCtrl.visible=false;
  cubeCam.update(renderer,scene);
  keychainCtrl.visible=true;
}

/* === Interaction data === */
const cursor={x:0,y:0};
window.addEventListener("mousemove",e=>{
  cursor.x=(e.clientX/window.innerWidth-0.5)*2;
  cursor.y=-(e.clientY/window.innerHeight-0.5)*2;
});

/* === GUI === */
const gui=new GUI({width:340});
gui.domElement.style.display="none";

/* lighting gui */
const lf=gui.addFolder("Lighting");
lf.add(keyLight,"intensity",0,5,0.01).name("Key Light");
lf.add(frontRect,"intensity",0,5,0.01).name("Front Light");
lf.add(rimLight,"intensity",0,5,0.01).name("Rim Light");
lf.add(hemi,"intensity",0,3,0.01).name("Hemisphere");
lf.add(renderer,"toneMappingExposure",0.2,2,0.01).name("Exposure");

/* keychain control */
const kf=gui.addFolder("Keychain Control");
const controlParams={
  scale:1.7,
  posZ:1.3,
  moveStrength:0.15,
  lerpSpeed:0.05,
  rotationSpeed:0.01,
  idle:true
};
kf.add(controlParams,"scale",0.5,4,0.01).onChange(v=>{if(keychainCtrl)keychainCtrl.scale.set(v,v,v)});
kf.add(controlParams,"posZ",-2,3,0.01).onChange(v=>{if(keychainCtrl)keychainCtrl.position.z=v});
kf.add(controlParams,"moveStrength",0,1,0.01);
kf.add(controlParams,"lerpSpeed",0.01,0.2,0.01);
kf.add(controlParams,"rotationSpeed",0,0.05,0.001);
kf.add(controlParams,"idle").name("Idle Rotation");

/* glass + metal materials gui */
const gf=gui.addFolder("Glass Material");
gf.add(glassMat,"roughness",0,1,0.01);
gf.add(glassMat,"transmission",0,1,0.01);
gf.add(glassMat,"thickness",0,1,0.01);
gf.add(glassMat,"ior",1.0,2.0,0.01);
gf.add(glassMat,"envMapIntensity",0,3,0.05);
gf.add(glassMat,"clearcoat",0,1,0.01);
gf.add(glassMat,"clearcoatRoughness",0,1,0.01);

const mf=gui.addFolder("Metal Material");
mf.addColor({color:"#ffffff"},"color").onChange(v=>metalMat.color=new THREE.Color(v));
mf.add(metalMat,"roughness",0,1,0.01);
mf.add(metalMat,"envMapIntensity",0,3,0.05);

/* toggle gui */
window.addEventListener("keydown",e=>{
  if(e.key.toLowerCase()==="h")gui.domElement.style.display=gui.domElement.style.display==="none"?"block":"none";
});

/* === click pause/play idle rot === */
canvas.addEventListener("click",()=>{controlParams.idle=!controlParams.idle;});

/* === Animate === */
function animate(){
  requestAnimationFrame(animate);
  if(keychainCtrl){
    if(controlParams.idle)keychainCtrl.rotation.y+=controlParams.rotationSpeed;
    keychainCtrl.rotation.x=1;
    keychainCtrl.rotation.z=0.6;

    const tx=cursor.x*controlParams.moveStrength;
    const ty=cursor.y*controlParams.moveStrength;
    keychainCtrl.position.x+=(tx-keychainCtrl.position.x)*controlParams.lerpSpeed;
    keychainCtrl.position.y+=(ty-keychainCtrl.position.y)*controlParams.lerpSpeed;
  }
  renderer.render(scene,camera);
}
animate();

/* === resize === */
window.addEventListener("resize",()=>{
  camera.aspect=window.innerWidth/window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth,window.innerHeight);
});
