// ── Physics Engine ────────────────────────────────────────────────────────────
// Ramberg-Osgood, Von Mises, Hall-Petch, microstructure, fatigue, fracture

// Stress-strain curve via Ramberg-Osgood (Hollomon power-law fit)
// Returns array of { strainPct, stressMpa, normStress } objects
export function generateStressStrainCurve(material, nPoints = 14) {
  const UTS   = Math.max(100, material.strengthMpa ?? 800);
  const YS    = Math.max(50,  material.yieldStressMpa ?? UTS * 0.70);
  const E     = Math.max(50,  (material.elasticityGpa ?? 200)) * 1000; // MPa
  const elongPct = Math.max(2, material.elongationPercent ?? 15);

  const epsY   = YS / E;                              // elastic strain at yield
  const epsUTS = Math.max(epsY * 1.5, (elongPct / 100) * 0.35); // uniform strain at UTS

  // Hollomon: σ = K * ε^n
  const n = Math.max(0.05, Math.min(0.50,
    Math.log(UTS / YS) / Math.log(Math.max(1.001, epsUTS / epsY))
  ));
  const K = UTS / Math.pow(epsUTS, n);

  return Array.from({ length: nPoints }, (_, i) => {
    const strainPct = (i / (nPoints - 1)) * elongPct;
    const eps = strainPct / 100;

    let sigma;
    if (eps <= epsY) {
      sigma = eps * E;                             // elastic
    } else if (strainPct <= elongPct * 0.80) {
      sigma = Math.min(UTS, K * Math.pow(eps, n)); // Hollomon plastic
    } else {
      const nt = (strainPct - elongPct * 0.80) / (elongPct * 0.20);
      sigma = UTS * (1 - 0.42 * nt);              // post-UTS softening
    }

    return {
      strainPct,
      stressMpa: Math.max(0, sigma),
      normStress: Math.max(0, Math.min(100, (sigma / UTS) * 100))
    };
  });
}

// Von Mises stress at a specimen vertex (uniaxial tension with Bridgman correction)
// currentR: deformed radius at vertex (Three.js local units)
// gaugeR: reference gauge radius (= 0.26)
// fRatio: load ratio 0→1
// maxStressMPa: material UTS or applied stress level
export function vonMisesAtVertex(currentR, gaugeR, fRatio, maxStressMPa) {
  const refArea    = gaugeR * gaugeR;
  const curArea    = Math.max(currentR * currentR, 1e-6);
  const areaRatio  = refArea / curArea;                  // stress concentration
  const sigma_z    = maxStressMPa * fRatio * areaRatio;
  const nu         = 0.30;

  // Hoop stress: significant in the neck, small in grip
  const neckFactor = currentR < gaugeR ? 0.30 : 0.04;
  const sigma_th   = -nu * sigma_z * neckFactor;

  // σ_VM = √(σz² - σz·σθ + σθ²)
  return Math.sqrt(
    sigma_z * sigma_z - sigma_z * sigma_th + sigma_th * sigma_th
  );
}

// Von Mises stress for bending
// nx: normalized X offset from neutral axis (−1 to +1), bendFactor: 0→1
export function vonMisesBending(nx, bendFactor, maxStressMPa) {
  return maxStressMPa * bendFactor * Math.abs(nx) * 1.15;
}

// Safety factor at a vertex
export function safetyFactor(sigmaVM, sigmaY) {
  if (sigmaVM <= 0) return 10;
  return Math.min(10, sigmaY / sigmaVM);
}

// Hall-Petch: yield stress → grain diameter estimate
// ky ≈ 0.60 MPa·mm^0.5 for austenitic SS
export function estimateGrainDiameterMm(sigmaY, ky = 0.60) {
  const sigma0 = sigmaY * 0.12;
  const diff   = Math.max(5, sigmaY - sigma0);
  return Math.min(2.0, Math.pow(ky / diff, 2)); // mm
}

// Microstructure phase fractions — Schaeffler-diagram inspired empirical model
// Returns fractions in percent
export function predictPhases(composition) {
  const {
    Fe=0, Ni=0, Cr=0, Mo=0, Mn=0, Si=0,
    Nb=0, Ti=0, Al=0, C=0, N=0, Cu=0, Co=0
  } = composition;

  // Nickel equivalent (austenite stabilizers)
  const Ni_eq = Ni + Co + 30*(C + N) + 0.5*Mn + 0.25*Cu;

  // Chromium equivalent (ferrite stabilizers)
  const Cr_eq = Cr + Mo + 1.5*Si + 0.5*Nb + 2.0*Ti + 1.5*Al;

  const total_eq = Ni_eq + Cr_eq;
  const ratio = total_eq > 0 ? Cr_eq / total_eq : 0.5;

  let austenite, ferrite, martensite, bainite;

  if (ratio < 0.42) {
    austenite = Math.min(98, 70 + Ni_eq * 0.60);
    ferrite   = Math.max(0, 100 - austenite - 2);
    martensite = 2;
    bainite   = 0;
  } else if (ratio < 0.62) {
    const t   = (ratio - 0.42) / 0.20;
    ferrite   = Math.min(55, t * 55);
    austenite = Math.max(35, 95 - ferrite);
    martensite = Math.min(10, t * 10);
    bainite   = 0;
  } else {
    const t   = Math.min(1, (ratio - 0.62) / 0.20);
    ferrite   = Math.min(80, 45 + t * 35);
    martensite = Math.min(40, t * 40);
    austenite  = Math.max(0, 100 - ferrite - martensite);
    bainite   = 0;
  }

  const sum   = austenite + ferrite + martensite + bainite;
  const scale = sum > 0 ? 100 / sum : 1;

  return {
    austenite:  Math.round(austenite  * scale),
    ferrite:    Math.round(ferrite    * scale),
    martensite: Math.round(martensite * scale),
    bainite:    Math.round(bainite    * scale),
    Ni_eq:      Ni_eq.toFixed(1),
    Cr_eq:      Cr_eq.toFixed(1)
  };
}

// Fracture type classification
export function classifyFracture(elongPct, areaPct) {
  const el = elongPct ?? 10;
  const ra = areaPct  ?? 20;
  if (el > 8 && ra > 20) {
    return { type: "ductile", korean: "연성 파단 (Ductile)", angle: 0, morphology: "컵-앤드-콘 (Cup-and-Cone)" };
  }
  if (el < 3 && ra < 8) {
    return { type: "brittle", korean: "취성 파단 (Brittle)", angle: 90, morphology: "벽개 파면 (Cleavage)" };
  }
  return { type: "mixed", korean: "혼합형 파단 (Mixed)", angle: 45, morphology: "섬유상 + 전단 파면" };
}

// Fatigue S-N curve — Basquin's law
// Returns array of { logN, N, S } (S in MPa)
export function generateSNCurve(UTS, YS, nPoints = 16) {
  const Se  = Math.min(700, 0.504 * UTS); // endurance limit (MPa)
  const Sf1 = UTS * 1.05;                 // fatigue strength at N=1
  const b   = -Math.log10(Se / Sf1) / 6; // Basquin slope over 6 decades

  return Array.from({ length: nPoints }, (_, i) => {
    const logN = 1 + (i / (nPoints - 1)) * 7; // 10¹ → 10⁸
    const N    = Math.pow(10, logN);
    const S    = Math.max(Se * 0.92, Math.min(Sf1, Sf1 * Math.pow(N, b)));
    return { logN, N, S };
  });
}

// Vickers hardness estimate from UTS (Meyer's empirical: HV ≈ UTS / 3.3 for steel)
export function estimateHardness(UTS) {
  const HV  = Math.round(UTS / 3.3);
  const HB  = Math.round(HV * 0.95);          // Brinell
  const HRC = Math.max(0, Math.round((HV - 240) / 10)); // Rockwell C (valid > HV240)
  return { HV, HB, HRC: HRC > 0 ? HRC : "< 20" };
}

// Fracture toughness estimate (KIC) from Charpy / empirical correlation
// KIC ≈ 0.016 × (UTS)^0.5 × (elongation)^0.5  (MPa·m^0.5, rough estimate)
export function estimateKIC(UTS, elongPct) {
  return Math.round(0.016 * Math.sqrt(UTS) * Math.sqrt(Math.max(1, elongPct)) * 10) / 10;
}
