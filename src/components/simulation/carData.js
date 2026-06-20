// carData.js — Vehicle structure & behavior-aware vertex displacement

export const GRAVITY        = 9.81;
export const BASE_MASS      = 1500;
export const REF_DENSITY    = 7.8;
export const WALL_X         = 4.2;
export const CAR_FRONT_LOCAL = 2.22;
export const CAR_BOTTOM_LOCAL = 0.60;
export const GROUND_Y       = -0.65;
export const CAR_REST_Y     = GROUND_Y + CAR_BOTTOM_LOCAL;  // ≈ -0.05

export const COL_START_X    = -6.0;
export const COL_IMPACT_X   = WALL_X - CAR_FRONT_LOCAL;   // ≈ 1.98

// CAR SECTIONS
// dw     = frontal weight   dwDrop = roof drop weight
export const CAR_SECTIONS = [
  { id:"floorpan",    args:[4.50,0.10,2.00], segs:[8,1,4],  pos:[ 0.00,-0.58, 0.00], dw:0.34, dwDrop:0.10 },
  { id:"mainBody",    args:[4.50,0.65,2.00], segs:[8,3,4],  pos:[ 0.00,-0.27, 0.00], dw:0.40, dwDrop:0.15 },
  { id:"engineBay",   args:[1.20,0.55,1.95], segs:[8,5,4],  pos:[ 1.15,-0.20, 0.00], dw:0.94, dwDrop:0.20 },
  { id:"hood",        args:[1.15,0.09,1.95], segs:[10,1,6], pos:[ 1.35, 0.14, 0.00], dw:1.00, dwDrop:0.30 },
  { id:"crumple",     args:[0.38,0.48,1.82], segs:[6,6,4],  pos:[ 1.95,-0.08, 0.00], dw:1.00, dwDrop:0.12 },
  { id:"frontBumper", args:[0.12,0.44,2.10], segs:[2,4,6],  pos:[ 2.22,-0.04, 0.00], dw:1.00, dwDrop:0.08 },
  { id:"cabin",       args:[2.10,0.88,1.88], segs:[8,5,6],  pos:[-0.22, 0.52, 0.00], dw:0.14, dwDrop:0.55 },
  { id:"roof",        args:[2.05,0.08,1.88], segs:[14,1,8], pos:[-0.22, 0.98, 0.00], dw:0.07, dwDrop:1.00 },
  { id:"windshield",  args:[0.06,0.70,1.80], segs:[2,6,6],  pos:[ 0.88, 0.58, 0.00], dw:0.72, dwDrop:0.60 },
  { id:"rearWindow",  args:[0.06,0.60,1.76], segs:[2,4,5],  pos:[-1.35, 0.54, 0.00], dw:0.06, dwDrop:0.45 },
  { id:"trunk",       args:[0.90,0.50,1.95], segs:[4,3,4],  pos:[-1.50,-0.10, 0.00], dw:0.07, dwDrop:0.08 },
  { id:"rearBumper",  args:[0.12,0.44,2.10], segs:[2,4,6],  pos:[-2.22,-0.04, 0.00], dw:0.04, dwDrop:0.06 },
  { id:"aPillarL",    args:[0.07,0.90,0.07], segs:[2,10,2], pos:[ 1.05, 0.52, 0.92], dw:0.72, dwDrop:0.82 },
  { id:"aPillarR",    args:[0.07,0.90,0.07], segs:[2,10,2], pos:[ 1.05, 0.52,-0.92], dw:0.72, dwDrop:0.82 },
  { id:"bPillarL",    args:[0.07,0.90,0.07], segs:[2,10,2], pos:[ 0.00, 0.52, 0.94], dw:0.24, dwDrop:0.72 },
  { id:"bPillarR",    args:[0.07,0.90,0.07], segs:[2,10,2], pos:[ 0.00, 0.52,-0.94], dw:0.24, dwDrop:0.72 },
  { id:"cPillarL",    args:[0.07,0.90,0.07], segs:[2,10,2], pos:[-1.30, 0.52, 0.92], dw:0.08, dwDrop:0.62 },
  { id:"cPillarR",    args:[0.07,0.90,0.07], segs:[2,10,2], pos:[-1.30, 0.52,-0.92], dw:0.08, dwDrop:0.62 },
  { id:"sillL",       args:[4.30,0.10,0.10], segs:[12,2,2], pos:[ 0.00,-0.54, 1.02], dw:0.46, dwDrop:0.12 },
  { id:"sillR",       args:[4.30,0.10,0.10], segs:[12,2,2], pos:[ 0.00,-0.54,-1.02], dw:0.46, dwDrop:0.12 },
  { id:"xFront",      args:[0.07,0.58,2.00], segs:[2,4,6],  pos:[ 1.70,-0.20, 0.00], dw:0.90, dwDrop:0.10 },
  { id:"xMid",        args:[0.07,0.58,2.00], segs:[2,4,6],  pos:[ 0.00,-0.20, 0.00], dw:0.34, dwDrop:0.10 },
  { id:"xRear",       args:[0.07,0.58,2.00], segs:[2,4,6],  pos:[-1.70,-0.20, 0.00], dw:0.10, dwDrop:0.08 },
  { id:"firewall",    args:[0.08,0.95,1.90], segs:[2,6,6],  pos:[ 0.62, 0.12, 0.00], dw:0.58, dwDrop:0.25 },
  { id:"doorFrontL",  args:[1.05,0.55,0.08], segs:[10,5,2], pos:[ 0.55, 0.10, 1.03], dw:0.38, dwDrop:0.14 },
  { id:"doorFrontR",  args:[1.05,0.55,0.08], segs:[10,5,2], pos:[ 0.55, 0.10,-1.03], dw:0.38, dwDrop:0.14 },
  { id:"doorRearL",   args:[0.88,0.55,0.08], segs:[8,5,2],  pos:[-0.58, 0.10, 1.03], dw:0.12, dwDrop:0.12 },
  { id:"doorRearR",   args:[0.88,0.55,0.08], segs:[8,5,2],  pos:[-0.58, 0.10,-1.03], dw:0.12, dwDrop:0.12 },
  { id:"fenderFL",    args:[1.20,0.58,0.08], segs:[6,4,2],  pos:[ 1.15,-0.06, 1.03], dw:0.92, dwDrop:0.22 },
  { id:"fenderFR",    args:[1.20,0.58,0.08], segs:[6,4,2],  pos:[ 1.15,-0.06,-1.03], dw:0.92, dwDrop:0.22 },
  { id:"quarterRL",   args:[0.95,0.56,0.08], segs:[5,4,2],  pos:[-1.55,-0.08, 1.03], dw:0.07, dwDrop:0.09 },
  { id:"quarterRR",   args:[0.95,0.56,0.08], segs:[5,4,2],  pos:[-1.55,-0.08,-1.03], dw:0.07, dwDrop:0.09 },
  { id:"trunkLid",    args:[0.90,0.08,1.95], segs:[5,1,5],  pos:[-1.50, 0.18, 0.00], dw:0.06, dwDrop:0.05 },
  { id:"beltFrontL",  args:[1.05,0.05,0.06], segs:[10,1,2], pos:[ 0.55, 0.40, 1.03], dw:0.34, dwDrop:0.55 },
  { id:"beltFrontR",  args:[1.05,0.05,0.06], segs:[10,1,2], pos:[ 0.55, 0.40,-1.03], dw:0.34, dwDrop:0.55 },
  { id:"beltRearL",   args:[0.88,0.05,0.06], segs:[8,1,2],  pos:[-0.58, 0.40, 1.03], dw:0.10, dwDrop:0.48 },
  { id:"beltRearR",   args:[0.88,0.05,0.06], segs:[8,1,2],  pos:[-0.58, 0.40,-1.03], dw:0.10, dwDrop:0.48 },
];

// ══════════════════════════════════════════════════════════════════════════
// BEHAVIOR-AWARE DISPLACEMENT FUNCTIONS
// behavior: "DUCTILE" | "BRITTLE" | "BALANCED"
// ══════════════════════════════════════════════════════════════════════════

// ── 1. FRONTAL CRASH ──────────────────────────────────────────────────────
export function getCollisionDisplacement(wx, wy, wz, deformLevel, behavior = "BALANCED") {
  const carLen  = 4.44;
  const relX    = (wx + 2.22) / carLen;        // 0=rear → 1=front

  // Crush front advance
  const crushDepth  = deformLevel * 0.55;
  const crushRear   = 1.0 - crushDepth;
  const crushedFrac = Math.max(0, (relX - crushRear) / Math.max(0.001, 1.0 - crushRear));
  const inCrushed   = Math.pow(crushedFrac, 1.30);

  // DUCTILE: wide soft deformation zone; BRITTLE: tight sharp zone
  const sigma = behavior === "DUCTILE" ? 0.52 + deformLevel * 0.48
              : behavior === "BRITTLE" ? 0.24 + deformLevel * 0.22
              : 0.38 + deformLevel * 0.42;

  const yzDistSq = wy * wy + wz * wz;
  const yzKernel = Math.exp(-yzDistSq / (2 * sigma * sigma));

  // BRITTLE: high-freq sharp folds; DUCTILE: low-freq smooth bends
  const foldFreq = behavior === "BRITTLE" ? 11 + deformLevel * 8
                 : behavior === "DUCTILE" ?  4 + deformLevel * 2
                 :  7 + deformLevel * 5;
  const foldAmp  = behavior === "BRITTLE" ? 0.052 : behavior === "DUCTILE" ? 0.016 : 0.032;
  const foldWave = Math.sin(inCrushed * foldFreq * Math.PI) * foldAmp * deformLevel;

  // ── dx: axial crush ───────────────────────────────────────────────────
  const noseCrush = inCrushed * yzKernel * deformLevel;
  const dx = -(noseCrush * 1.90 + foldWave);

  // ── dy: hood buckle + bumper dive ─────────────────────────────────────
  const hoodH      = Math.max(0, wy);
  const hoodFront  = Math.max(0, Math.min(1, relX) - 0.52);
  // DUCTILE: large smooth hood bow; BRITTLE: sharp crease
  const hoodScale  = behavior === "DUCTILE" ? 0.52 : behavior === "BRITTLE" ? 0.30 : 0.42;
  const hoodBuckle = hoodH * hoodFront * inCrushed * deformLevel * hoodScale;

  const lowerFac   = Math.max(0, -wy - 0.12);
  const bumperDive = lowerFac * (relX > 0.88 ? 1.0 : 0.0) * deformLevel * 0.14;

  // BRITTLE: toe board rises more suddenly (structural collapse)
  const cabinFac   = Math.max(0, Math.min(1, (relX - 0.48) / 0.18)) * Math.max(0, wy + 0.08);
  const toeScale   = behavior === "BRITTLE" ? 0.08 : 0.05;
  const toeRise    = cabinFac * Math.max(0, deformLevel - 0.65) * toeScale;

  const dy = hoodBuckle - bumperDive + toeRise;

  // ── dz: fender splay ──────────────────────────────────────────────────
  const sideSign    = Math.sign(wz + 1e-9);
  const sideFac     = Math.abs(wz) / 1.05;
  // DUCTILE: wide smooth splay; BRITTLE: tight splay + panel split effect
  const splayScale  = behavior === "DUCTILE" ? 0.28 : behavior === "BRITTLE" ? 0.14 : 0.22;
  const fenderSplay = sideFac * inCrushed * deformLevel * splayScale;
  // BRITTLE: panels "split" apart at high deform
  const splitEffect = behavior === "BRITTLE" && deformLevel > 0.55
    ? sideFac * (deformLevel - 0.55) * 0.18 : 0;

  const dz = sideSign * (fenderSplay + splitEffect);

  return { dx, dy, dz };
}

// ── 2. ROOF IMPACT ────────────────────────────────────────────────────────
export function getRoofImpactDisplacement(wx, wy, wz, deformLevel, impactX = 0, behavior = "BALANCED") {
  const radDist   = Math.sqrt((wx - impactX) ** 2 + wz ** 2);
  const heightFac = Math.max(0, Math.min(1, (wy + 0.30) / 1.25));

  // BRITTLE: localized collapse; DUCTILE: wide gradual bowl
  const sigma     = behavior === "DUCTILE" ? 1.10 + deformLevel * 0.70
                  : behavior === "BRITTLE" ? 0.65 + deformLevel * 0.40
                  : 0.92 + deformLevel * 0.62;
  const radKernel = Math.exp(-(radDist * radDist) / (2 * sigma * sigma));
  const vertCrush = deformLevel * radKernel * heightFac;

  // Pillar collapse
  function pillarContrib(px, pz) {
    const d2  = (wx - px) ** 2 + (Math.abs(wz) - pz) ** 2;
    const fac = Math.exp(-d2 / 0.22) * Math.max(0, wy - 0.18);
    // BRITTLE: pillars collapse more suddenly
    const threshold = behavior === "BRITTLE" ? 0.18 : 0.22;
    return fac * Math.max(0, deformLevel - threshold) * 1.6;
  }
  const pillarSum = pillarContrib(0.95, 0.94) + pillarContrib(0.0, 0.94) + pillarContrib(-1.30, 0.92);

  // BRITTLE: sharp dimpling pattern; DUCTILE: smooth bowl
  const dimpleFreq = behavior === "BRITTLE" ? 5.0 : 3.0;
  const dimple     = Math.sin(radDist * dimpleFreq) * vertCrush * (behavior === "BRITTLE" ? 0.10 : 0.05);

  const dy       = -(vertCrush * 0.84 + pillarSum * 0.24 + Math.abs(dimple));
  const sideSign = Math.sign(wz + 1e-9);
  const dx       = radKernel * heightFac * deformLevel * 0.08 * Math.sign(wx - impactX + 1e-9);
  const dz       = sideSign * pillarSum * 0.20 * deformLevel;

  return { dx, dy, dz };
}

// Stub for removed side impact (backward compat)
export function getSideImpactDisplacement() { return { dx: 0, dy: 0, dz: 0 }; }
