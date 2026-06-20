// RealSimulationMode.jsx
// AI Alloy Digital Twin — Frontal Crash & Roof Drop Simulation
// Side Impact removed. Added: alloy behavior, vehicle mass, glass damage,
// heatmap mode, detached parts, suspension visual, cinematic camera.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { SimScene } from "./simulation/SimScene3D.jsx";
import {
  calcFrontalCrash, calcRoofDrop,
  classifyAlloyBehavior, calcGlassDamage,
  getAlloyAppearance, getMaterialParams,
} from "./simulation/physics.js";
import {
  CAR_REST_Y, COL_IMPACT_X, COL_START_X, WALL_X, GROUND_Y,
} from "./simulation/carData.js";

// ── Constants ────────────────────────────────────────────────────────────
const TEST_MODES = [
  { id: "frontal", label: "정면 충돌", icon: "🚗", desc: "차량이 콘크리트 벽에 정면 충돌합니다" },
  { id: "drop",    label: "루프 낙하", icon: "⬇️", desc: "중량체가 차량 루프 위에서 낙하합니다" },
];

// Concrete strength presets
const WALL_PRESETS = [
  { label: "일반 (25 MPa)",    value: 25 },
  { label: "표준 (35 MPa)",    value: 35 },
  { label: "고강도 (60 MPa)",  value: 60 },
  { label: "초고강 (100 MPa)", value: 100 },
];

// Speed presets
const SPEED_PRESETS = [
  { label: "도심 30", value: 30 },
  { label: "일반 50", value: 50 },
  { label: "고속 80", value: 80 },
  { label: "위험 120", value: 120 },
  { label: "극단 160", value: 160 },
];

const DAMAGE_COLORS = { Minimal:"#22c55e", Moderate:"#f59e0b", Heavy:"#f97316", Severe:"#ef4444" };
const DAMAGE_KO     = { Minimal:"경미",    Moderate:"보통",    Heavy:"심각",    Severe:"치명적" };
const BEHAVIOR_META = {
  DUCTILE:  { color:"#3b82f6", bg:"#1e3a5f", label:"연성",   desc:"부드럽게 굽힘 — 소성 변형 큼" },
  BRITTLE:  { color:"#ef4444", bg:"#5f1e1e", label:"취성",   desc:"급격히 파단 — 균열·분리 발생" },
  BALANCED: { color:"#f59e0b", bg:"#5f3e0a", label:"균형",   desc:"적당한 변형과 에너지 흡수" },
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const FRONTAL_START_X  = COL_START_X + 0.6;
const FRONTAL_IMPACT_X = COL_IMPACT_X;

// ── Design tokens ─────────────────────────────────────────────────────────
const T = {
  bg:"#070c18", panel:"#0c1428", panelB:"#111d38",
  border:"#1a2d50", accent:"#3b82f6", text:"#e2e8f0",
  muted:"#64748b", label:"#94a3b8",
  success:"#22c55e", warn:"#f59e0b", danger:"#ef4444",
  mono:'"Consolas","Malgun Gothic",monospace',
  sans:'"Malgun Gothic","Nanum Gothic","Segoe UI",sans-serif',
};

// ── Sub-components ────────────────────────────────────────────────────────
function Label({ children, style }) {
  return <div style={{ fontSize:10, color:T.label, fontFamily:T.mono, letterSpacing:"1px", textTransform:"uppercase", ...style }}>{children}</div>;
}
function Value({ children, color=T.text, unit="", size=20 }) {
  return (
    <div style={{ display:"flex", alignItems:"baseline", gap:3 }}>
      <span style={{ fontSize:size, fontWeight:700, color, fontFamily:T.mono, lineHeight:1.1 }}>{children}</span>
      {unit && <span style={{ fontSize:10, color:T.muted }}>{unit}</span>}
    </div>
  );
}
function Stat({ label, value, unit="", color=T.text }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
      <Label>{label}</Label>
      <Value color={color} unit={unit}>{value}</Value>
    </div>
  );
}

function IntegrityBar({ value }) {
  const v = clamp(value ?? 100, 0, 100);
  const c = v >= 70 ? T.success : v >= 40 ? T.warn : T.danger;
  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
        <Label>Structural Integrity</Label>
        <span style={{ fontSize:11, color:c, fontWeight:700, fontFamily:T.mono }}>{v.toFixed(1)}%</span>
      </div>
      <div style={{ height:7, borderRadius:999, background:"#0d1629", overflow:"hidden" }}>
        <div style={{ width:`${v}%`, height:"100%", background:c, transition:"width 200ms ease" }} />
      </div>
    </div>
  );
}
function ZoneBar({ label, value }) {
  const v = clamp((value ?? 0)*100, 0, 100);
  const c = v < 20 ? T.success : v < 50 ? T.warn : v < 80 ? T.danger : "#7c0000";
  return (
    <div style={{ marginBottom:5 }}>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:2 }}>
        <span style={{ fontSize:10, color:T.label, fontFamily:T.mono }}>{label}</span>
        <span style={{ fontSize:10, color:c, fontFamily:T.mono, fontWeight:700 }}>{v.toFixed(0)}%</span>
      </div>
      <div style={{ height:3, borderRadius:999, background:"#0d1629", overflow:"hidden" }}>
        <div style={{ width:`${v}%`, height:"100%", background:c, transition:"width 150ms ease" }} />
      </div>
    </div>
  );
}

function DamageGauge({ score, level }) {
  const color = DAMAGE_COLORS[level] ?? T.text;
  const pct   = (score * 100).toFixed(1);
  const r = 50, circ = 2 * Math.PI * r;
  const dash = circ * score * 0.75;
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:5, padding:"12px 0 8px" }}>
      <Label>Damage Score</Label>
      <div style={{ position:"relative", width:110, height:110 }}>
        <svg width={110} height={110} viewBox="0 0 110 110" style={{ position:"absolute", inset:0 }}>
          <circle cx={55} cy={55} r={r} fill="none" stroke="#0d1629" strokeWidth={9} />
          <circle cx={55} cy={55} r={r} fill="none" stroke={color} strokeWidth={9}
            strokeLinecap="round" strokeDasharray={`${circ}`} strokeDashoffset={`${circ - dash}`}
            transform="rotate(-225 55 55)"
            style={{ transition:"stroke-dashoffset 500ms ease, stroke 400ms ease", filter:`drop-shadow(0 0 5px ${color}88)` }}
          />
        </svg>
        <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}>
          <span style={{ fontSize:26, fontWeight:800, color, fontFamily:T.mono, lineHeight:1 }}>{pct}</span>
          <span style={{ fontSize:9, color:T.muted }}>/ 100</span>
        </div>
      </div>
      <div style={{ padding:"3px 12px", borderRadius:999, background:`${color}22`, border:`1px solid ${color}44` }}>
        <span style={{ fontSize:12, fontWeight:700, color, fontFamily:T.mono }}>{level} — {DAMAGE_KO[level]}</span>
      </div>
    </div>
  );
}

function BehaviorBadge({ behavior }) {
  if (!behavior) return null;
  const m = BEHAVIOR_META[behavior];
  return (
    <div style={{ padding:"8px 10px", borderRadius:8, background:m.bg, border:`1px solid ${m.color}44` }}>
      <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:3 }}>
        <div style={{ width:8, height:8, borderRadius:"50%", background:m.color, flexShrink:0 }} />
        <span style={{ fontSize:12, fontWeight:700, color:m.color, fontFamily:T.mono }}>
          {behavior} — {m.label}
        </span>
      </div>
      <span style={{ fontSize:10, color:T.label, fontFamily:T.mono }}>{m.desc}</span>
    </div>
  );
}

function GlassBadge({ stage }) {
  if (!stage || stage === "CLEAR") return null;
  const colors = { CRACKED_LIGHT:"#94a3b8", CRACKED_HEAVY:"#64748b", SHATTERED:"#ef4444" };
  const labels = { CRACKED_LIGHT:"경미 균열", CRACKED_HEAVY:"심한 균열", SHATTERED:"파손" };
  const c = colors[stage] ?? T.label;
  return (
    <div style={{ padding:"4px 10px", borderRadius:6, background:`${c}18`, border:`1px solid ${c}44`, display:"inline-flex", alignItems:"center", gap:5 }}>
      <span style={{ fontSize:14 }}>🪟</span>
      <span style={{ fontSize:11, fontWeight:700, color:c, fontFamily:T.mono }}>윈드실드 {labels[stage]}</span>
    </div>
  );
}

function Slider({ label, value, unit, min, max, step=1, onChange, disabled, wide }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:4, minWidth: wide ? 180 : undefined }}>
      <div style={{ display:"flex", justifyContent:"space-between" }}>
        <span style={{ fontSize:10, color:T.label, fontFamily:T.mono }}>{label}</span>
        <strong style={{ fontSize:12, color:T.text, fontFamily:T.mono }}>{value}<span style={{ marginLeft:2, color:T.muted, fontWeight:400 }}>{unit}</span></strong>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width:"100%", accentColor:T.accent, opacity:disabled ? 0.4 : 1 }} />
    </div>
  );
}

function Toggle({ label, value, onChange }) {
  return (
    <button onClick={() => onChange(!value)}
      style={{ padding:"5px 10px", borderRadius:6, border:`1px solid ${value ? T.accent : T.border}`,
        background: value ? `${T.accent}22` : "transparent", color: value ? T.accent : T.muted,
        cursor:"pointer", fontSize:11, fontWeight:600, fontFamily:T.mono }}>
      {value ? "✓" : "○"} {label}
    </button>
  );
}

// ── Main Component ────────────────────────────────────────────────────────
export default function RealSimulationMode({ prediction, onClose }) {
  const [testMode,     setTestMode]     = useState("frontal");
  const [phase,        setPhase]        = useState("idle");
  const [progress,     setProgress]     = useState(0);
  const [deformLevel,  setDeformLevel]  = useState(0);
  const [impacted,     setImpacted]     = useState(false);
  const [flashOpacity, setFlashOpacity] = useState(0);
  const [physResult,   setPhysResult]   = useState(null);
  const [dropPostState, setDropPostState] = useState(null);
  const [slowMo,       setSlowMo]       = useState(false);
  const [heatmapMode,  setHeatmapMode]  = useState(false);

  // Positions
  const [carWorldPos,   setCarWorldPos]   = useState([FRONTAL_START_X, CAR_REST_Y, 0]);
  const [dropWeightPos, setDropWeightPos] = useState([0, 5, 0]);

  // Parameters
  const [collisionSpeed,   setCollisionSpeed]   = useState(80);
  const [vehicleMass,      setVehicleMass]      = useState(1500);
  const [concreteStrength, setConcreteStrength] = useState(35);
  const [dropMass,         setDropMass]         = useState(2000);
  const [dropHeight,       setDropHeight]        = useState(5);
  const [impactX,          setImpactX]           = useState(0);
  const [speedMult,        setSpeedMult]         = useState(1.0);

  // Refs
  const animRef         = useRef(null);
  const lastTsRef       = useRef(null);
  const progressRef     = useRef(0);
  const deformRef       = useRef(0);
  const phaseRef        = useRef("idle");
  const shakeRef        = useRef({ intensity:0, decay:0.88 });
  const hitWallRef      = useRef(false);
  const crushTimeRef    = useRef(0);
  const physResRef      = useRef(null);
  const crushDurRef     = useRef(1.0);
  const dropOutcomeRef  = useRef(null);
  const dropAnimRef     = useRef(null);
  const dropWeightDurRef= useRef(1.0);

  // Ref-mirrors
  const testModeRef       = useRef(testMode);
  const speedMultRef      = useRef(speedMult);
  const collisionSpeedRef = useRef(collisionSpeed);
  const vehicleMassRef    = useRef(vehicleMass);
  const concreteRef       = useRef(concreteStrength);
  const dropMassRef       = useRef(dropMass);
  const dropHeightRef     = useRef(dropHeight);
  const impactXRef        = useRef(impactX);

  useEffect(() => { testModeRef.current       = testMode;        }, [testMode]);
  useEffect(() => { speedMultRef.current      = speedMult;       }, [speedMult]);
  useEffect(() => { collisionSpeedRef.current = collisionSpeed;  }, [collisionSpeed]);
  useEffect(() => { vehicleMassRef.current    = vehicleMass;     }, [vehicleMass]);
  useEffect(() => { concreteRef.current       = concreteStrength;}, [concreteStrength]);
  useEffect(() => { dropMassRef.current       = dropMass;        }, [dropMass]);
  useEffect(() => { dropHeightRef.current     = dropHeight;      }, [dropHeight]);
  useEffect(() => { impactXRef.current        = impactX;         }, [impactX]);
  useEffect(() => { phaseRef.current          = phase;           }, [phase]);

  const matP = useMemo(() => getMaterialParams(prediction), [prediction]);
  const behavior = useMemo(() => classifyAlloyBehavior(matP), [matP]);
  const alloyAppearance = useMemo(() => ({
    ...getAlloyAppearance(prediction, matP),
    _tensile: matP.tensileStrength,
    _hardness: matP.hardness,
  }), [prediction, matP]);

  const previewPhysics = useMemo(() => {
    if (testMode === "frontal") return calcFrontalCrash(collisionSpeed, matP, concreteStrength, vehicleMass);
    return calcRoofDrop(dropHeight, dropMass, matP);
  }, [testMode, collisionSpeed, concreteStrength, vehicleMass, dropHeight, dropMass, matP]);

  const result = physResult ?? previewPhysics;

  // ── Init positions ────────────────────────────────────────────────────
  const getInitPositions = useCallback((mode) => {
    if (mode === "frontal") {
      const sx = FRONTAL_START_X - Math.max(0, (collisionSpeedRef.current - 60) * 0.04);
      return { car: [sx, CAR_REST_Y, 0], weight: [impactXRef.current, CAR_REST_Y + 2.6 + dropHeightRef.current * 0.85, 0] };
    }
    return { car: [0, CAR_REST_Y, 0], weight: [impactXRef.current, CAR_REST_Y + 2.6 + dropHeightRef.current * 0.85, 0] };
  }, []);

  const stopAnim = useCallback(() => {
    if (animRef.current) { cancelAnimationFrame(animRef.current); animRef.current = null; }
  }, []);

  // ── Reset ────────────────────────────────────────────────────────────
  const handleReset = useCallback(() => {
    stopAnim();
    progressRef.current   = 0; deformRef.current    = 0;
    lastTsRef.current     = null; phaseRef.current   = "idle";
    shakeRef.current      = { intensity:0, decay:0.88 };
    hitWallRef.current    = false; crushTimeRef.current = 0;
    physResRef.current    = null; crushDurRef.current  = 1.0;
    dropOutcomeRef.current= null; dropAnimRef.current  = null;
    dropWeightDurRef.current = 1.0;
    setPhase("idle"); setProgress(0); setDeformLevel(0);
    setImpacted(false); setFlashOpacity(0);
    setPhysResult(null); setDropPostState(null); setSlowMo(false);
    const { car, weight } = getInitPositions(testModeRef.current);
    setCarWorldPos(car); setDropWeightPos(weight);
  }, [stopAnim, getInitPositions]);

  useEffect(() => { handleReset(); }, [testMode]); // eslint-disable-line
  useEffect(() => {
    if (phase === "idle") {
      const { car, weight } = getInitPositions(testMode);
      setCarWorldPos(car); setDropWeightPos(weight);
    }
  }, [dropHeight, impactX, collisionSpeed, vehicleMass, testMode, phase, getInitPositions]);

  // ── UNIFIED SIM LOOP ─────────────────────────────────────────────────
  const startSimLoop = useCallback(() => {
    stopAnim(); lastTsRef.current = null;

    const loop = (ts) => {
      const ph = phaseRef.current;
      if (ph === "idle" || ph === "paused") return;
      if (!lastTsRef.current) lastTsRef.current = ts;
      const rawDt = Math.min((ts - lastTsRef.current) / 1000, 0.05);
      lastTsRef.current = ts;
      // Slow-motion: halve time speed during crush if enabled
      const timeMult = (ph === "impacting" && slowMo) ? 0.40 : 1.0;
      const dt = rawDt * speedMultRef.current * timeMult;
      const mode = testModeRef.current;

      if (!hitWallRef.current) {
        // ── APPROACH ──────────────────────────────────────────────────────
        const spd = mode === "frontal" ? 0.46 : 0.34;
        progressRef.current = clamp(progressRef.current + dt * spd, 0, 1);
        const p = progressRef.current;
        setProgress(p);

        if (mode === "frontal") {
          const sx = FRONTAL_START_X - Math.max(0, (collisionSpeedRef.current - 60) * 0.04);
          setCarWorldPos([sx + (FRONTAL_IMPACT_X - sx) * p, CAR_REST_Y, 0]);
          // Pre-contact bumper flex (last 7%)
          if (p > 0.93) {
            const pre = ((p - 0.93) / 0.07) * 0.04;
            deformRef.current = pre; setDeformLevel(pre); setImpacted(true);
          }
        } else {
          // Drop: gravity acceleration (p²)
          const sy = CAR_REST_Y + 2.6 + dropHeightRef.current * 0.85;
          const ey = CAR_REST_Y + 1.22;
          setDropWeightPos([impactXRef.current, sy + (ey - sy) * (p * p), 0]);
        }

        if (p >= 1) {
          // ── IMPACT ──────────────────────────────────────────────────────
          hitWallRef.current   = true;
          crushTimeRef.current = 0;

          const res = mode === "frontal"
            ? calcFrontalCrash(collisionSpeedRef.current, matP, concreteRef.current, vehicleMassRef.current)
            : calcRoofDrop(dropHeightRef.current, dropMassRef.current, matP);

          physResRef.current  = res;
          crushDurRef.current = 0.48 + (res.deformLevel ?? 0) * 1.12;

          setPhysResult(res); setImpacted(true);
          setPhase("impacting"); phaseRef.current = "impacting";

          const sev = res.damageScore;
          setFlashOpacity(0.55 + sev * 0.35);
          shakeRef.current = { intensity: 1.0 + sev * 1.5, decay: 0.78 };
          setTimeout(() => setFlashOpacity(0.12), 55);
          setTimeout(() => setFlashOpacity(0),   260);

          // Slow-motion triggers automatically on severe impacts
          if (sev > 0.55) setSlowMo(true);

          // Drop: precompute weight animation at impact time
          if (mode === "drop") {
            const score    = res.damageScore;
            const ductility = res.zones?.roofPanel ?? score;
            const roofY    = CAR_REST_Y + 1.22;
            const groundY  = CAR_REST_Y - 0.25;
            const impX     = impactXRef.current;

            let outcome;
            if      (score < 0.25) outcome = "resting";
            else if (score < 0.50) outcome = "sliding";
            else if (score < 0.80) outcome = ductility < 0.5 ? "bouncing" : "sliding";
            else                   outcome = "embedded";

            dropOutcomeRef.current = outcome;
            setDropPostState(outcome);

            let anim = { roofY, impX };
            if (outcome === "resting") {
              anim.sinkY = roofY - score * 0.38; anim.dur = 0.65;
            } else if (outcome === "sliding") {
              const dir = impX >= 0 ? 1 : -1;
              anim.targetX = impX + dir * (1.9 + Math.abs(impX)*0.4);
              anim.groundY = groundY; anim.dur = 1.40;
            } else if (outcome === "bouncing") {
              const rest = 0.30 + (1-score)*0.30;
              anim.bounceH = Math.min(2.4, res.kineticEnergyKj * 0.0035 * rest);
              anim.landX   = impX + (score > 0.6 ? -1 : 1) * (1.5 + score*0.8);
              anim.groundY = groundY; anim.dur = 1.05;
            } else {
              anim.sinkY = CAR_REST_Y + 0.55; anim.dur = 0.40;
            }
            dropAnimRef.current      = anim;
            dropWeightDurRef.current = anim.dur;
          }
        }
      } else {
        // ── CRUSH: deformation + weight SIMULTANEOUS ─────────────────────
        crushTimeRef.current += rawDt * speedMultRef.current;  // unscaled for duration tracking
        const res    = physResRef.current;
        const target = res?.deformLevel ?? 0;
        const deformT = Math.min(1, crushTimeRef.current / crushDurRef.current);
        const eased   = 1 - Math.pow(1 - deformT, 2.8);

        deformRef.current = target * eased;
        setDeformLevel(deformRef.current);

        // Momentum carry-through
        if (mode === "frontal") {
          setCarWorldPos([FRONTAL_IMPACT_X + deformRef.current * 0.55, CAR_REST_Y, 0]);
        }

        // Drop weight simultaneous animation
        if (mode === "drop" && dropOutcomeRef.current && dropAnimRef.current) {
          const anim = dropAnimRef.current;
          const wt   = Math.min(1, crushTimeRef.current / dropWeightDurRef.current);

          if (dropOutcomeRef.current === "resting") {
            const e = 1 - Math.pow(1 - wt, 2.2);
            setDropWeightPos([anim.impX, anim.roofY + (anim.sinkY - anim.roofY)*e, 0]);
          } else if (dropOutcomeRef.current === "sliding") {
            const eX = wt * wt;
            const edgeT = Math.max(0, (wt - 0.55)/0.45);
            setDropWeightPos([
              anim.impX + (anim.targetX - anim.impX)*eX,
              anim.roofY + (anim.groundY - anim.roofY)*(edgeT*edgeT), 0,
            ]);
          } else if (dropOutcomeRef.current === "bouncing") {
            const arcY = anim.roofY + anim.bounceH*4*wt*(1-wt) + (anim.groundY - anim.roofY)*wt*wt;
            setDropWeightPos([anim.impX + (anim.landX - anim.impX)*(wt*wt*(3-2*wt)), arcY, 0]);
          } else {  // embedded
            const e = 1 - Math.pow(1 - wt, 1.5);
            setDropWeightPos([anim.impX, anim.roofY + (anim.sinkY - anim.roofY)*e, 0]);
          }
        }

        const weightDone = mode !== "drop" || !dropOutcomeRef.current
          || (crushTimeRef.current >= dropWeightDurRef.current);

        if (deformT >= 1 && weightDone) {
          deformRef.current = target;
          setDeformLevel(target);
          setSlowMo(false);
          setPhase("done"); phaseRef.current = "done";
          return;
        }
      }

      animRef.current = requestAnimationFrame(loop);
    };

    animRef.current = requestAnimationFrame(loop);
  }, [matP, stopAnim, slowMo]);

  // ── Start / Pause / Resume ────────────────────────────────────────────
  const handleStart = useCallback(() => {
    handleReset();
    setTimeout(() => {
      const { car, weight } = getInitPositions(testModeRef.current);
      setCarWorldPos(car); setDropWeightPos(weight);
      setPhase("running"); phaseRef.current = "running";
      startSimLoop();
    }, 60);
  }, [handleReset, getInitPositions, startSimLoop]);

  const handlePause = useCallback(() => {
    if (phaseRef.current === "running" || phaseRef.current === "impacting") {
      stopAnim(); setPhase("paused"); phaseRef.current = "paused";
    } else if (phaseRef.current === "paused") {
      const wasImpacted = hitWallRef.current;
      phaseRef.current = wasImpacted ? "impacting" : "running";
      setPhase(phaseRef.current); lastTsRef.current = null;
      startSimLoop();
    }
  }, [stopAnim, startSimLoop]);

  useEffect(() => () => stopAnim(), [stopAnim]);

  const isRunning  = phase === "running" || phase === "impacting";
  const phaseBadge = { idle:"대기", running:"접근 중", paused:"일시정지", impacting:"충돌 중", done:"완료" }[phase] ?? phase;
  const phaseBadgeColor = phase === "done" ? T.success : phase === "impacting" ? T.danger : phase === "running" ? T.accent : T.muted;

  // Computed from result
  const glassDamage     = result?.glassDamage      ?? "CLEAR";
  const bumperDetached  = result?.bumperDetached    ?? false;
  const hoodDetached    = result?.hoodDetached      ?? false;
  const suspensionPitch = result?.suspensionPitch   ?? 0;

  const statusText = (() => {
    if (phase === "idle")      return TEST_MODES.find(m => m.id === testMode)?.desc ?? "";
    if (phase === "running")   return `접근 중 ${(progress*100).toFixed(0)}%`;
    if (phase === "paused")    return `일시정지 ${(progress*100).toFixed(0)}%`;
    if (phase === "impacting") return `변형 진행 중 ${(deformLevel*100).toFixed(1)}%`;
    return `데미지 ${(result.damageScore*100).toFixed(1)}점 · ${result.behavior ?? behavior} · ${result.damageLevel}`;
  })();

  // ── RENDER ──────────────────────────────────────────────────────────────
  return (
    <div style={{ position:"fixed", inset:0, zIndex:200, background:T.bg, display:"flex", flexDirection:"column", fontFamily:T.sans, color:T.text }}>

      {/* TOP BAR */}
      <div style={{ height:52, flexShrink:0, display:"flex", alignItems:"center", gap:12, padding:"0 18px", borderBottom:`1px solid ${T.border}`, background:T.panel }}>
        {TEST_MODES.map((m) => (
          <button key={m.id} onClick={() => { if (!isRunning) setTestMode(m.id); }}
            style={{ padding:"5px 14px", borderRadius:8, border: m.id===testMode ? "none" : `1px solid ${T.border}`,
              background: m.id===testMode ? T.accent : "transparent",
              color: m.id===testMode ? "#fff" : T.muted,
              cursor: isRunning && m.id!==testMode ? "not-allowed" : "pointer",
              opacity: isRunning && m.id!==testMode ? 0.45 : 1,
              fontSize:12, fontWeight:700, display:"flex", alignItems:"center", gap:5 }}>
            {m.icon} {m.label}
          </button>
        ))}
        <div style={{ flex:1 }} />
        {/* Toggles */}
        <Toggle label="히트맵" value={heatmapMode} onChange={setHeatmapMode} />
        <Toggle label="슬로우모션" value={slowMo} onChange={setSlowMo} />
        {/* Phase badge */}
        <div style={{ padding:"3px 10px", borderRadius:999, border:`1px solid ${phaseBadgeColor}44`, background:`${phaseBadgeColor}18`, fontSize:11, fontWeight:700, color:phaseBadgeColor, fontFamily:T.mono }}>{phaseBadge}</div>
        {/* Speed mult */}
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          <span style={{ fontSize:10, color:T.muted, fontFamily:T.mono }}>재생속도</span>
          <input type="range" min={0.2} max={3} step={0.1} value={speedMult} onChange={(e) => setSpeedMult(parseFloat(e.target.value))} style={{ width:70, accentColor:T.accent }} />
          <span style={{ fontSize:11, color:T.text, fontFamily:T.mono, width:26 }}>{speedMult.toFixed(1)}x</span>
        </div>
        <button onClick={onClose} style={{ padding:"5px 12px", borderRadius:8, border:`1px solid ${T.border}`, background:"transparent", color:T.muted, cursor:"pointer", fontSize:12 }}>닫기 ✕</button>
      </div>

      {/* MAIN */}
      <div style={{ flex:1, display:"flex", overflow:"hidden" }}>

        {/* LEFT PANEL */}
        <div style={{ width:215, flexShrink:0, background:T.panel, borderRight:`1px solid ${T.border}`, padding:"12px", display:"flex", flexDirection:"column", gap:10, overflowY:"auto" }}>

          {/* Alloy behavior badge */}
          <BehaviorBadge behavior={behavior} />

          {/* Material props */}
          <div>
            <Label style={{ borderBottom:`1px solid ${T.border}`, paddingBottom:5, marginBottom:8 }}>Alloy Profile</Label>
            <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
              <Stat label="항복강도" value={matP.yieldStrength.toFixed(0)} unit="MPa" />
              <Stat label="인장강도" value={matP.tensileStrength.toFixed(0)} unit="MPa" />
              <Stat label="연신율" value={matP.elongation.toFixed(1)} unit="%" />
              <Stat label="경도" value={matP.hardness.toFixed(0)} unit="HV" />
              <Stat label="밀도" value={matP.density.toFixed(2)} unit="g/cm³" />
            </div>
          </div>

          {/* Test parameters */}
          <div>
            <Label style={{ borderBottom:`1px solid ${T.border}`, paddingBottom:5, marginBottom:8 }}>Test Params</Label>
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>

              {/* Vehicle mass — both modes */}
              <Slider label="차량 질량" value={vehicleMass} unit="kg" min={800} max={5000} step={50}
                onChange={(v) => setVehicleMass(Math.round(v))} disabled={isRunning} />

              {testMode === "frontal" && (
                <>
                  {/* Speed presets */}
                  <div>
                    <Label style={{ marginBottom:4 }}>충돌 속도</Label>
                    <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginBottom:4 }}>
                      {SPEED_PRESETS.map((p) => (
                        <button key={p.value} onClick={() => setCollisionSpeed(p.value)} disabled={isRunning}
                          style={{ padding:"2px 7px", borderRadius:5, fontSize:10, fontFamily:T.mono, fontWeight:600, cursor:"pointer",
                            border:`1px solid ${collisionSpeed===p.value ? T.accent : T.border}`,
                            background: collisionSpeed===p.value ? `${T.accent}22` : "transparent",
                            color: collisionSpeed===p.value ? T.accent : T.muted }}>
                          {p.label}
                        </button>
                      ))}
                    </div>
                    <Slider label="" value={collisionSpeed} unit="km/h" min={20} max={200} step={5}
                      onChange={(v) => setCollisionSpeed(Math.round(v))} disabled={isRunning} />
                  </div>

                  {/* Wall strength presets */}
                  <div>
                    <Label style={{ marginBottom:4 }}>콘크리트 강도</Label>
                    <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginBottom:4 }}>
                      {WALL_PRESETS.map((p) => (
                        <button key={p.value} onClick={() => setConcreteStrength(p.value)} disabled={isRunning}
                          style={{ padding:"2px 7px", borderRadius:5, fontSize:10, fontFamily:T.mono, fontWeight:600, cursor:"pointer",
                            border:`1px solid ${concreteStrength===p.value ? T.accent : T.border}`,
                            background: concreteStrength===p.value ? `${T.accent}22` : "transparent",
                            color: concreteStrength===p.value ? T.accent : T.muted }}>
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {testMode === "drop" && (
                <>
                  <Slider label="낙하 질량" value={dropMass} unit="kg" min={500} max={10000} step={100}
                    onChange={(v) => setDropMass(Math.round(v))} disabled={isRunning} />
                  <Slider label="낙하 높이" value={dropHeight.toFixed(1)} unit="m" min={1} max={30} step={0.5}
                    onChange={setDropHeight} disabled={isRunning} />
                  <Slider label="충격 위치 X" value={impactX.toFixed(1)} unit="" min={-1.5} max={1.5} step={0.1}
                    onChange={setImpactX} disabled={isRunning} />
                </>
              )}
            </div>
          </div>

          {/* Preview */}
          <div>
            <Label style={{ borderBottom:`1px solid ${T.border}`, paddingBottom:5, marginBottom:8 }}>Preview</Label>
            <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
              <Stat label="예상 데미지" value={(previewPhysics.damageScore*100).toFixed(1)}
                color={DAMAGE_COLORS[previewPhysics.damageLevel]} />
              <Stat label="충격 에너지" value={previewPhysics.kineticEnergyKj.toFixed(0)} unit="kJ" />
              {testMode === "frontal" && (
                <Stat label="차량 질량" value={previewPhysics.vehicleMassKg?.toFixed(0) ?? vehicleMass} unit="kg" />
              )}
              {testMode === "drop" && (
                <Stat label="충격 속도" value={previewPhysics.impactVelocity?.toFixed(1) ?? "-"} unit="m/s" />
              )}
            </div>
          </div>
        </div>

        {/* VIEWPORT */}
        <div style={{ flex:1, position:"relative" }}>
          <Canvas key={testMode} shadows
            camera={{ position:[3.5,2.6,7.5], fov:62 }}
            gl={{ antialias:true, alpha:false, powerPreference:"high-performance" }}
            style={{ width:"100%", height:"100%" }}>
            <color attach="background" args={["#0e1f38"]} />
            <fog attach="fog" args={["#0e1f38", 42, 85]} />
            <SimScene
              testMode={testMode}
              carWorldPos={carWorldPos}
              dropWeightPos={dropWeightPos}
              deformLevel={deformLevel}
              impacted={impacted}
              shakeRef={shakeRef}
              slowMo={slowMo}
              impactX={impactX}
              alloyAppearance={alloyAppearance}
              behavior={result?.behavior ?? behavior}
              heatmapMode={heatmapMode}
              speedKmh={collisionSpeed}
              glassDamage={glassDamage}
              bumperDetached={bumperDetached}
              hoodDetached={hoodDetached}
              suspensionPitch={suspensionPitch}
            />
          </Canvas>

          {/* HUD */}
          <div style={{ position:"absolute", top:12, left:12, padding:"8px 12px", borderRadius:10, background:"rgba(4,12,28,0.82)", backdropFilter:"blur(8px)", color:"#c8e0ff", pointerEvents:"none" }}>
            <div style={{ fontSize:10, color:"#5a9aff", letterSpacing:"1px", fontFamily:T.mono, marginBottom:3 }}>
              {testMode === "frontal" ? "FRONTAL CRASH VIEW" : "ROOF DROP VIEW"}
            </div>
            <div style={{ fontSize:12 }}>
              {testMode === "frontal" && `${collisionSpeed} km/h · ${vehicleMass} kg · ${concreteStrength} MPa`}
              {testMode === "drop"    && `${dropMass} kg · ${dropHeight.toFixed(1)} m · x=${impactX.toFixed(1)}`}
            </div>
            {behavior && (
              <div style={{ marginTop:3, fontSize:10, color: BEHAVIOR_META[behavior]?.color ?? T.muted, fontFamily:T.mono, fontWeight:700 }}>
                {behavior} alloy
              </div>
            )}
          </div>

          {/* Impact energy HUD (shown after impact) */}
          {impacted && result && (
            <div style={{ position:"absolute", top:12, right:12, padding:"8px 12px", borderRadius:10, background:"rgba(4,12,28,0.82)", backdropFilter:"blur(8px)", pointerEvents:"none" }}>
              <div style={{ fontSize:10, color:"#5a9aff", letterSpacing:"1px", fontFamily:T.mono, marginBottom:3 }}>IMPACT DATA</div>
              <div style={{ fontSize:12, color:T.text, fontFamily:T.mono }}>
                KE: {result.kineticEnergyKj?.toFixed(0)} kJ
              </div>
              <div style={{ fontSize:12, color:T.text, fontFamily:T.mono }}>
                F: {result.peakForceKN?.toFixed(0)} kN
              </div>
              {heatmapMode && (
                <div style={{ fontSize:10, color:T.warn, fontFamily:T.mono, marginTop:3 }}>● HEATMAP MODE</div>
              )}
            </div>
          )}

          {/* Flash */}
          {flashOpacity > 0.01 && (
            <div style={{ position:"absolute", inset:0, pointerEvents:"none", background:`rgba(255,140,30,${flashOpacity})`, transition:"opacity 0.18s" }} />
          )}

          {/* Glass damage */}
          {glassDamage !== "CLEAR" && impacted && (
            <div style={{ position:"absolute", bottom:50, left:"50%", transform:"translateX(-50%)", pointerEvents:"none" }}>
              <GlassBadge stage={glassDamage} />
            </div>
          )}

          {/* Status bar */}
          <div style={{ position:"absolute", bottom:0, left:0, right:0, padding:"7px 14px", background:"rgba(4,12,28,0.85)", backdropFilter:"blur(4px)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <span style={{ fontSize:11, color:T.label, fontFamily:T.mono }}>{statusText}</span>
            {phase !== "idle" && (
              <div style={{ width:140, height:3, borderRadius:999, background:"#0d1629", overflow:"hidden" }}>
                <div style={{ width:`${(phase==="impacting" ? (deformLevel/Math.max(0.001, result.deformLevel)) : progress)*100}%`, height:"100%", background:phase==="impacting"?T.danger:T.accent, transition:"width 80ms linear" }} />
              </div>
            )}
          </div>

          {/* Controls */}
          <div style={{ position:"absolute", bottom:32, left:"50%", transform:"translateX(-50%)", display:"flex", gap:10 }}>
            <button onClick={isRunning ? handlePause : handleStart}
              style={{ width:50, height:50, borderRadius:14, border:"none", cursor:"pointer", background:isRunning?"rgba(239,68,68,0.18)":T.accent, color:isRunning?T.danger:"#fff", fontSize:20, boxShadow:"0 4px 12px rgba(0,0,0,0.5)" }}>
              {phase==="running"?"⏸":"▶"}
            </button>
            <button onClick={handleReset}
              style={{ width:50, height:50, borderRadius:14, border:`1px solid ${T.border}`, cursor:"pointer", background:"rgba(4,12,28,0.85)", color:T.muted, fontSize:20, boxShadow:"0 4px 12px rgba(0,0,0,0.5)" }}>
              ↺
            </button>
          </div>
        </div>

        {/* RIGHT RESULTS PANEL */}
        <div style={{ width:235, flexShrink:0, background:T.panel, borderLeft:`1px solid ${T.border}`, padding:"12px", display:"flex", flexDirection:"column", gap:10, overflowY:"auto" }}>
          <Label style={{ borderBottom:`1px solid ${T.border}`, paddingBottom:5 }}>Simulation Result</Label>

          <DamageGauge score={result.damageScore} level={result.damageLevel} />
          <IntegrityBar value={result.structuralIntegrity} />

          {/* Zone breakdown */}
          <div>
            <Label style={{ marginBottom:6 }}>Zone Breakdown</Label>
            {testMode === "frontal" && result.zones && (
              <>
                <ZoneBar label="Front Bumper"  value={result.zones.frontBumper} />
                <ZoneBar label="Crumple Zone"  value={result.zones.crumpleZone} />
                <ZoneBar label="Engine Bay"    value={result.zones.engineBay} />
                <ZoneBar label="Hood"          value={result.zones.hood} />
                <ZoneBar label="Windshield"    value={result.zones.windshield} />
                <ZoneBar label="Firewall"      value={result.zones.firewall} />
                <ZoneBar label="A-Pillar"      value={result.zones.aPillar} />
                <ZoneBar label="Cabin"         value={result.zones.cabin} />
              </>
            )}
            {testMode === "drop" && result.zones && (
              <>
                <ZoneBar label="Roof Panel"  value={result.zones.roofPanel} />
                <ZoneBar label="A-Pillar"    value={result.zones.aPillar} />
                <ZoneBar label="B-Pillar"    value={result.zones.bPillar} />
                <ZoneBar label="C-Pillar"    value={result.zones.cPillar} />
                <ZoneBar label="Cabin"       value={result.zones.cabin} />
              </>
            )}
          </div>

          {/* Detailed stats */}
          <div style={{ borderTop:`1px solid ${T.border}`, paddingTop:8, display:"flex", flexDirection:"column", gap:7 }}>
            <Label>Details</Label>
            <Stat label="충격력" value={result.peakForceKN?.toFixed(0) ?? "-"} unit="kN" />
            <Stat label="충격 에너지" value={result.kineticEnergyKj?.toFixed(0) ?? "-"} unit="kJ" />
            <Stat label="흡수 에너지" value={result.absorbedKJ?.toFixed(0) ?? "-"} unit="kJ" />

            {testMode === "frontal" && (
              <>
                <Stat label="벽 손상" value={(result.wallDamage*100).toFixed(1)} unit="%"
                  color={result.wallDamage>0.6?T.danger:result.wallDamage>0.3?T.warn:T.success} />
                <Stat label="차량 질량" value={result.vehicleMassKg?.toFixed(0) ?? vehicleMass} unit="kg" />
                {bumperDetached && <Stat label="범퍼" value="탈거됨" color={T.danger} />}
                {hoodDetached   && <Stat label="후드" value="탈거됨" color={T.danger} />}
              </>
            )}
            {testMode === "drop" && (
              <>
                <Stat label="충격 속도" value={result.impactVelocity?.toFixed(1) ?? "-"} unit="m/s" />
                <Stat label="루프 상태" value={result.roofState ?? "-"}
                  color={result.roofState==="Destroyed"?T.danger:result.roofState==="Collapsed"?T.danger:result.roofState==="Dented"?T.warn:T.success} />
                <Stat label="균열 확률" value={result.crackProbability?.toFixed(1) ?? "-"} unit="%" />
                {dropPostState && (
                  <Stat label="물체 최종 상태"
                    value={{ resting:"루프 안착", sliding:"측면 낙하", bouncing:"반발 이탈", embedded:"관통 박힘" }[dropPostState] ?? "-"}
                    color={{ resting:T.success, sliding:T.warn, bouncing:T.warn, embedded:T.danger }[dropPostState]} />
                )}
              </>
            )}
          </div>

          {/* Output report */}
          {phase === "done" && (
            <div style={{ background:T.panelB, borderRadius:8, padding:"9px 10px", fontSize:10, color:T.label, lineHeight:1.6, fontFamily:T.mono, border:`1px solid ${T.border}` }}>
              <div style={{ color:DAMAGE_COLORS[result.damageLevel], fontWeight:700, marginBottom:4 }}>[{result.damageLevel}] {result.damageLevelKo}</div>
              <div>behavior: <span style={{ color:BEHAVIOR_META[result.behavior ?? behavior]?.color }}>{result.behavior ?? behavior}</span></div>
              <div>damage_score: {(result.damageScore*100).toFixed(1)}</div>
              <div>energy_kJ: {result.kineticEnergyKj?.toFixed(0)}</div>
              {testMode === "frontal" && <div>wall_damage: {(result.wallDamage*100).toFixed(1)}%</div>}
              {testMode === "drop"    && <div>roof_state: {result.roofState}</div>}
              {testMode === "drop" && dropPostState && <div>object: {dropPostState}</div>}
              <div>glass: {glassDamage}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
