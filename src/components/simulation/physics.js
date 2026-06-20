// physics.js — AI Alloy Digital Twin Crash Simulation
// Receives predicted alloy properties → computes damage scores, behavior, propagation

const GRAVITY = 9.81;
const BASE_MASS = 1500;  // kg default
const REF_DENSITY = 7.8;

export { BASE_MASS, REF_DENSITY, GRAVITY };

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// ── Material params from AI prediction ───────────────────────────────────
export function getMaterialParams(prediction) {
  if (!prediction) {
    return { tensileStrength: 800, yieldStrength: 576, elasticModulus: 200000,
             density: 7.8, elongation: 20, hardness: 200 };
  }
  const tensileStrength = prediction.utsMpa ?? prediction.strengthMpa ?? 800;
  const yieldStrength   = prediction.yieldStressMpa ?? tensileStrength * 0.72;
  return {
    tensileStrength,
    yieldStrength: Math.min(yieldStrength, tensileStrength * 0.95),
    elasticModulus: (prediction.elasticityGpa ?? 200) * 1000,
    density:   prediction.density ?? 7.8,
    elongation: prediction.elongationPercent ?? 20,
    hardness:  prediction.hardness ?? 200,
  };
}

// ══════════════════════════════════════════════════════════════════════════
// ALLOY BEHAVIOR CLASSIFICATION
// Three visually distinct behaviors that users can immediately feel
// ══════════════════════════════════════════════════════════════════════════
export function classifyAlloyBehavior(matP) {
  // Ductility index: high elongation + low hardness = ductile
  const ductilityIdx  = (matP.elongation / 35) - (matP.hardness / 600);
  // Brittleness index: high hardness + low elongation = brittle
  const brittleIdx    = (matP.hardness / 500) - (matP.elongation / 40);

  if (ductilityIdx > 0.35 || matP.elongation > 25) return "DUCTILE";
  if (brittleIdx   > 0.30 || matP.elongation < 8)  return "BRITTLE";
  return "BALANCED";
}

// ══════════════════════════════════════════════════════════════════════════
// GLASS DAMAGE STAGES
// Brittle alloys transmit shock to glass more aggressively
// ══════════════════════════════════════════════════════════════════════════
export function calcGlassDamage(damageScore, behavior) {
  const sensitivity = behavior === "BRITTLE" ? 1.50 : behavior === "DUCTILE" ? 0.70 : 1.0;
  const effective   = clamp(damageScore * sensitivity, 0, 1);
  if (effective < 0.20) return "CLEAR";
  if (effective < 0.42) return "CRACKED_LIGHT";
  if (effective < 0.68) return "CRACKED_HEAVY";
  return "SHATTERED";
}

// ══════════════════════════════════════════════════════════════════════════
// DAMAGE LABEL
// ══════════════════════════════════════════════════════════════════════════
function damageLabel(score) {
  if (score < 0.20) return "Minimal";
  if (score < 0.50) return "Moderate";
  if (score < 0.80) return "Heavy";
  return "Severe";
}
function damageKo(score) {
  if (score < 0.20) return "경미";
  if (score < 0.50) return "보통";
  if (score < 0.80) return "심각";
  return "치명적";
}

// ══════════════════════════════════════════════════════════════════════════
// ENERGY ABSORPTION CAPACITY
// Behavior affects HOW the alloy absorbs energy (not just how much)
// ══════════════════════════════════════════════════════════════════════════
function crumpleCapacity(matP, volumeFactor, behavior) {
  const base = volumeFactor * 285000
    * Math.pow(matP.yieldStrength / 420, 0.90)
    * (1 + matP.elongation / 40)
    * Math.pow(matP.hardness / 220, 0.08);

  // DUCTILE: absorbs more energy over larger deformation range
  // BRITTLE: absorbs less (fails suddenly) — same capacity but lower threshold
  const behaviorMult = behavior === "DUCTILE" ? 1.18 : behavior === "BRITTLE" ? 0.82 : 1.0;
  return base * behaviorMult;
}

// ══════════════════════════════════════════════════════════════════════════
// ZONE-BY-ZONE DAMAGE PROPAGATION
// Damage travels through connected structures realistically
// Front Bumper → Crumple → Engine Bay → Hood → Firewall → A-Pillar → Cabin
// ══════════════════════════════════════════════════════════════════════════
function buildFrontalZones(demand, behavior) {
  // Each zone activates at a different demand threshold
  // BRITTLE: sharp onset but limited propagation depth
  // DUCTILE: gradual onset, propagates further into structure
  const sharpness = behavior === "BRITTLE" ? 2.2 : behavior === "DUCTILE" ? 1.0 : 1.5;

  const z = (threshold, scale = 1) => {
    const d = Math.max(0, demand - threshold);
    return clamp(1 - Math.exp(-d * sharpness * scale), 0, 1);
  };

  // BRITTLE: sudden large jumps; DUCTILE: gradual
  return {
    frontBumper:  clamp(z(0.00, 1.4), 0, 1),
    crumpleZone:  clamp(z(0.05, 1.2), 0, 1),
    engineBay:    clamp(z(0.18, 1.0), 0, 1),
    hood:         clamp(z(0.12, 1.1), 0, 1),
    windshield:   clamp(z(0.38, 0.9), 0, 1),
    firewall:     clamp(z(0.55, 0.8), 0, 1),
    aPillar:      clamp(z(0.70, 0.7), 0, 1),
    cabin:        clamp(z(0.85, 0.6), 0, 1),
  };
}

function buildDropZones(demand, behavior) {
  const sharpness = behavior === "BRITTLE" ? 2.0 : behavior === "DUCTILE" ? 0.9 : 1.4;
  const z = (thr, sc = 1) => clamp(1 - Math.exp(-Math.max(0, demand - thr) * sharpness * sc), 0, 1);
  return {
    roofPanel: z(0.00, 1.3),
    aPillar:   z(0.15, 1.1),
    bPillar:   z(0.22, 1.0),
    cPillar:   z(0.30, 0.9),
    cabin:     z(0.65, 0.7),
  };
}

// ══════════════════════════════════════════════════════════════════════════
// 1. FRONTAL CRASH
// vehicleMass: override (default uses density-scaled mass)
// ══════════════════════════════════════════════════════════════════════════
export function calcFrontalCrash(speedKmh, matP, barrierStrength = 35, vehicleMass = null) {
  const behavior = classifyAlloyBehavior(matP);
  const v    = speedKmh / 3.6;
  const mass = vehicleMass ?? BASE_MASS * (matP.density / REF_DENSITY);
  const KE   = 0.5 * mass * v * v;

  const capacity = crumpleCapacity(matP, 1.0, behavior);
  const demand   = KE / Math.max(1, capacity);

  // BRITTLE: damage score spikes more aggressively at high demand
  let damageScore = clamp(1 - Math.exp(-demand * 1.18), 0, 1);
  if (behavior === "BRITTLE" && demand > 0.55) {
    damageScore = clamp(damageScore + (demand - 0.55) * 0.28, 0, 1);
  }

  // Energy balance
  const absorbedFrac  = 1 - Math.exp(-demand * 0.80);
  const absorbedKJ    = KE * absorbedFrac / 1000;
  const residualKJ    = Math.max(0, KE * (1 - absorbedFrac)) / 1000;

  // Wall/barrier damage
  const wallCap     = 140000 * Math.pow(Math.max(15, barrierStrength) / 35, 1.2);
  const wallDemand  = (residualKJ * 1000) / Math.max(1, wallCap);
  const wallDamage  = clamp(1 - Math.exp(-wallDemand * 1.1), 0, 1);
  const wallRisk    = wallDamage < 0.18 ? "SAFE" : wallDamage < 0.40 ? "LOW"
                    : wallDamage < 0.72 ? "MODERATE" : "HIGH";

  const contactTime = Math.max(0.012, 0.042 * (1 - damageScore * 0.45));
  const peakForceKN = (mass * v) / contactTime / 1000;

  const zones = buildFrontalZones(demand, behavior);
  const glassDamage = calcGlassDamage(damageScore, behavior);

  // Detachment thresholds
  const bumperDetached = damageScore > 0.70;
  const hoodDetached   = damageScore > 0.85;

  // Suspension pitch (degrees nose-down on frontal)
  const suspensionPitch = clamp(damageScore * 6.5, 0, 8);

  return {
    damageScore,
    damageLevel: damageLabel(damageScore),
    damageLevelKo: damageKo(damageScore),
    behavior,
    deformLevel: damageScore,
    zones,
    glassDamage,
    bumperDetached,
    hoodDetached,
    structuralIntegrity: clamp(100 - damageScore * 95, 5, 100),
    kineticEnergyKj: KE / 1000,
    absorbedKJ,
    residualKJ,
    peakForceKN,
    wallDamage,
    wallRisk,
    concreteStrength: barrierStrength,
    vehicleMassKg: mass,
    speedKmh,
    suspensionPitch,
    // legacy
    deformationPct: damageScore * 100,
    impactForce: peakForceKN,
    absorbedEnergyKj: absorbedKJ,
    residualEnergyKj: residualKJ,
    failureRisk: damageScore < 0.25 ? "SAFE" : damageScore < 0.50 ? "LOW"
               : damageScore < 0.75 ? "MODERATE" : "HIGH",
  };
}

// ══════════════════════════════════════════════════════════════════════════
// 2. ROOF DROP
// ══════════════════════════════════════════════════════════════════════════
export function calcRoofDrop(heightM, dropMassKg, matP) {
  const behavior = classifyAlloyBehavior(matP);
  const v  = Math.sqrt(2 * GRAVITY * Math.max(0.5, heightM));
  const KE = 0.5 * dropMassKg * v * v;

  const capacity   = crumpleCapacity(matP, 0.22, behavior);
  const demand     = KE / Math.max(1, capacity);

  let damageScore = clamp(1 - Math.exp(-demand * 0.92), 0, 1);
  if (behavior === "BRITTLE" && demand > 0.45) {
    damageScore = clamp(damageScore + (demand - 0.45) * 0.24, 0, 1);
  }

  const zones        = buildDropZones(demand, behavior);
  const glassDamage  = calcGlassDamage(damageScore * 0.9, behavior);
  const contactTime  = Math.max(0.016, 0.038 * Math.sqrt(Math.max(8, matP.elongation) / 20));
  const peakForceKN  = (dropMassKg * v) / contactTime / 1000;
  const absorbedKJ   = Math.min(KE, capacity * damageScore) / 1000;
  const crackProb    = clamp((damageScore - 0.15) * 145 * (1 - matP.elongation / 90), 0, 100);

  // Roof state label
  const roofState = damageScore < 0.2 ? "Intact"
    : damageScore < 0.5 ? "Dented" : damageScore < 0.8 ? "Collapsed" : "Destroyed";

  // Suspension compression (mm) from mass × impact
  const suspensionCompression = clamp(damageScore * 45 + dropMassKg * 0.006, 0, 80);

  return {
    damageScore,
    damageLevel: damageLabel(damageScore),
    damageLevelKo: damageKo(damageScore),
    behavior,
    deformLevel: damageScore,
    zones,
    glassDamage,
    structuralIntegrity: clamp(100 - damageScore * 88, 12, 100),
    kineticEnergyKj: KE / 1000,
    absorbedKJ,
    residualKJ: Math.max(0, KE / 1000 - absorbedKJ),
    impactVelocity: v,
    crackProbability: crackProb,
    peakForceKN,
    impactForce: peakForceKN,
    absorbedEnergyKj: absorbedKJ,
    failure: damageScore >= 0.88,
    roofState,
    suspensionCompression,
  };
}

// ══════════════════════════════════════════════════════════════════════════
// ALLOY VISUAL APPEARANCE
// ══════════════════════════════════════════════════════════════════════════
const ELEMENT_VISUALS = {
  Fe: { hex: "#8898a8", roughBias:  0.00, metalBias:  0.00 },
  Ni: { hex: "#7a8898", roughBias: -0.02, metalBias:  0.04 },
  Ti: { hex: "#c8ccd8", roughBias: -0.04, metalBias:  0.05 },
  Al: { hex: "#d0d8e4", roughBias: -0.06, metalBias: -0.04 },
  Cr: { hex: "#8898b0", roughBias: -0.03, metalBias:  0.06 },
  Cu: { hex: "#c09040", roughBias:  0.02, metalBias:  0.02 },
  Mg: { hex: "#a8b8c0", roughBias:  0.02, metalBias: -0.06 },
  Co: { hex: "#607088", roughBias: -0.02, metalBias:  0.04 },
  Mo: { hex: "#707888", roughBias: -0.03, metalBias:  0.05 },
  W:  { hex: "#606468", roughBias: -0.05, metalBias:  0.08 },
  V:  { hex: "#788898", roughBias: -0.02, metalBias:  0.03 },
  Mn: { hex: "#7c8898", roughBias:  0.01, metalBias:  0.01 },
};

export function getAlloyAppearance(prediction, matP) {
  const comp  = prediction?.composition ?? {};
  const total = Object.values(comp).reduce((s, v) => s + Number(v), 0) || 1;
  let r = 0, g = 0, b = 0, roughBias = 0, metalBias = 0, w = 0;
  for (const [el, pct] of Object.entries(comp)) {
    const vis = ELEMENT_VISUALS[el]; if (!vis) continue;
    const wt  = Number(pct) / total;
    r += parseInt(vis.hex.slice(1, 3), 16) * wt;
    g += parseInt(vis.hex.slice(3, 5), 16) * wt;
    b += parseInt(vis.hex.slice(5, 7), 16) * wt;
    roughBias += vis.roughBias * wt; metalBias += vis.metalBias * wt; w += wt;
  }
  if (w === 0) return { baseColor: "#8898a8", emissiveColor: "#050e18", metalness: 0.86, roughness: 0.16 };
  const hex = (v) => Math.round(v).toString(16).padStart(2, "0");
  return {
    baseColor:     `#${hex(r)}${hex(g)}${hex(b)}`,
    emissiveColor: `#${hex(r * 0.06)}${hex(g * 0.06)}${hex(b * 0.08)}`,
    metalness: clamp(0.76 + metalBias + (matP.density - 5.0) * 0.028, 0.60, 0.96),
    roughness: clamp(0.18 + roughBias - matP.hardness * 0.00018, 0.06, 0.45),
  };
}

// Legacy compatibility
export const calcCollisionPhysics  = calcFrontalCrash;
export function calcRoofImpactPhysics(h, m, p) { return calcRoofDrop(h, m, p); }
export function calcSideImpact() { return { damageScore: 0, damageLevel: "Minimal", deformLevel: 0, zones: {} }; }
