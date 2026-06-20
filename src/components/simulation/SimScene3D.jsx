// SimScene3D.jsx — AI Alloy Digital Twin Crash Simulation
// Modes: "frontal" | "drop"  (side impact removed)

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader }    from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  CAR_SECTIONS, WALL_X, GROUND_Y, CAR_REST_Y,
  getCollisionDisplacement,
  getRoofImpactDisplacement,
} from "./carData.js";

const carGlbUrl       = new URL("../../../image/car.glb",            import.meta.url).href;
const americanRoadUrl = new URL("../../../image/american_road.glb",  import.meta.url).href;

// ══════════════════════════════════════════════════════════════════════════
// CAMERA PRESETS (BeamNG-style off-center angles)
// ══════════════════════════════════════════════════════════════════════════
const CAM_PRESETS = {
  frontal: { pos: [3.5, 2.6, 7.5],  target: [1.2, 0.4, 0] },
  drop:    { pos: [3.8, 4.8, 6.5],  target: [0,   0.9, 0] },
};

// ══════════════════════════════════════════════════════════════════════════
// CAMERA CONTROLLER (shake + slow-motion)
// ══════════════════════════════════════════════════════════════════════════
export function SimCamCtrl({ shakeRef, testMode, slowMo }) {
  const { camera, gl } = useThree();
  const ctrlRef = useRef(null);

  useEffect(() => {
    const ctrl = new OrbitControls(camera, gl.domElement);
    ctrl.enableDamping = true; ctrl.dampingFactor = 0.06;
    ctrl.minDistance = 2.5;    ctrl.maxDistance   = 32;
    ctrl.target.set(0, 0.3, 0); ctrl.update();
    ctrlRef.current = ctrl;
    return () => ctrl.dispose();
  }, [camera, gl]);

  useEffect(() => {
    if (!ctrlRef.current) return;
    const p = CAM_PRESETS[testMode] ?? CAM_PRESETS.frontal;
    camera.position.set(...p.pos);
    ctrlRef.current.target.set(...p.target);
    ctrlRef.current.update();
  }, [camera, testMode]);

  useFrame(() => {
    ctrlRef.current?.update();
    if (shakeRef?.current?.intensity > 0.001) {
      const s = shakeRef.current;
      const m = slowMo ? 0.4 : 1.0;
      camera.position.x += (Math.random() - 0.5) * s.intensity * 0.055 * m;
      camera.position.y += (Math.random() - 0.5) * s.intensity * 0.028 * m;
      camera.position.z += (Math.random() - 0.5) * s.intensity * 0.020 * m;
      s.intensity *= s.decay;
    }
  });
  return null;
}

// ══════════════════════════════════════════════════════════════════════════
// LIGHTING
// ══════════════════════════════════════════════════════════════════════════
export function SceneLights() {
  return (
    <>
      <directionalLight position={[10,20,8]} intensity={2.4} color="#fff5e0"
        castShadow shadow-mapSize-width={4096} shadow-mapSize-height={4096}
        shadow-camera-near={0.5} shadow-camera-far={80}
        shadow-camera-left={-22} shadow-camera-right={22}
        shadow-camera-top={16} shadow-camera-bottom={-14}
        shadow-bias={-0.0006} />
      <directionalLight position={[-8,10,-6]} intensity={0.7}  color="#90b8e8" />
      <directionalLight position={[0,-5,0]}   intensity={0.28} color="#c8a060" />
      <ambientLight intensity={0.55} color="#b8cce8" />
      <hemisphereLight args={["#5a9acc","#b89060",0.72]} />
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// SKY DOME
// ══════════════════════════════════════════════════════════════════════════
export function SkyDome() {
  const ref = useRef();
  const { camera } = useThree();
  useFrame(() => { if (ref.current) ref.current.position.copy(camera.position); });
  return (
    <mesh ref={ref} renderOrder={-100} frustumCulled={false}>
      <sphereGeometry args={[500,32,20]} />
      <meshBasicMaterial color="#6aabda" side={THREE.BackSide} depthTest={false} depthWrite={false} fog={false} />
    </mesh>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// ROAD ENVIRONMENT
// ══════════════════════════════════════════════════════════════════════════
export function RoadEnvironment() {
  return (
    <group>
      <mesh rotation={[-Math.PI/2,0,0]} position={[0,GROUND_Y-0.02,0]} receiveShadow>
        <planeGeometry args={[220,220]} />
        <meshStandardMaterial color="#c09060" roughness={0.97} />
      </mesh>
      <mesh rotation={[-Math.PI/2,0,0]} position={[0,GROUND_Y,0]} receiveShadow>
        <planeGeometry args={[30,10]} />
        <meshStandardMaterial color="#282c32" roughness={0.88} metalness={0.10} />
      </mesh>
      {[-4.0,4.0].map((z) => (
        <mesh key={z} rotation={[-Math.PI/2,0,0]} position={[0,GROUND_Y+0.002,z]}>
          <planeGeometry args={[30,0.14]} />
          <meshStandardMaterial color="#e8e8e8" roughness={0.7} />
        </mesh>
      ))}
      {[-0.14,0.14].map((z) => (
        <mesh key={z} rotation={[-Math.PI/2,0,0]} position={[0,GROUND_Y+0.003,z]}>
          <planeGeometry args={[30,0.10]} />
          <meshStandardMaterial color="#f0c020" />
        </mesh>
      ))}
    </group>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// CONCRETE WALL (frontal only)
// ══════════════════════════════════════════════════════════════════════════
export function ConcreteWall({ visible, wallDamage = 0 }) {
  const edgesGeo = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(0.48,3.62,7.12)), []);
  if (!visible) return null;
  const wallColor  = wallDamage > 0.7 ? "#3a2a1a" : wallDamage > 0.4 ? "#4a3a2a" : "#5a5d64";
  const collapseY  = wallDamage > 0.65 ? -(wallDamage-0.65)*0.8 : 0;
  const crackGeo   = useMemo(() => {
    const pts = [
      new THREE.Vector3(0.25,0.8,0.1), new THREE.Vector3(0.26,0.3,0.4),
      new THREE.Vector3(0.27,-0.2,0.2),new THREE.Vector3(0.25,-0.8,-0.1),
      new THREE.Vector3(0.25,0.8,-0.3),new THREE.Vector3(0.26,0.1,-0.6),
    ];
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, []);

  return (
    <group position={[WALL_X,0.15,0]}>
      <group position={[0,collapseY,0]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[0.46,3.60,7.10]} />
          <meshStandardMaterial color={wallColor} roughness={0.94} metalness={0.04} />
        </mesh>
        {[-1.40,-0.90,-0.40,0.10,0.60,1.10,1.60].map((y,i) => (
          <mesh key={i} position={[0.24,y,0]}>
            <boxGeometry args={[0.02,0.06,7.0]} />
            <meshStandardMaterial color={wallDamage>0.4?"#cc4400":"#48494f"} roughness={0.98} />
          </mesh>
        ))}
        {wallDamage > 0.28 && (
          <lineSegments geometry={crackGeo}>
            <lineBasicMaterial color="#ff6600" transparent opacity={Math.min(1,(wallDamage-0.28)*3.5)} />
          </lineSegments>
        )}
      </group>
      <lineSegments geometry={edgesGeo}>
        <lineBasicMaterial color={wallDamage>0.4?"#995533":"#888a96"} transparent opacity={0.4} />
      </lineSegments>
    </group>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// DETACHED BUMPER (appears when damage > 0.70)
// ══════════════════════════════════════════════════════════════════════════
export function DetachedBumper({ carX, deformLevel, visible, alloyColor }) {
  const ref = useRef();
  const settled = useRef(false);
  const velRef  = useRef({ vy: 0, vx: 0 });

  useEffect(() => { settled.current = false; velRef.current = { vy: 2.2, vx: -0.8 }; }, [visible]);

  useFrame((_, dt) => {
    if (!ref.current || !visible || settled.current) return;
    velRef.current.vy -= 9.81 * dt;
    ref.current.position.x += velRef.current.vx * dt;
    ref.current.position.y += velRef.current.vy * dt;
    ref.current.rotation.z += 2.2 * dt;
    if (ref.current.position.y <= GROUND_Y + 0.05) {
      ref.current.position.y = GROUND_Y + 0.05;
      velRef.current.vy *= -0.35;
      if (Math.abs(velRef.current.vy) < 0.2) settled.current = true;
    }
  });

  if (!visible) return null;
  return (
    <mesh ref={ref} position={[carX + 2.8, CAR_REST_Y - 0.1, 0]} castShadow>
      <boxGeometry args={[0.22, 0.38, 2.0]} />
      <meshStandardMaterial color={alloyColor ?? "#8898a8"} metalness={0.75} roughness={0.35} />
    </mesh>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// DETACHED HOOD (appears when damage > 0.85)
// ══════════════════════════════════════════════════════════════════════════
export function DetachedHood({ carX, visible, alloyColor }) {
  const ref = useRef();
  const settled = useRef(false);
  const velRef  = useRef({ vy: 0, vx: 0, rz: 0, ry: 0 });

  useEffect(() => { settled.current = false; velRef.current = { vy: 3.8, vx: -1.2, rz: 1.5, ry: 0.8 }; }, [visible]);

  useFrame((_, dt) => {
    if (!ref.current || !visible || settled.current) return;
    velRef.current.vy -= 9.81 * dt;
    ref.current.position.x += velRef.current.vx * dt;
    ref.current.position.y += velRef.current.vy * dt;
    ref.current.rotation.z += velRef.current.rz * dt;
    ref.current.rotation.y += velRef.current.ry * dt;
    if (ref.current.position.y <= GROUND_Y + 0.04) {
      ref.current.position.y = GROUND_Y + 0.04;
      velRef.current.vy *= -0.28;
      velRef.current.rz *= 0.5;
      if (Math.abs(velRef.current.vy) < 0.15) settled.current = true;
    }
  });

  if (!visible) return null;
  return (
    <mesh ref={ref} position={[carX + 1.8, CAR_REST_Y + 0.6, 0]} castShadow>
      <boxGeometry args={[1.1, 0.08, 1.9]} />
      <meshStandardMaterial color={alloyColor ?? "#8898a8"} metalness={0.80} roughness={0.28} side={THREE.DoubleSide} />
    </mesh>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// WINDSHIELD DAMAGE OVERLAY
// Stages: CLEAR → CRACKED_LIGHT → CRACKED_HEAVY → SHATTERED
// ══════════════════════════════════════════════════════════════════════════
export function WindshieldDamage({ stage, carPos }) {
  const crackGeoLight = useMemo(() => {
    const pts = [
      new THREE.Vector3(0,0.3,0),  new THREE.Vector3(0.18,-0.1,0.3),
      new THREE.Vector3(0,0.3,0),  new THREE.Vector3(-0.15,-0.2,-0.2),
      new THREE.Vector3(0.05,0,0), new THREE.Vector3(0.25,0.25,0.4),
    ];
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, []);

  const crackGeoHeavy = useMemo(() => {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      pts.push(new THREE.Vector3(0,0,0));
      pts.push(new THREE.Vector3(Math.cos(a)*0.35 + (Math.random()-0.5)*0.1, Math.sin(a)*0.28+(Math.random()-0.5)*0.1, 0));
    }
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, []);

  if (stage === "CLEAR") return null;

  const [cx, cy, cz] = [carPos[0] + 0.88, carPos[1] + 0.58, carPos[2]];

  if (stage === "CRACKED_LIGHT") {
    return (
      <lineSegments geometry={crackGeoLight} position={[cx, cy, cz + 0.01]}>
        <lineBasicMaterial color="#ccddee" transparent opacity={0.75} linewidth={1.5} />
      </lineSegments>
    );
  }

  if (stage === "CRACKED_HEAVY") {
    return (
      <group position={[cx, cy, cz + 0.01]}>
        <lineSegments geometry={crackGeoLight}>
          <lineBasicMaterial color="#c8d8e8" transparent opacity={0.85} />
        </lineSegments>
        <lineSegments geometry={crackGeoHeavy}>
          <lineBasicMaterial color="#b0c0cc" transparent opacity={0.90} />
        </lineSegments>
      </group>
    );
  }

  // SHATTERED — white-grey frosted glass look with many fragments
  return (
    <group position={[cx, cy, cz + 0.01]}>
      <mesh>
        <planeGeometry args={[0.06, 0.68]} />
        <meshBasicMaterial color="#d0e4f0" transparent opacity={0.55} side={THREE.DoubleSide} />
      </mesh>
      <lineSegments geometry={crackGeoHeavy}>
        <lineBasicMaterial color="#ffffff" transparent opacity={0.95} />
      </lineSegments>
      <lineSegments geometry={crackGeoLight}>
        <lineBasicMaterial color="#e8f0f8" transparent opacity={0.90} />
      </lineSegments>
    </group>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// SUSPENSION VISUAL (body pitch on frontal, compression on drop)
// ══════════════════════════════════════════════════════════════════════════
function SuspensionViz({ testMode, deformLevel, impacted }) {
  // Very subtle — just tire compression indicators
  if (!impacted || deformLevel < 0.05) return null;
  const compress = deformLevel * 0.06;   // max 6cm visual compression

  return (
    <group>
      {/* Front tires compress more on frontal */}
      {testMode === "frontal" && [-0.92, 0.92].map((z) => (
        <mesh key={z} position={[1.55, GROUND_Y + 0.28 - compress * 1.5, z]} rotation={[Math.PI/2, 0, 0]}>
          <cylinderGeometry args={[0.28 + compress*0.5, 0.28 + compress*0.5, 0.24, 18]} />
          <meshStandardMaterial color="#1a1a1a" roughness={0.9} />
        </mesh>
      ))}
      {/* All tires compress slightly on drop */}
      {testMode === "drop" && [[-1.55, -0.92],[-1.55,0.92],[1.55,-0.92],[1.55,0.92]].map(([x,z], i) => (
        <mesh key={i} position={[x, GROUND_Y + 0.28 - compress, z]} rotation={[Math.PI/2,0,0]}>
          <cylinderGeometry args={[0.28+compress*0.3, 0.28+compress*0.3, 0.24, 18]} />
          <meshStandardMaterial color="#1a1a1a" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// STRESS HEATMAP COLOR CALCULATOR
// Returns the color for a given local stress factor
// heatmapMode: false = alloy color; true = blue→green→yellow→red
// ══════════════════════════════════════════════════════════════════════════
function stressColor(localStress, heatmapMode, alloyAppearance) {
  if (heatmapMode) {
    if (localStress < 0.15) return { color:"#1060ff", emissive:"#001040", emissiveIntensity:0.08 };
    if (localStress < 0.35) return { color:"#20c060", emissive:"#003010", emissiveIntensity:0.12 };
    if (localStress < 0.60) return { color:"#f0c020", emissive:"#302000", emissiveIntensity:0.25 };
    if (localStress < 0.80) return { color:"#e04010", emissive:"#400800", emissiveIntensity:0.45 };
    return { color:"#ff1000", emissive:"#660000", emissiveIntensity:0.80 };
  }
  // Standard alloy-based stress coloring
  const base = alloyAppearance?.baseColor ?? "#8898a8";
  const em   = alloyAppearance?.emissiveColor ?? "#050e18";
  const m    = alloyAppearance?.metalness ?? 0.86;
  const r    = alloyAppearance?.roughness ?? 0.16;
  if (localStress < 0.22) return { color:base,     emissive:em,      emissiveIntensity:0.10, metalness:m,       roughness:r };
  if (localStress < 0.48) return { color:"#c09020", emissive:"#201400", emissiveIntensity:0.30, metalness:m*0.9,   roughness:r+0.06 };
  if (localStress < 0.76) return { color:"#b82818", emissive:"#380600", emissiveIntensity:0.52, metalness:0.60,    roughness:0.36 };
  return                         { color:"#ff2200", emissive:"#660800", emissiveIntensity:0.88, metalness:0.44,    roughness:0.56 };
}

// ══════════════════════════════════════════════════════════════════════════
// PROCEDURAL CAR SECTION MESH (behavior-aware vertex deformation)
// ══════════════════════════════════════════════════════════════════════════
export function CarSectionMesh({ section, deformLevel, testMode, impacted, impactX, alloyAppearance, behavior, heatmapMode }) {
  const [sw, sh, sd] = section.segs ?? [4,3,4];
  const geo = useMemo(() => new THREE.BoxGeometry(section.args[0], section.args[1], section.args[2], sw, sh, sd), [section.id]); // eslint-disable-line
  const origPosRef = useRef(null);

  useEffect(() => { if (geo) origPosRef.current = Float32Array.from(geo.attributes.position.array); }, [geo]);

  useEffect(() => {
    if (!geo || !origPosRef.current) return;
    const pos  = geo.attributes.position;
    const orig = origPosRef.current;
    const [bx, by, bz] = section.pos;

    if (!impacted || deformLevel <= 0.001) {
      pos.array.set(orig); pos.needsUpdate = true; geo.computeVertexNormals(); return;
    }

    for (let i = 0; i < pos.count; i++) {
      const vx = orig[i*3], vy = orig[i*3+1], vz = orig[i*3+2];
      const wx = bx+vx, wy = by+vy, wz = bz+vz;
      let d = { dx:0, dy:0, dz:0 };
      if (testMode === "frontal") d = getCollisionDisplacement(wx, wy, wz, deformLevel, behavior);
      else                        d = getRoofImpactDisplacement(wx, wy, wz, deformLevel, impactX ?? 0, behavior);
      pos.array[i*3]   = vx+d.dx;
      pos.array[i*3+1] = vy+d.dy;
      pos.array[i*3+2] = vz+d.dz;
    }
    pos.needsUpdate = true; geo.computeVertexNormals();
  }, [deformLevel, impacted, testMode, impactX, behavior]); // eslint-disable-line

  const localFactor = testMode === "frontal" ? section.dw : (section.dwDrop ?? 0.2);
  const localStress = deformLevel * localFactor;
  const mat = stressColor(localStress, heatmapMode, alloyAppearance);

  return (
    <mesh geometry={geo} castShadow receiveShadow>
      <meshStandardMaterial
        color={mat.color} emissive={mat.emissive}
        emissiveIntensity={mat.emissiveIntensity}
        metalness={mat.metalness ?? 0.75} roughness={mat.roughness ?? 0.28}
      />
    </mesh>
  );
}

function ProceduralCar({ deformLevel, testMode, impacted, impactX, alloyAppearance, behavior, heatmapMode }) {
  return (
    <group>
      {CAR_SECTIONS.map((sec) => (
        <group key={sec.id} position={sec.pos}>
          <CarSectionMesh section={sec} deformLevel={deformLevel} testMode={testMode}
            impacted={impacted} impactX={impactX} alloyAppearance={alloyAppearance}
            behavior={behavior} heatmapMode={heatmapMode} />
        </group>
      ))}
    </group>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// GLB CAR — world-space behavior-aware deformation
// ══════════════════════════════════════════════════════════════════════════
export function CarGLBModel({ deformLevel, testMode, impacted, impactX, alloyAppearance, behavior, heatmapMode, onLoaded }) {
  const [gltfScene, setGltfScene] = useState(null);
  const meshDataRef   = useRef([]);
  const carCenterRef  = useRef(new THREE.Vector3());
  const tmpVec        = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    const loader = new GLTFLoader();
    loader.load(carGlbUrl, (gltf) => {
      const s = gltf.scene;
      s.rotation.set(0, Math.PI/2, 0);
      s.updateMatrixWorld(true);

      const box  = new THREE.Box3().setFromObject(s);
      const sz   = new THREE.Vector3(); const ctr = new THREE.Vector3();
      box.getSize(sz); box.getCenter(ctr);

      const scale = 4.5 / (Math.max(sz.x, sz.z) || 1);
      s.scale.setScalar(scale);

      const box2 = new THREE.Box3().setFromObject(s);
      s.position.set(-ctr.x*scale, GROUND_Y - box2.min.y - CAR_REST_Y, -ctr.z*scale);
      s.updateMatrixWorld(true);
      s.getWorldPosition(carCenterRef.current);

      const meshData = [];
      s.traverse((node) => {
        if (!node.isMesh) return;
        node.castShadow = node.receiveShadow = true;
        node.material = new THREE.MeshStandardMaterial({
          color: alloyAppearance?.baseColor ?? "#8898a8",
          emissive: alloyAppearance?.emissiveColor ?? "#050e18",
          emissiveIntensity: 0.10,
          metalness: alloyAppearance?.metalness ?? 0.86,
          roughness: alloyAppearance?.roughness ?? 0.16,
        });
        meshData.push({ mesh: node, origPos: Float32Array.from(node.geometry.attributes.position.array) });
      });
      meshDataRef.current = meshData;
      setGltfScene(s);
      if (onLoaded) onLoaded();
    }, undefined, (err) => console.warn("car.glb:", err));
  }, []); // eslint-disable-line

  useEffect(() => {
    if (!gltfScene) return;
    gltfScene.updateMatrixWorld(true);
    gltfScene.getWorldPosition(carCenterRef.current);
    const cx = carCenterRef.current.x;
    const cz = carCenterRef.current.z;

    const stress = deformLevel;
    const mat    = stressColor(stress, heatmapMode, alloyAppearance);

    meshDataRef.current.forEach(({ mesh, origPos }) => {
      const pos = mesh.geometry.attributes.position;

      if (!impacted || deformLevel <= 0.001) {
        pos.array.set(origPos); pos.needsUpdate = true;
        mesh.geometry.computeVertexNormals();
        if (mesh.material) {
          mesh.material.color.set(alloyAppearance?.baseColor ?? "#8898a8");
          mesh.material.emissive.set(alloyAppearance?.emissiveColor ?? "#050e18");
          mesh.material.emissiveIntensity = 0.10;
          mesh.material.metalness = alloyAppearance?.metalness ?? 0.86;
          mesh.material.roughness = alloyAppearance?.roughness ?? 0.16;
        }
        return;
      }

      for (let i = 0; i < pos.count; i++) {
        const vx = origPos[i*3], vy = origPos[i*3+1], vz = origPos[i*3+2];
        tmpVec.set(vx, vy, vz);
        mesh.localToWorld(tmpVec);
        const wx = tmpVec.x - cx, wy = tmpVec.y, wz = tmpVec.z - cz;

        let d = { dx:0, dy:0, dz:0 };
        if (testMode === "frontal") d = getCollisionDisplacement(wx, wy, wz, deformLevel, behavior ?? "BALANCED");
        else                        d = getRoofImpactDisplacement(wx, wy, wz, deformLevel, impactX ?? 0, behavior ?? "BALANCED");

        tmpVec.x += d.dx; tmpVec.y += d.dy; tmpVec.z += d.dz;
        mesh.worldToLocal(tmpVec);
        pos.array[i*3] = tmpVec.x; pos.array[i*3+1] = tmpVec.y; pos.array[i*3+2] = tmpVec.z;
      }
      pos.needsUpdate = true;
      mesh.geometry.computeVertexNormals();

      if (mesh.material) {
        mesh.material.color.set(mat.color);
        mesh.material.emissive.set(mat.emissive);
        mesh.material.emissiveIntensity = mat.emissiveIntensity;
        mesh.material.metalness = mat.metalness ?? 0.75;
        mesh.material.roughness = mat.roughness ?? 0.28;
        mesh.material.needsUpdate = true;
      }
    });
  }, [deformLevel, impacted, testMode, impactX, gltfScene, alloyAppearance, behavior, heatmapMode]); // eslint-disable-line

  if (!gltfScene) return null;
  return <primitive object={gltfScene} />;
}

// ══════════════════════════════════════════════════════════════════════════
// CAR BODY PITCH (suspension reaction)
// On frontal: nose pitches down during crush
// On drop: body compresses (scale Y slightly)
// ══════════════════════════════════════════════════════════════════════════
function CarBody({ carWorldPos, deformLevel, testMode, impacted, impactX, alloyAppearance, behavior, heatmapMode, glassDamage, bumperDetached, hoodDetached, suspensionPitch }) {
  const [glbLoaded, setGlbLoaded] = useState(false);

  // Body pitch: nose-down on frontal impact
  const pitch = testMode === "frontal" && impacted
    ? Math.min(deformLevel * (suspensionPitch ?? 6.5) * (Math.PI/180), 0.12)
    : 0;

  // Suspension compression: body sinks slightly on drop
  const dropCompress = testMode === "drop" && impacted ? deformLevel * 0.04 : 0;

  return (
    <group position={[carWorldPos[0], carWorldPos[1] - dropCompress, carWorldPos[2]]} rotation={[pitch, 0, 0]}>
      <CarGLBModel
        deformLevel={deformLevel} testMode={testMode} impacted={impacted}
        impactX={impactX} alloyAppearance={alloyAppearance} behavior={behavior}
        heatmapMode={heatmapMode} onLoaded={() => setGlbLoaded(true)}
      />
      {!glbLoaded && (
        <ProceduralCar
          deformLevel={deformLevel} testMode={testMode} impacted={impacted}
          impactX={impactX} alloyAppearance={alloyAppearance} behavior={behavior}
          heatmapMode={heatmapMode}
        />
      )}

      {/* Windshield damage overlay */}
      <WindshieldDamage stage={glassDamage ?? "CLEAR"} carPos={[0,0,0]} />
    </group>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// DROP WEIGHT
// ══════════════════════════════════════════════════════════════════════════
export function DropWeight({ worldPos, visible }) {
  if (!visible) return null;
  return (
    <group position={worldPos}>
      <mesh castShadow>
        <boxGeometry args={[1.22,0.46,1.22]} />
        <meshStandardMaterial color="#3a4050" metalness={0.82} roughness={0.26} />
      </mesh>
      <mesh position={[0,0.32,0]} castShadow>
        <cylinderGeometry args={[0.09,0.09,0.18,12]} />
        <meshStandardMaterial color="#282e38" metalness={0.90} roughness={0.18} />
      </mesh>
      {[[-0.5,-0.5],[0.5,-0.5],[-0.5,0.5],[0.5,0.5]].map(([x,z],i) => (
        <mesh key={i} position={[x,0.26,z]} castShadow>
          <cylinderGeometry args={[0.04,0.04,0.08,8]} />
          <meshStandardMaterial color="#607080" metalness={0.95} roughness={0.14} />
        </mesh>
      ))}
    </group>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// MAIN SCENE
// ══════════════════════════════════════════════════════════════════════════
export function SimScene({
  testMode, carWorldPos, dropWeightPos,
  deformLevel, impacted, shakeRef, slowMo, impactX,
  alloyAppearance, speedKmh = 80, behavior = "BALANCED",
  heatmapMode = false, glassDamage = "CLEAR",
  bumperDetached = false, hoodDetached = false,
  suspensionPitch = 0,
}) {
  const uts      = alloyAppearance?._tensile  ?? 800;
  const hardness = alloyAppearance?._hardness ?? 200;
  const matStr   = Math.min(1, (uts/1200)*0.7 + (hardness/800)*0.3);
  const speedFac = Math.min(1, Math.max(0, (speedKmh-80)/220));
  const wallDamage = impacted ? Math.min(1, deformLevel*0.4*matStr*(1+speedFac*2)) : 0;

  return (
    <>
      <SimCamCtrl shakeRef={shakeRef} testMode={testMode} slowMo={slowMo} />
      <SceneLights />
      <SkyDome />
      <RoadEnvironment />

      <ConcreteWall visible={testMode === "frontal"} wallDamage={wallDamage} />
      <DropWeight worldPos={dropWeightPos ?? [0,5,0]} visible={testMode === "drop"} />

      <CarBody
        carWorldPos={carWorldPos} deformLevel={deformLevel} testMode={testMode}
        impacted={impacted} impactX={impactX} alloyAppearance={alloyAppearance}
        behavior={behavior} heatmapMode={heatmapMode} glassDamage={glassDamage}
        bumperDetached={bumperDetached} hoodDetached={hoodDetached}
        suspensionPitch={suspensionPitch}
      />

      {/* Detached parts physics */}
      <DetachedBumper
        carX={carWorldPos[0]} deformLevel={deformLevel}
        visible={bumperDetached && impacted}
        alloyColor={alloyAppearance?.baseColor}
      />
      <DetachedHood
        carX={carWorldPos[0]}
        visible={hoodDetached && impacted}
        alloyColor={alloyAppearance?.baseColor}
      />

      {/* Suspension visual */}
      <SuspensionViz testMode={testMode} deformLevel={deformLevel} impacted={impacted} />
    </>
  );
}
