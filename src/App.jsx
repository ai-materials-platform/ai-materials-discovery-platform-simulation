import React, { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  Activity,
  BarChart3,
  Boxes,
  Cpu,
  Database,
  FastForward,
  Gauge,
  Layers3,
  Link,
  Maximize2,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Save,
  Search,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Thermometer,
  UploadCloud,
  WandSparkles,
  Zap
} from "lucide-react";
import * as THREE from "three";

const TESTS = [
  { id: "strength", label: "강도", icon: Gauge },
  { id: "bending", label: "휘어짐", icon: Activity },
  { id: "elongation", label: "늘어짐", icon: FastForward },
  { id: "temperature", label: "온도", icon: Thermometer }
];

const PRESETS = [
  {
    id: "alloy-ni-ti-cr",
    name: "Ni-Ti-Cr 고강도 합금",
    category: "내열/고강도",
    composition: { Ni: 42, Ti: 31, Cr: 27 },
    densityScale: 0.62,
    color: "#00D1FF"
  },
  {
    id: "alloy-al-mg-si",
    name: "Al-Mg-Si 경량 합금",
    category: "경량/연성",
    composition: { Al: 61, Mg: 24, Si: 15 },
    densityScale: 0.34,
    color: "#3DFFB5"
  },
  {
    id: "alloy-fe-cr-ni",
    name: "Fe-Cr-Ni 내열 합금",
    category: "내식/내열",
    composition: { Fe: 52, Cr: 26, Ni: 22 },
    densityScale: 0.74,
    color: "#FFB020"
  }
];

const DEFAULT_PREDICTION = {
  composition: { Ni: 42, Ti: 31, Cr: 27 },
  density: 7.42,
  strengthMpa: 1220.4,
  yieldStressMpa: 830.0,
  utsMpa: 1220.4,
  elongationPercent: 14.2,
  areaReductionPercent: 29.9,
  elasticityGpa: 144.8,
  thermalConductivity: 78.6,
  meltingPoint: 1487.2,
  predictionConfidence: 94.6,
  latticeStability: 91.4
};

const SIGMA_BY_TEST = { elongation: 1.2, bending: 0.4, strength: 0.65, temperature: 1.5 };

const SPECIMEN_GRAB_HANDLES = [
  [0.68, 1.3, 0], [-0.68, 1.3, 0], [0, 1.3, 0.68], [0, 1.3, -0.68],
  [0.32, 0, 0], [-0.32, 0, 0], [0, 0, 0.32],
  [0.68, -1.3, 0], [-0.68, -1.3, 0], [0, -1.3, 0.68]
];

function heatmapColor(t) {
  const c = Math.max(0, Math.min(1, t));
  if (c < 0.25) { const s = c / 0.25; return [0, s * 0.5, 1.0]; }
  if (c < 0.5)  { const s = (c - 0.25) / 0.25; return [0, 0.5 + s * 0.5, 1 - s]; }
  if (c < 0.75) { const s = (c - 0.5) / 0.25; return [s, 1.0, 0]; }
  const s = (c - 0.75) / 0.25; return [1.0, 1 - s, 0];
}

function nowTime() {
  return new Date().toLocaleTimeString("ko-KR", { hour12: false });
}

function createAlloyFromPreset(preset, index = 0) {
  return {
    ...preset,
    id: `${preset.id}-${index}`,
    prediction: DEFAULT_PREDICTION,
    scale: 1,
    visible: true,
    savedAt: nowTime()
  };
}

async function getBackendUrl() {
  if (window.desktopApi?.getBackendUrl) return window.desktopApi.getBackendUrl();
  return "http://127.0.0.1:8765";
}

async function postBackend(path, payload) {
  const backendUrl = await getBackendUrl();
  const response = await fetch(`${backendUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(`Backend request failed: ${response.status}`);
  return response.json();
}

async function getBackendJson(path) {
  const backendUrl = await getBackendUrl();
  const response = await fetch(`${backendUrl}${path}`);
  if (!response.ok) throw new Error(`Backend request failed: ${response.status}`);
  return response.json();
}

function fallbackPredict(composition, densityScale) {
  const total = Object.values(composition).reduce((sum, value) => sum + Number(value), 0) || 1;
  const ni = (composition.Ni || 0) / total;
  const cr = (composition.Cr || 0) / total;
  const ti = (composition.Ti || 0) / total;
  const al = (composition.Al || 0) / total;
  const mg = (composition.Mg || 0) / total;
  const cu = (composition.Cu || 0) / total;
  const strengthMpa = 820 + ni * 360 + cr * 420 + ti * 240 - al * 110;
  const yieldStressMpa = strengthMpa * (0.62 + ni * 0.14 + cr * 0.10);
  const elongation = Math.max(2.5, Math.min(58, 30 - (strengthMpa / 820 - 1) * 18 + (al + mg + cu) * 9));
  return {
    composition,
    density: Number((5.8 + densityScale * 2.2).toFixed(2)),
    strengthMpa: Number(strengthMpa.toFixed(1)),
    yieldStressMpa: Number(Math.min(yieldStressMpa, strengthMpa * 0.92).toFixed(1)),
    utsMpa: Number(strengthMpa.toFixed(1)),
    elongationPercent: Number(elongation.toFixed(1)),
    areaReductionPercent: Number(Math.max(8, Math.min(82, elongation * 1.4 + 10)).toFixed(1)),
    elasticityGpa: Number((122 + ti * 42 + cr * 18).toFixed(1)),
    thermalConductivity: Number((84 + al * 60 - cr * 18).toFixed(1)),
    meltingPoint: Number((1260 + cr * 260 + ni * 170).toFixed(1)),
    predictionConfidence: 91.8,
    latticeStability: 88.4
  };
}

function firstNumber(source, keys, fallback) {
  for (const key of keys) {
    const value = source?.[key];
    if (value !== undefined && value !== null && value !== "") {
      const number = Number(value);
      if (Number.isFinite(number)) return number;
    }
  }
  return fallback;
}

function findComposition(payload) {
  const candidates = [
    payload?.composition,
    payload?.compositionRatio,
    payload?.composition_ratios,
    payload?.ratios,
    payload?.input?.composition,
    payload?.inputs?.composition,
    payload?.request?.composition,
    payload?.material?.composition
  ];
  const found = candidates.find((item) => item && typeof item === "object" && !Array.isArray(item));
  if (!found) return null;
  return Object.fromEntries(
    Object.entries(found)
      .map(([key, value]) => [key, Number(value)])
      .filter(([, value]) => Number.isFinite(value) && value >= 0)
  );
}

function unwrapPredictionPayload(payload) {
  const chain = [
    payload,
    payload?.payload,
    payload?.data,
    payload?.result,
    payload?.prediction,
    payload?.predicted,
    payload?.properties,
    payload?.predictedProperties,
    payload?.props?.pageProps?.prediction,
    payload?.props?.pageProps?.data
  ];
  return chain.find((item) => item && typeof item === "object" && !Array.isArray(item)) ?? payload;
}

function normalizeExternalPrediction(rawPayload) {
  const payload = unwrapPredictionPayload(rawPayload);
  const nested = unwrapPredictionPayload(payload?.prediction ?? payload?.result ?? payload);
  const composition = findComposition(payload) ?? findComposition(nested);
  if (!composition || Object.keys(composition).length === 0) {
    throw new Error("예측 결과에서 조성 비율을 찾지 못했습니다.");
  }

  const density = firstNumber(nested, ["density", "densityGcc", "density_gcc", "predicted_density"], DEFAULT_PREDICTION.density);
  const strengthMpa = firstNumber(nested, ["strengthMpa", "strength_mpa", "strength", "yieldStrength", "yield_strength", "tensileStrength", "tensile_strength"], DEFAULT_PREDICTION.strengthMpa);
  const elasticityGpa = firstNumber(nested, ["elasticityGpa", "elasticity_gpa", "elasticModulus", "elastic_modulus", "youngsModulus", "youngs_modulus"], DEFAULT_PREDICTION.elasticityGpa);
  const thermalConductivity = firstNumber(nested, ["thermalConductivity", "thermal_conductivity", "conductivity", "k"], DEFAULT_PREDICTION.thermalConductivity);
  const meltingPoint = firstNumber(nested, ["meltingPoint", "melting_point", "meltingPointC", "solidus", "liquidus"], DEFAULT_PREDICTION.meltingPoint);
  const predictionConfidence = firstNumber(nested, ["predictionConfidence", "confidence", "score", "r2"], DEFAULT_PREDICTION.predictionConfidence);
  const latticeStability = firstNumber(nested, ["latticeStability", "stability", "phaseStability", "phase_stability"], DEFAULT_PREDICTION.latticeStability);

  return {
    composition,
    prediction: {
      composition,
      density,
      strengthMpa,
      elasticityGpa,
      thermalConductivity,
      meltingPoint,
      predictionConfidence,
      latticeStability
    }
  };
}

function buildThermalChartValues(prediction, simulation) {
  const peak = simulation?.result.temperatureC ?? Math.round(prediction.meltingPoint * 0.56);
  const melt = prediction.meltingPoint || 1400;
  const ambient = 22;
  const stages = [ambient, ambient * 1.6, peak * 0.28, peak * 0.52, peak * 0.76, peak * 0.91, peak, peak * 0.85, peak * 0.62];
  const max = Math.max(...stages);
  return stages.map((v) => Math.max(2, Math.min(100, (v / max) * 100)));
}

function LoadingSpinner() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ animation: "spin 0.8s linear infinite", flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="32" strokeDashoffset="10" strokeLinecap="round" />
    </svg>
  );
}

function CompositionTotalBar({ total }) {
  const pct = Math.min(total, 100);
  const over = total > 105;
  const under = total < 95;
  const tone = over ? "var(--danger)" : under ? "var(--warning)" : "var(--success)";
  return (
    <div style={{ margin: "4px 0 8px", fontSize: 11 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3, color: tone }}>
        <span>조성 합계</span>
        <span style={{ fontWeight: 600 }}>{total.toFixed(1)}% {over ? "▲ 초과" : under ? "▼ 부족" : "✓ 정상"}</span>
      </div>
      <div style={{ height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: tone, borderRadius: 2, transition: "width 0.3s" }} />
      </div>
    </div>
  );
}

function App() {
  const [alloys, setAlloys] = useState(() => PRESETS.map(createAlloyFromPreset));
  const [selectedId, setSelectedId] = useState(() => `${PRESETS[0].id}-0`);
  const [composition, setComposition] = useState(PRESETS[0].composition);
  const [densityScale, setDensityScale] = useState(PRESETS[0].densityScale);
  const [prediction, setPrediction] = useState(DEFAULT_PREDICTION);
  const [activeTest, setActiveTest] = useState("strength");
  const [activeMode, setActiveMode] = useState("thermal");
  const [shape, setShape] = useState("sphere");
  const [interactMode, setInteractMode] = useState("orbit");
  const orbitEnabledRef = useRef(true);
  const [resetKey, setResetKey] = useState(0);
  const [simulation, setSimulation] = useState(null);
  const [deformStats, setDeformStats] = useState({ maxStrain: 0, grabCount: 0 });
  const [logs, setLogs] = useState([
    { time: nowTime(), text: "조성 비율 기반 합금 모델 로드 완료" },
    { time: nowTime(), text: "Python 예측 백엔드 대기 중" }
  ]);
  const [search, setSearch] = useState("");
  const [compareMode, setCompareMode] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [testTemp, setTestTemp] = useState(20);
  const [isPredicting, setIsPredicting] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [platformStatus, setPlatformStatus] = useState({ available: false, error: "확인 중" });
  const [predictionUrl, setPredictionUrl] = useState("");
  const [process, setProcess] = useState({
    "Solution_treatment_temperature": 1050,
    "Solution_treatment_time(s)": 3600,
    "Temperature (K)": 293
  });
  const didInitialPrediction = useRef(false);

  const stressStrainPoints = useMemo(() => {
    const UTS = prediction.strengthMpa;
    const E = prediction.elasticityGpa * 1000;
    const elongPct = prediction.elongationPercent ?? Math.max(5, 50 - UTS / 40);
    const yieldStress = UTS * 0.70;
    const yieldStrain = (yieldStress / E) * 100;
    const totalStrain = Math.max(elongPct, yieldStrain * 2.5);
    return Array.from({ length: 12 }, (_, i) => {
      const strain = (i / 11) * totalStrain;
      let stress;
      if (strain <= yieldStrain) {
        stress = (strain / yieldStrain) * yieldStress;
      } else {
        const pt = (strain - yieldStrain) / (totalStrain - yieldStrain);
        if (pt < 0.78) {
          stress = yieldStress + (UTS - yieldStress) * Math.pow(pt / 0.78, 0.52);
        } else {
          const nt = (pt - 0.78) / 0.22;
          stress = UTS * (1 - 0.38 * nt);
        }
      }
      return Math.max(0, Math.min(100, (stress / UTS) * 100));
    });
  }, [prediction.strengthMpa, prediction.elasticityGpa, prediction.elongationPercent]);

  const selectedAlloy = alloys.find((alloy) => alloy.id === selectedId) ?? alloys[0];

  useEffect(() => {
    if (!selectedAlloy) return;
    setComposition(selectedAlloy.composition);
    setDensityScale(selectedAlloy.densityScale);
    setPrediction(selectedAlloy.prediction ?? DEFAULT_PREDICTION);
  }, [selectedAlloy?.id]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setPlayhead((value) => {
        const next = value + 1.4;
        return next >= 100 ? 100 : next;
      });
    }, 80);
    return () => window.clearInterval(timer);
  }, [playing]);

  useEffect(() => {
    if (playhead >= 100) setPlaying(false);
  }, [playhead]);

  useEffect(() => {
    getBackendJson("/platform/status")
      .then((status) => {
        setPlatformStatus(status);
        if (status.available) addLog(`사전학습 모델 연결: ${status.modelType}, 평균 R2 ${status.r2Avg}`);
      })
      .catch((error) => {
        setPlatformStatus({ available: false, error: error.message });
        addLog("사전학습 모델 상태 확인 실패: 로컬 계산 모델 대기");
      });
  }, []);

  useEffect(() => {
    if (didInitialPrediction.current) return;
    didInitialPrediction.current = true;
    window.setTimeout(() => {
      predictAlloy(PRESETS[0].composition, PRESETS[0].densityScale);
    }, 350);
  }, []);

  const filteredAlloys = alloys.filter((alloy) =>
    `${alloy.name} ${alloy.category}`.toLowerCase().includes(search.toLowerCase())
  );

  const compositionTotal = Object.values(composition).reduce((sum, value) => sum + Number(value), 0);
  const normalizedComposition = useMemo(() => {
    const total = compositionTotal || 1;
    return Object.fromEntries(Object.entries(composition).map(([key, value]) => [key, Number(((value / total) * 100).toFixed(1))]));
  }, [composition, compositionTotal]);

  function addLog(text) {
    setLogs((items) => [{ time: nowTime(), text }, ...items].slice(0, 10));
  }

  async function predictAlloy(nextComposition = composition, nextDensity = densityScale) {
    setIsPredicting(true);
    try {
      const result = await postBackend("/predict", {
        composition: nextComposition,
        densityScale: nextDensity,
        process
      });
      setPrediction(result);
      setAlloys((items) =>
        items.map((item) => (item.id === selectedId ? { ...item, composition: nextComposition, densityScale: nextDensity, prediction: result } : item))
      );
      addLog("AI 물성 예측 완료: 조성 비율 기반 모델 갱신");
      return result;
    } catch {
      const result = fallbackPredict(nextComposition, nextDensity);
      setPrediction(result);
      addLog("로컬 예측 모델로 물성값 계산 완료");
      return result;
    } finally {
      setIsPredicting(false);
    }
  }

  async function runSimulation(testId = activeTest) {
    if (testId !== activeTest) {
      setActiveTest(testId);
      setResetKey((k) => k + 1);
      setPlayhead(0);
      setPlaying(false);
      if (testId !== "temperature") setTestTemp(20);
    }
    setIsSimulating(true);
    try {
      const result = await postBackend("/simulate", {
        composition,
        densityScale,
        testType: testId,
        scale: selectedAlloy?.scale ?? 1,
        process
      });
      setSimulation(result);
      setPrediction(result.prediction);
      addLog(`${result.testLabel} 실행: 응력 ${result.result.maxStressMpa} MPa, 변형률 ${result.result.strainPercent}%`);
    } catch {
      const predicted = await predictAlloy();
      const safetyIdx = Math.max(4, 100 - (predicted.elongationPercent ?? 18) * 0.8 - (predicted.strengthMpa > 1200 ? 12 : 0));
      const result = {
        testType: testId,
        testLabel: TESTS.find((test) => test.id === testId)?.label ?? "물성 테스트",
        prediction: predicted,
        result: {
          maxStressMpa: predicted.strengthMpa,
          strainPercent: Number(((predicted.elongationPercent ?? 18) * 0.22).toFixed(2)),
          temperatureC: Math.round(predicted.meltingPoint * 0.56),
          deformationMm: Number(((predicted.elongationPercent ?? 18) * 0.41).toFixed(2)),
          safetyIndex: Number(safetyIdx.toFixed(1)),
          thermalGradient: Math.round(predicted.meltingPoint * 0.56 * 0.18),
          failureRisk: safetyIdx >= 78 ? "낮음" : safetyIdx >= 58 ? "주의" : "높음"
        },
        timelineEvents: []
      };
      setSimulation(result);
      addLog(`${result.testLabel} 로컬 시뮬레이션 완료`);
    } finally {
      setIsSimulating(false);
    }
  }

  function updateComposition(element, value) {
    const nextComposition = { ...composition, [element]: Number(value) };
    setComposition(nextComposition);
  }

  function createNewAlloy() {
    const alloy = {
      id: `custom-${Date.now()}`,
      name: `조성 기반 합금 ${alloys.length + 1}`,
      category: "AI 예측 생성",
      composition,
      densityScale,
      prediction,
      scale: 1,
      visible: true,
      savedAt: nowTime(),
      color: "#57F2FF"
    };
    setAlloys((items) => [alloy, ...items]);
    setSelectedId(alloy.id);
    addLog("새 합금 생성: 조성 비율 입력값만 사용");
  }

  function saveState() {
    const payload = { alloys, selectedId, composition, densityScale, prediction, simulation };
    localStorage.setItem("ai-alloy-simulation-state", JSON.stringify(payload));
    addLog("현재 시뮬레이션 상태 저장 완료");
  }

  function loadState() {
    const saved = localStorage.getItem("ai-alloy-simulation-state");
    if (!saved) {
      addLog("불러올 저장 상태가 없습니다");
      return;
    }
    const payload = JSON.parse(saved);
    setAlloys(payload.alloys ?? alloys);
    setSelectedId(payload.selectedId ?? selectedId);
    setComposition(payload.composition ?? composition);
    setDensityScale(payload.densityScale ?? densityScale);
    setPrediction(payload.prediction ?? prediction);
    setSimulation(payload.simulation ?? simulation);
    addLog("저장된 시뮬레이션 상태 불러오기 완료");
  }

  function updateScale(value) {
    const nextScale = Number(value);
    setAlloys((items) => items.map((item) => (item.id === selectedId ? { ...item, scale: nextScale } : item)));
    addLog(`모델 스케일 변경: ${nextScale.toFixed(2)}x, 밀도/응력/열 거동 재계산 대기`);
  }

  function updateProcess(key, value) {
    setProcess((items) => ({ ...items, [key]: Number(value) }));
  }

  function deleteAlloy(id) {
    const remaining = alloys.filter((item) => item.id !== id);
    setAlloys(remaining);
    if (id === selectedId && remaining.length > 0) setSelectedId(remaining[0].id);
    addLog("합금 삭제 완료");
  }

  function handleReset() {
    setSimulation(null);
    setPlaying(false);
    setPlayhead(0);
    setShape("sphere");
    setActiveTest("strength");
    setActiveMode("thermal");
    setDeformStats({ maxStrain: 0, grabCount: 0 });
    setResetKey((k) => k + 1);
    addLog("그림 초기화 완료");
  }

  async function importPredictionFromUrl() {
    if (!predictionUrl.trim()) {
      addLog("예측 결과 URL을 입력해 주세요");
      return;
    }
    try {
      const imported = await postBackend("/import-prediction", { sourceUrl: predictionUrl.trim() });
      const normalized = normalizeExternalPrediction(imported.payload);
      const alloy = {
        id: `imported-${Date.now()}`,
        name: "외부 예측 결과 합금",
        category: "GitHub/API 예측 연동",
        composition: normalized.composition,
        densityScale,
        prediction: normalized.prediction,
        scale: 1,
        visible: true,
        savedAt: nowTime(),
        color: "#57F2FF"
      };
      setAlloys((items) => [alloy, ...items]);
      setSelectedId(alloy.id);
      setComposition(normalized.composition);
      setPrediction(normalized.prediction);
      setSimulation(null);
      addLog(`외부 예측 결과 가져오기 완료: ${imported.resolvedUrl}`);
    } catch (error) {
      addLog(`외부 예측 결과 가져오기 실패: ${error.message}`);
    }
  }

  return (
    <div className="app-shell">
      <header className="top-bar panel">
        <div className="brand-block">
          <div className="brand-mark"><Boxes size={18} /></div>
          <div>
            <strong>AI 합금 디지털 트윈</strong>
            <span>조성 비율 기반 물성 예측 및 가상 시뮬레이션</span>
          </div>
        </div>
        <div className="top-actions">
          <StatusPill icon={Database} label="Python 백엔드" value="연결" tone="ok" />
          <StatusPill icon={WandSparkles} label="예측 모델" value={platformStatus.available ? "사전학습 RF" : "대기"} tone={platformStatus.available ? "ok" : "default"} />
          <StatusPill icon={Cpu} label="GPU 사용량" value="71%" />
          <StatusPill icon={Zap} label="FPS" value="118" tone="accent" />
          <IconButton title="상태 저장" onClick={saveState}><Save size={16} /></IconButton>
          <IconButton title="전체 화면"><Maximize2 size={16} /></IconButton>
        </div>
      </header>

      <main className="workspace">
        <aside className="left-panel panel">
          <PanelHeader title="합금 관리" action={<button className="primary command" onClick={createNewAlloy}><Plus size={15} />새 합금</button>} />
          <div className="search-box">
            <Search size={15} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="합금명, 프리셋, 카테고리 검색" />
          </div>
          <div className="constraint-lock"><WandSparkles size={15} /> 조성 비율 기반 생성 전용</div>

          <section className="panel-section">
            <SectionTitle icon={Layers3} title="합금 목록" />
            <div className="alloy-list">
              {filteredAlloys.map((alloy) => (
                <div
                  role="button"
                  tabIndex={0}
                  className={`alloy-item ${alloy.id === selectedId ? "selected" : ""}`}
                  key={alloy.id}
                  onClick={() => setSelectedId(alloy.id)}
                  onKeyDown={(e) => e.key === "Enter" && setSelectedId(alloy.id)}
                >
                  <span className="alloy-swatch" style={{ backgroundColor: alloy.color }} />
                  <span>
                    <strong>{alloy.name}</strong>
                    <small>{alloy.category} · {alloy.savedAt}</small>
                  </span>
                  <button
                    className="alloy-delete"
                    title="삭제"
                    onClick={(e) => { e.stopPropagation(); deleteAlloy(alloy.id); }}
                  >×</button>
                </div>
              ))}
            </div>
          </section>

          <section className="panel-section">
            <SectionTitle icon={SlidersHorizontal} title="재질 조성 비율" />
            {Object.entries(composition).map(([element, value]) => (
              <ControlSlider
                key={element}
                label={`${element} ${normalizedComposition[element] ?? value}%`}
                min={0}
                max={100}
                value={value}
                onChange={(next) => updateComposition(element, next)}
              />
            ))}
            <CompositionTotalBar total={compositionTotal} />
            <ControlSlider label={`밀도 계수 ${densityScale.toFixed(2)}`} min={0.1} max={1} step={0.01} value={densityScale} onChange={setDensityScale} />
            <ControlSlider label={`모델 스케일 ${(selectedAlloy?.scale ?? 1).toFixed(2)}x`} min={0.55} max={1.8} step={0.01} value={selectedAlloy?.scale ?? 1} onChange={updateScale} />
            <div className="composition-actions">
              <button className="command primary" disabled={isPredicting} onClick={() => predictAlloy()}>
                {isPredicting ? <LoadingSpinner /> : <WandSparkles size={15} />}
                {isPredicting ? "예측 중..." : "AI 예측 실행"}
              </button>
              <button className="command" onClick={loadState}><RotateCcw size={15} />상태 불러오기</button>
            </div>
          </section>

          <section className="panel-section">
            <SectionTitle icon={Thermometer} title="공정 조건" />
            <ControlSlider label={`용체화 온도 ${process["Solution_treatment_temperature"]}°C`} min={900} max={1500} value={process["Solution_treatment_temperature"]} onChange={(value) => updateProcess("Solution_treatment_temperature", value)} />
            <ControlSlider label={`처리 시간 ${process["Solution_treatment_time(s)"]}초`} min={0} max={172800} step={600} value={process["Solution_treatment_time(s)"]} onChange={(value) => updateProcess("Solution_treatment_time(s)", value)} />
            <ControlSlider label={`테스트 온도 ${process["Temperature (K)"]}K`} min={273} max={1422} value={process["Temperature (K)"]} onChange={(value) => updateProcess("Temperature (K)", value)} />
          </section>

          <section className="panel-section">
            <SectionTitle icon={Link} title="외부 예측 결과 연동" />
            <div className="url-import-row">
              <input value={predictionUrl} onChange={(event) => setPredictionUrl(event.target.value)} placeholder="GitHub raw JSON 또는 예측 API URL" />
              <button className="icon-button" title="예측 결과 가져오기" onClick={importPredictionFromUrl}><UploadCloud size={16} /></button>
            </div>
          </section>
        </aside>

        <section className="viewport-panel panel">
          <div className="viewport-toolbar">
            {[
              ["thermal", "열 분포"],
              ["stress", "응력 분포"],
              ["xray", "X-Ray"],
              ["wireframe", "와이어프레임"]
            ].map(([id, label]) => (
              <button key={id} className={activeMode === id ? "active" : ""} onClick={() => setActiveMode(id)}>{label}</button>
            ))}
            <button className={compareMode ? "active" : ""} onClick={() => setCompareMode((value) => !value)}>모델 비교</button>
            <span className="toolbar-sep" />
            <button onClick={handleReset}><RotateCcw size={14} style={{ marginRight: 4 }} />초기화</button>
          </div>
          <div className="viewport-toolbar">
            <span className="toolbar-label">도형</span>
            {[
              ["sphere", "구"],
              ["cube", "정육면체"],
              ["box", "직육면체"],
              ["specimen", "시편"]
            ].map(([id, label]) => (
              <button key={id} className={shape === id ? "active" : ""} onClick={() => setShape(id)}>{label}</button>
            ))}
            <span className="toolbar-sep" />
            <button
              className={interactMode === "orbit" ? "active" : ""}
              onClick={() => { setInteractMode("orbit"); orbitEnabledRef.current = true; }}
            >카메라 이동</button>
            <button
              className={interactMode === "deform" ? "active deform-mode-btn" : "deform-mode-btn"}
              onClick={() => { setInteractMode("deform"); orbitEnabledRef.current = false; }}
            >변형 테스트</button>
          </div>

          <div className={`viewport-stage${interactMode === "deform" ? " deform-active" : ""}`}>
            <Canvas camera={{ position: [0, 2.1, 6], fov: 46 }} dpr={[1, 2]}>
              <color attach="background" args={["#060B16"]} />
              <ambientLight intensity={0.65} />
              <pointLight position={[3, 4, 5]} intensity={42} color="#57F2FF" />
              <pointLight position={[-4, 2, -3]} intensity={18} color="#3DFFB5" />
              <AlloyScene
                alloys={compareMode ? alloys.slice(0, 3) : [selectedAlloy]}
                selectedId={selectedId}
                mode={activeMode}
                activeTest={activeTest}
                prediction={prediction}
                simulation={simulation}
                shape={shape}
                interactMode={interactMode}
                orbitEnabledRef={orbitEnabledRef}
                onSelectId={setSelectedId}
                resetKey={resetKey}
                onDeformStats={setDeformStats}
                playing={playing}
                playhead={playhead}
                testTemp={testTemp}
              />
            </Canvas>
            <div className="holo-label left">
              <span>온도 분포</span>
              <strong>{simulation?.result.temperatureC ?? Math.round(prediction.meltingPoint * 0.56)}°C</strong>
            </div>
            <div className="holo-label right">
              <span>응력 최대치</span>
              <strong>{simulation?.result.maxStressMpa ?? prediction.strengthMpa} MPa</strong>
            </div>
            <div className="holo-label bottom">
              <span>변형률</span>
              <strong>{simulation?.result.strainPercent ?? "3.2"}%</strong>
            </div>
            {shape === "specimen" && (
              <div style={{ position: "absolute", right: 14, bottom: 54, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "8px 10px", background: "rgba(4,10,22,0.82)", border: "1px solid rgba(87,242,255,0.28)", borderRadius: 6, pointerEvents: "none" }}>
                <span style={{ fontSize: 10, color: "#7EC8D4", marginBottom: 2 }}>응력 분포</span>
                <span style={{ fontSize: 9, color: "#ff4444" }}>HIGH</span>
                <div style={{ width: 10, height: 80, background: "linear-gradient(to bottom, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff)", borderRadius: 2 }} />
                <span style={{ fontSize: 9, color: "#4488ff" }}>LOW</span>
              </div>
            )}
          </div>

          <div className="test-strip">
            {TESTS.map((test) => {
              const Icon = test.icon;
              const running = isSimulating && activeTest === test.id;
              return (
                <button key={test.id} className={`test-button ${activeTest === test.id ? "selected" : ""}`} disabled={isSimulating} onClick={() => runSimulation(test.id)}>
                  {running ? <LoadingSpinner /> : <Icon size={17} />}
                  {test.label} 테스트
                </button>
              );
            })}
          </div>
          {activeTest === "temperature" && (
            <div className="panel-section" style={{ padding: "8px 12px 4px" }}>
              <ControlSlider
                label={`테스트 온도 ${testTemp}°C (용융점 ${Math.round(prediction.meltingPoint)}°C)`}
                min={20}
                max={Math.round(prediction.meltingPoint)}
                step={10}
                value={testTemp}
                onChange={setTestTemp}
              />
            </div>
          )}
        </section>

        <aside className="right-panel panel">
          <PanelHeader title="AI 예측 결과" action={
            <div style={{ display: "flex", gap: "6px" }}>
              <button className="command" onClick={handleReset}><RotateCcw size={15} />초기화</button>
              <button className="command primary" disabled={isSimulating || isPredicting} onClick={() => runSimulation(activeTest)}>
                {isSimulating ? <LoadingSpinner /> : <Play size={15} />}
                {isSimulating ? "실행 중..." : "시뮬레이션 시작"}
              </button>
            </div>
          } />
          <div className="kpi-grid">
            <Metric label="0.2% 항복강도" value={`${prediction.yieldStressMpa ?? "-"} MPa`} tone="ok" />
            <Metric label="인장강도 UTS" value={`${prediction.utsMpa ?? prediction.strengthMpa} MPa`} />
            <Metric label="연신율" value={`${prediction.elongationPercent ?? "-"} %`} />
            <Metric label="단면 수축률" value={`${prediction.areaReductionPercent ?? "-"} %`} />
          </div>

          <section className="analytics-card">
            <SectionTitle icon={BarChart3} title="온도 분석" />
            <MiniChart values={buildThermalChartValues(prediction, simulation)} color="#FFB020" />
          </section>
          <section className="analytics-card">
            <SectionTitle icon={Activity} title="응력-변형률 그래프" />
            <StressStrainChart
              points={stressStrainPoints}
              UTS={prediction.strengthMpa}
              yieldStress={prediction.strengthMpa * 0.70}
              elongation={prediction.elongationPercent ?? Math.max(5, 50 - prediction.strengthMpa / 40)}
            />
          </section>
          <section className="analytics-card">
            <SectionTitle icon={Gauge} title="시뮬레이션 통계" />
            <div className="readout-grid">
              <Readout label="탄성 계수" value={`${prediction.elasticityGpa} GPa`} />
              <Readout label="용융점" value={`${prediction.meltingPoint} °C`} />
              <Readout label="변형량" value={`${simulation?.result.deformationMm ?? 0} mm`} />
              <Readout label="파손 위험" value={simulation?.result.failureRisk ?? "대기"} />
              <Readout label="예측 신뢰도" value={`${prediction.predictionConfidence}%`} />
              <Readout label="모델 출처" value={prediction.predictionSource ? "사전학습 모델" : "로컬 모델"} />
              <Readout label="최대 변형률" value={`${deformStats.maxStrain.toFixed(1)}%`} />
              <Readout label="그랩 포인트" value={`${deformStats.grabCount}개`} />
              <Readout label="재료 상태" value={deformStats.maxStrain < 2 ? "탄성" : deformStats.maxStrain < 8 ? "소성" : "파단"} />
            </div>
          </section>
          <section className="analytics-card logs">
            <SectionTitle icon={Database} title="시뮬레이션 로그" />
            {logs.map((log, index) => <p key={`${log.time}-${index}`}>[{log.time}] {log.text}</p>)}
          </section>
        </aside>
      </main>

      <footer className="timeline-panel panel">
        <div className="timeline-controls">
          <IconButton title="이전 프레임"><SkipBack size={16} /></IconButton>
          <IconButton title={playing ? "일시정지" : "재생"} onClick={() => setPlaying((value) => !value)}>{playing ? <Pause size={16} /> : <Play size={16} />}</IconButton>
          <IconButton title="다음 프레임"><SkipForward size={16} /></IconButton>
          <span>재생 속도</span>
          <input type="range" min="0.5" max="3" step="0.1" defaultValue="1.4" />
        </div>
        <div className="timeline-track">
          <div className="timeline-grid" />
          <span className="event thermal" style={{ left: "18%" }}>열 이벤트</span>
          <span className="event stress" style={{ left: "43%" }}>응력 피크</span>
          <span className="event strain" style={{ left: "72%" }}>변형률 수렴</span>
          <div className="playhead" style={{ left: `${playhead}%` }} />
        </div>
      </footer>
    </div>
  );
}

function AlloyScene({ alloys, selectedId, mode, activeTest, prediction, simulation, shape, interactMode, orbitEnabledRef, onSelectId, resetKey, onDeformStats, playing, playhead, testTemp }) {
  return (
    <group>
      <CameraControls orbitEnabledRef={orbitEnabledRef} resetKey={resetKey} />
      <GridFloor />
      {alloys.filter(Boolean).map((alloy, index) => (
        <AlloyModel
          key={alloy.id}
          alloy={alloy}
          selected={alloy.id === selectedId}
          mode={mode}
          activeTest={activeTest}
          prediction={prediction}
          simulation={simulation}
          offset={(index - (alloys.length - 1) / 2) * 2.35}
          shape={shape}
          interactMode={interactMode}
          orbitEnabledRef={orbitEnabledRef}
          onSelect={() => onSelectId(alloy.id)}
          resetKey={resetKey}
          onDeformStats={onDeformStats}
          playing={playing}
          playhead={playhead}
          testTemp={testTemp}
        />
      ))}
    </group>
  );
}

function CameraControls({ orbitEnabledRef, resetKey }) {
  const { camera, gl } = useThree();
  const ctrlRef = useRef();

  useEffect(() => {
    const ctrl = new OrbitControls(camera, gl.domElement);
    ctrl.enableDamping = true;
    ctrl.dampingFactor = 0.08;
    ctrl.minDistance = 1.5;
    ctrl.maxDistance = 22;
    ctrlRef.current = ctrl;
    return () => ctrl.dispose();
  }, [camera, gl]);

  useEffect(() => {
    if (!ctrlRef.current) return;
    camera.position.set(0, 2.1, 6);
    ctrlRef.current.target.set(0, 0, 0);
    ctrlRef.current.update();
  }, [resetKey]);

  useFrame(() => {
    if (!ctrlRef.current) return;
    ctrlRef.current.enabled = orbitEnabledRef?.current ?? true;
    ctrlRef.current.update();
  });

  return null;
}

function AlloyModel({ alloy, selected, mode, activeTest, prediction, simulation, offset, shape, interactMode, orbitEnabledRef, onSelect, resetKey, onDeformStats, playing, playhead, testTemp }) {
  const group = useRef();
  const [deform, setDeform] = useState({ x: 1, y: 1, z: 1 });
  const [fractured, setFractured] = useState(false);

  useEffect(() => {
    setDeform({ x: 1, y: 1, z: 1 });
    setFractured(false);
  }, [resetKey]);

  const points = useMemo(() => {
    const nodes = [];
    for (let x = -2; x <= 2; x += 1) {
      for (let y = -2; y <= 2; y += 1) {
        for (let z = -2; z <= 2; z += 1) {
          if (Math.abs(x) + Math.abs(y) + Math.abs(z) < 6) nodes.push([x * 0.34, y * 0.34, z * 0.34]);
        }
      }
    }
    return nodes;
  }, []);

  const fractureDeform = useMemo(() => {
    const elongPct = prediction.elongationPercent ?? Math.max(3, 50 - prediction.strengthMpa / 40);
    return 1 + (elongPct / 100) * 5;
  }, [prediction.strengthMpa, prediction.elongationPercent]);

  const testScale = useMemo(() => {
    if (activeTest === "elongation") return { x: 0.88, y: 1.28, z: 0.88 };
    if (activeTest === "strength") return { x: 1.08, y: 0.92, z: 1.08 };
    if (activeTest === "temperature") return { x: 1.03, y: 1.03, z: 1.03 };
    return { x: 1, y: 1, z: 1 };
  }, [activeTest]);

  const testRotZ = activeTest === "bending" ? 0.14 : 0;
  const maxDeform = Math.max(deform.x, deform.y);
  const stressRatio = fractureDeform > 1 ? Math.min(1, (maxDeform - 1) / (fractureDeform - 1)) : 0;

  const stressedColor = stressRatio > 0.75 ? "#FF5A5A" : stressRatio > 0.4 ? "#FFB020" : null;
  const modeColor = mode === "thermal" ? "#FFB020" : mode === "stress" ? "#FF5A5A" : mode === "xray" ? "#57F2FF" : alloy.color;
  const tempColor = useMemo(() => {
    if (activeTest !== "temperature") return null;
    const t = Math.max(0, Math.min(1, (testTemp - 20) / Math.max(1, prediction.meltingPoint - 20)));
    if (t < 0.25) return alloy.color;
    if (t < 0.50) return "#FF7700";
    if (t < 0.75) return "#FF3300";
    if (t < 0.92) return "#FF8800";
    return "#FFDD44";
  }, [activeTest, testTemp, prediction.meltingPoint, alloy.color]);
  const color = tempColor ?? stressedColor ?? modeColor;
  const tempEmissiveIntensity = activeTest === "temperature"
    ? 0.18 + Math.max(0, Math.min(1, (testTemp - 20) / Math.max(1, prediction.meltingPoint - 20))) * 0.6
    : 0.24;
  const emissive = selected ? color : (activeTest === "temperature" ? color : "#0B1020");
  const opacity = mode === "xray" ? 0.38 : 0.82;
  const matProps = {
    color, emissive,
    emissiveIntensity: selected ? 0.65 : tempEmissiveIntensity,
    transparent: true, opacity,
    roughness: 0.28, metalness: 0.68,
    wireframe: mode === "wireframe"
  };

  function handlePointerDown(e) {
    if (interactMode !== "deform") return;
    e.stopPropagation();
    onSelect?.();
    if (orbitEnabledRef) orbitEnabledRef.current = false;
    const sx = e.clientX, sy = e.clientY;
    const sd = { ...deform };

    function onMove(ev) {
      const nx = Math.max(0.25, Math.min(3.5, sd.x + (ev.clientX - sx) * 0.007));
      const ny = Math.max(0.25, Math.min(3.5, sd.y - (ev.clientY - sy) * 0.007));
      setDeform({ x: nx, y: ny, z: sd.z });
      if (Math.max(nx, ny) >= fractureDeform) setFractured(true);
    }

    function onUp() {
      if (orbitEnabledRef) orbitEnabledRef.current = interactMode === "orbit";
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  const sc = alloy.scale ?? 1;

  if (shape === "specimen") {
    return (
      <group position={[offset, 0.1, 0]}>
        <DeformableMesh
          mode={mode}
          activeTest={activeTest}
          scale={sc}
          interactMode={interactMode}
          orbitEnabledRef={orbitEnabledRef}
          onSelect={onSelect}
          resetKey={resetKey}
          onDeformStats={onDeformStats}
        />
      </group>
    );
  }

  return (
    <group position={[offset, 0.1, 0]}>
      <DeformableShape
        shape={shape}
        mode={mode}
        scale={sc}
        testScale={testScale}
        activeTest={activeTest}
        interactMode={interactMode}
        orbitEnabledRef={orbitEnabledRef}
        onSelect={onSelect}
        resetKey={resetKey}
        matProps={matProps}
        playing={playing}
        playhead={playhead}
        testTemp={testTemp}
        meltingPoint={prediction.meltingPoint}
      />
    </group>
  );
}

function FracturedMesh({ shape, sx, sy, sz, matProps, gap, mode }) {
  if (shape === "sphere") {
    const r = 1.05;
    const yOff = r * sy + gap / 2;
    return (
      <>
        <mesh scale={[sx, sy, sz]} position={[0, yOff, 0]}>
          <sphereGeometry args={[r, 64, 32]} />
          <meshStandardMaterial {...matProps} />
        </mesh>
        <mesh scale={[sx, sy, sz]} position={[0, -yOff, 0]}>
          <sphereGeometry args={[r, 64, 32]} />
          <meshStandardMaterial {...matProps} />
        </mesh>
      </>
    );
  }
  const [bx, fullBy, bz] = shape === "cube" ? [1.8, 1.8, 1.8] : shape === "box" ? [2.4, 1.2, 1.6] : [1.95, 1.95, 1.95];
  const halfBy = fullBy / 2;
  const yOff = (halfBy / 2) * sy + gap / 2;
  return (
    <>
      <mesh scale={[sx, sy, sz]} position={[0, yOff, 0]}>
        <boxGeometry args={[bx, halfBy, bz]} />
        <meshStandardMaterial {...matProps} />
      </mesh>
      <mesh scale={[sx, sy, sz]} position={[0, -yOff, 0]}>
        <boxGeometry args={[bx, halfBy, bz]} />
        <meshStandardMaterial {...matProps} />
      </mesh>
    </>
  );
}

function FractureGlow() {
  return (
    <mesh rotation={[Math.PI / 2, 0, 0]}>
      <planeGeometry args={[2.8, 2.8]} />
      <meshBasicMaterial color="#FF5A5A" transparent opacity={0.22} side={THREE.DoubleSide} />
    </mesh>
  );
}

function CrackLines({ active }) {
  if (!active) return null;
  return (
    <group>
      {[-0.28, 0.06, 0.34].map((x, index) => (
        <mesh key={x} position={[x, 0.2 - index * 0.18, 0.98]} rotation={[0, 0, 0.62 - index * 0.24]}>
          <boxGeometry args={[0.62, 0.018, 0.018]} />
          <meshStandardMaterial color="#FF5A5A" emissive="#FF5A5A" emissiveIntensity={1.5} />
        </mesh>
      ))}
    </group>
  );
}

function HeatParticles({ active, intensity }) {
  if (!active) return null;
  const count = Math.min(16, Math.max(7, Math.round(intensity / 10)));
  return (
    <group>
      {Array.from({ length: count }).map((_, index) => {
        const angle = (index / count) * Math.PI * 2;
        return (
          <mesh key={index} position={[Math.cos(angle) * 1.25, Math.sin(index) * 0.55, Math.sin(angle) * 1.25]}>
            <sphereGeometry args={[0.025, 10, 10]} />
            <meshBasicMaterial color="#FFB020" transparent opacity={0.72} />
          </mesh>
        );
      })}
    </group>
  );
}

function DeformableMesh({ mode, activeTest, scale, interactMode, orbitEnabledRef, onSelect, resetKey, onDeformStats }) {
  const meshRef = useRef();
  const grabPointsRef = useRef([]);
  const accDisp = useRef(null);

  const { geometry, basePositions } = useMemo(() => {
    const pts = [];
    const N = 36;
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      const y = (t - 0.5) * 2.8;
      const a = Math.abs(t - 0.5) * 2;
      let r;
      if (a > 0.8) {
        r = 0.68;
      } else if (a > 0.5) {
        const blend = (a - 0.5) / 0.3;
        r = 0.32 + 0.36 * (0.5 - 0.5 * Math.cos(blend * Math.PI));
      } else {
        r = 0.32;
      }
      pts.push(new THREE.Vector2(r, y));
    }
    const geo = new THREE.LatheGeometry(pts, 52);
    const base = new Float32Array(geo.attributes.position.array);
    const cnt = geo.attributes.position.count;
    const col = new Float32Array(cnt * 3);
    for (let i = 0; i < cnt; i++) { col[i * 3] = 0.05; col[i * 3 + 1] = 0.45; col[i * 3 + 2] = 1.0; }
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    return { geometry: geo, basePositions: base };
  }, []);

  useEffect(() => {
    if (!meshRef.current) return;
    const geo = meshRef.current.geometry;
    geo.attributes.position.array.set(basePositions);
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
    const col = geo.attributes.color.array;
    for (let i = 0; i < col.length; i += 3) { col[i] = 0.05; col[i + 1] = 0.45; col[i + 2] = 1.0; }
    geo.attributes.color.needsUpdate = true;
    grabPointsRef.current = [];
    if (accDisp.current) accDisp.current.fill(0);
    onDeformStats?.({ maxStrain: 0, grabCount: 0 });
  }, [resetKey]);

  function applyDeformAndColor() {
    if (!meshRef.current) return;
    const geo = meshRef.current.geometry;
    const pos = geo.attributes.position;
    const col = geo.attributes.color;
    const sigma = SIGMA_BY_TEST[activeTest] ?? 0.65;
    if (!accDisp.current || accDisp.current.length !== pos.count) {
      accDisp.current = new Float32Array(pos.count);
    }
    let maxDisp = 0;
    for (let i = 0; i < pos.count; i++) {
      const by = basePositions[i * 3 + 1];
      let dx = 0, dz = 0;
      for (const g of grabPointsRef.current) {
        const dist = Math.abs(by - g.y);
        const w = Math.exp(-(dist * dist) / (2 * sigma * sigma));
        dx += g.dx * w;
        dz += g.dz * w;
      }
      pos.array[i * 3]     = basePositions[i * 3]     + dx;
      pos.array[i * 3 + 1] = basePositions[i * 3 + 1];
      pos.array[i * 3 + 2] = basePositions[i * 3 + 2] + dz;
      const disp = Math.sqrt(dx * dx + dz * dz);
      accDisp.current[i] = disp;
      if (disp > maxDisp) maxDisp = disp;
    }
    for (let i = 0; i < pos.count; i++) {
      const t = Math.min(1, accDisp.current[i] / 0.32);
      const [r, g, b] = heatmapColor(t);
      col.array[i * 3] = r; col.array[i * 3 + 1] = g; col.array[i * 3 + 2] = b;
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    geo.computeVertexNormals();
    onDeformStats?.({ maxStrain: (maxDisp / 0.32) * 100, grabCount: grabPointsRef.current.length });
  }

  function handlePointerDown(e) {
    if (interactMode !== "deform") return;
    e.stopPropagation();
    onSelect?.();
    if (orbitEnabledRef) orbitEnabledRef.current = false;
    const localPoint = meshRef.current.worldToLocal(e.point.clone());
    const sx = e.clientX, sy = e.clientY;
    const gp = { y: localPoint.y, dx: 0, dz: 0 };
    grabPointsRef.current.push(gp);

    function onMove(ev) {
      gp.dx = (ev.clientX - sx) * 0.005;
      gp.dz = (ev.clientY - sy) * 0.005;
      applyDeformAndColor();
    }
    function onUp() {
      if (orbitEnabledRef) orbitEnabledRef.current = interactMode === "orbit";
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  const sc = scale || 1;
  return (
    <group scale={[sc, sc, sc]}>
      <mesh
        ref={meshRef}
        geometry={geometry}
        onPointerDown={handlePointerDown}
        onPointerEnter={() => { if (interactMode === "deform") document.body.style.cursor = "crosshair"; }}
        onPointerLeave={() => { document.body.style.cursor = ""; }}
      >
        <meshStandardMaterial
          vertexColors={mode !== "wireframe" && mode !== "xray"}
          color={mode === "xray" || mode === "wireframe" ? "#57F2FF" : "white"}
          wireframe={mode === "wireframe"}
          transparent
          opacity={mode === "xray" ? 0.28 : 0.92}
          roughness={0.22}
          metalness={0.75}
          side={mode === "xray" ? THREE.DoubleSide : THREE.FrontSide}
        />
      </mesh>
      {interactMode === "deform" && SPECIMEN_GRAB_HANDLES.map(([x, y, z], i) => (
        <mesh key={i} position={[x, y, z]}>
          <sphereGeometry args={[0.05, 10, 10]} />
          <meshBasicMaterial color="#57F2FF" transparent opacity={0.6} />
        </mesh>
      ))}
    </group>
  );
}

function buildTornGeometry(deformedArr, srcGeo, grabPt, pullNormal, keepOnPullSide) {
  const geo = srcGeo.clone();
  const pos = geo.attributes.position;
  // Build perpendicular tangent basis for tear noise
  let ax = 0, ay = 1, az = 0;
  if (Math.abs(pullNormal.y) > 0.9) { ax = 1; ay = 0; az = 0; }
  let t1x = ay * pullNormal.z - az * pullNormal.y;
  let t1y = az * pullNormal.x - ax * pullNormal.z;
  let t1z = ax * pullNormal.y - ay * pullNormal.x;
  const t1len = Math.sqrt(t1x * t1x + t1y * t1y + t1z * t1z);
  if (t1len > 0.001) { t1x /= t1len; t1y /= t1len; t1z /= t1len; }
  const t2x = pullNormal.y * t1z - pullNormal.z * t1y;
  const t2y = pullNormal.z * t1x - pullNormal.x * t1z;
  const t2z = pullNormal.x * t1y - pullNormal.y * t1x;

  for (let i = 0; i < pos.count; i++) {
    const ox = deformedArr[i * 3], oy = deformedArr[i * 3 + 1], oz = deformedArr[i * 3 + 2];
    // Signed distance from fracture plane (positive = on pull side)
    const dot = (ox - grabPt.x) * pullNormal.x + (oy - grabPt.y) * pullNormal.y + (oz - grabPt.z) * pullNormal.z;
    const onPullSide = dot >= 0;
    if (onPullSide === keepOnPullSide) {
      pos.array[i * 3]     = ox;
      pos.array[i * 3 + 1] = oy;
      pos.array[i * 3 + 2] = oz;
    } else {
      const dist = Math.abs(dot);
      const fade = Math.exp(-dist * 1.8);
      const noiseAlong = (keepOnPullSide ? 1 : -1) * Math.random() * 0.18 * fade;
      const noiseP1 = (Math.random() - 0.5) * 0.55 * fade;
      const noiseP2 = (Math.random() - 0.5) * 0.55 * fade;
      // Project vertex to fracture plane, then add directional noise
      pos.array[i * 3]     = (ox - dot * pullNormal.x) + noiseAlong * pullNormal.x + noiseP1 * t1x + noiseP2 * t2x;
      pos.array[i * 3 + 1] = (oy - dot * pullNormal.y) + noiseAlong * pullNormal.y + noiseP1 * t1y + noiseP2 * t2y;
      pos.array[i * 3 + 2] = (oz - dot * pullNormal.z) + noiseAlong * pullNormal.z + noiseP1 * t1z + noiseP2 * t2z;
    }
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

function DraggablePiece({ geometry, matProps, initOffsetVec, offsetScale, camera, orbitEnabledRef, interactMode }) {
  const ref = useRef();
  const s = offsetScale ?? 0.07;
  const initPos = initOffsetVec
    ? [initOffsetVec.x * s, initOffsetVec.y * s, initOffsetVec.z * s]
    : [0, s, 0];
  function handlePointerDown(e) {
    e.stopPropagation();
    if (orbitEnabledRef) orbitEnabledRef.current = false;
    const sx = e.clientX, sy = e.clientY;
    const startPos = ref.current.position.clone();
    const fwd = new THREE.Vector3();
    camera.getWorldDirection(fwd);
    const right = new THREE.Vector3().crossVectors(fwd, camera.up).normalize();
    const camUp = camera.up.clone().normalize();
    function onMove(ev) {
      const mdx = (ev.clientX - sx) * 0.008;
      const mdy = -(ev.clientY - sy) * 0.008;
      if (ref.current) {
        ref.current.position.set(
          startPos.x + right.x * mdx + camUp.x * mdy,
          startPos.y + right.y * mdx + camUp.y * mdy,
          startPos.z + right.z * mdx + camUp.z * mdy
        );
      }
    }
    function onUp() {
      if (orbitEnabledRef) orbitEnabledRef.current = interactMode === "orbit";
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }
  return (
    <mesh
      ref={ref}
      geometry={geometry}
      position={initPos}
      onPointerDown={handlePointerDown}
      onPointerEnter={() => { document.body.style.cursor = "grab"; }}
      onPointerLeave={() => { document.body.style.cursor = ""; }}
    >
      <meshStandardMaterial {...matProps} side={THREE.DoubleSide} />
    </mesh>
  );
}

function DeformableShape({ shape, mode, scale, testScale, activeTest, interactMode, orbitEnabledRef, onSelect, resetKey, matProps, playing, playhead, testTemp, meltingPoint }) {
  const meshRef = useRef();
  const grabsRef = useRef([]);
  const fractureRef = useRef(false);
  const [fractureState, setFractureState] = useState(null);
  const { camera } = useThree();
  const recordedGrabsRef = useRef([]);
  const maxDispAtFullRef = useRef(0);

  const { geometry, basePositions } = useMemo(() => {
    let geo;
    if (shape === "sphere") geo = new THREE.SphereGeometry(1.05, 60, 44);
    else if (shape === "cube") geo = new THREE.BoxGeometry(1.8, 1.8, 1.8, 8, 8, 8);
    else geo = new THREE.BoxGeometry(2.4, 1.2, 1.6, 10, 5, 7);
    const base = new Float32Array(geo.attributes.position.array);
    return { geometry: geo, basePositions: base };
  }, [shape]);

  const geoDims = useMemo(() => {
    if (shape === "sphere") return { halfW: 1.05, halfH: 1.05 };
    if (shape === "cube") return { halfW: 0.9, halfH: 0.9 };
    return { halfW: 1.2, halfH: 0.6 };
  }, [shape]);

  // Per-test influence radius (sigma for Gaussian weighting)
  const sigma = useMemo(() => {
    if (activeTest === "strength") return 0.65;
    if (activeTest === "bending") return 0.5;
    if (activeTest === "elongation") return 1.2;
    if (shape === "sphere") return 0.82;
    if (shape === "cube") return 0.88;
    return 0.85;
  }, [activeTest, shape]);

  // Per-test fracture displacement threshold
  const fractureThreshold = useMemo(() => {
    if (activeTest === "bending") return 0.8;
    if (activeTest === "strength") return 1.1;
    if (activeTest === "elongation") return 1.8;
    return 1.38;
  }, [activeTest]);

  function resetAll() {
    fractureRef.current = false;
    grabsRef.current = [];
    recordedGrabsRef.current = [];
    maxDispAtFullRef.current = 0;
    setFractureState(null);
    document.body.style.cursor = "";
    if (!meshRef.current) return;
    const pos = meshRef.current.geometry.attributes.position;
    pos.array.set(basePositions);
    pos.needsUpdate = true;
    meshRef.current.geometry.computeVertexNormals();
  }

  useEffect(() => { resetAll(); }, [resetKey]);

  // Slider-driven thermal expansion for temperature test
  useEffect(() => {
    if (activeTest !== "temperature" || !meshRef.current) return;
    const T_room = 20;
    const T_melt = meltingPoint ?? 1450;
    const normalized = Math.max(0, Math.min(1, (testTemp - T_room) / Math.max(1, T_melt - T_room)));
    const expansion = normalized * 0.10;
    const pos = meshRef.current.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.array[i * 3]     = basePositions[i * 3]     * (1 + expansion);
      pos.array[i * 3 + 1] = basePositions[i * 3 + 1] * (1 + expansion);
      pos.array[i * 3 + 2] = basePositions[i * 3 + 2] * (1 + expansion);
    }
    pos.needsUpdate = true;
    meshRef.current.geometry.computeVertexNormals();
  }, [activeTest, testTemp, meltingPoint]);

  // Core vertex computation shared by manual deform and playback
  function computeVertexPositions(pulls) {
    if (!meshRef.current) return 0;
    const pos = meshRef.current.geometry.attributes.position;
    let maxDisp = 0;

    if (activeTest === "strength") {
      // ASTM E8 axial tension: global symmetric elongation + Poisson necking at waist
      let totalDy = 0;
      for (const g of pulls) totalDy += g.dy;
      const strainFactor = totalDy / Math.max(0.01, geoDims.halfH);
      const poisson = 0.30;
      for (let i = 0; i < pos.count; i++) {
        const bx = basePositions[i * 3], by = basePositions[i * 3 + 1], bz = basePositions[i * 3 + 2];
        const axialDisp = strainFactor * by;
        const neckProfile = Math.exp(-(by ** 2) * 2.4);
        const radialContraction = -poisson * Math.abs(strainFactor) * neckProfile * 1.6;
        pos.array[i * 3]     = bx * (1 + radialContraction);
        pos.array[i * 3 + 1] = by + axialDisp;
        pos.array[i * 3 + 2] = bz * (1 + radialContraction);
        if (Math.abs(axialDisp) > maxDisp) maxDisp = Math.abs(axialDisp);
      }
    } else if (activeTest === "bending") {
      // ASTM E290 3-point bending: sinusoidal profile along X, fixed ends, free Y and Z
      for (let i = 0; i < pos.count; i++) {
        const bx = basePositions[i * 3], by = basePositions[i * 3 + 1], bz = basePositions[i * 3 + 2];
        let dy = 0, dz = 0;
        for (const g of pulls) {
          const bendFactor = Math.cos((Math.PI / 2) * bx / geoDims.halfW);
          dy += g.dy * bendFactor;
          dz += g.dz * bendFactor;
        }
        pos.array[i * 3]     = bx;
        pos.array[i * 3 + 1] = by + dy;
        pos.array[i * 3 + 2] = bz + dz;
        const d = Math.sqrt(dy * dy + dz * dz);
        if (d > maxDisp) maxDisp = d;
      }
    } else if (activeTest === "elongation") {
      // Ductile elongation: free-form Gaussian + Poisson lateral contraction (ν≈0.30)
      for (let i = 0; i < pos.count; i++) {
        const bx = basePositions[i * 3], by = basePositions[i * 3 + 1], bz = basePositions[i * 3 + 2];
        let dx = 0, dy = 0, dz = 0;
        for (const g of pulls) {
          const dSq = (bx - g.px) ** 2 + (by - g.py) ** 2 + (bz - g.pz) ** 2;
          const w = Math.exp(-dSq / (2 * sigma * sigma));
          dx += g.dx * w; dy += g.dy * w; dz += g.dz * w;
        }
        const dispMag = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const lateralContraction = -0.30 * dispMag / Math.max(0.1, geoDims.halfH) * 0.6;
        pos.array[i * 3]     = bx * (1 + lateralContraction) + dx;
        pos.array[i * 3 + 1] = by + dy;
        pos.array[i * 3 + 2] = bz * (1 + lateralContraction) + dz;
        if (dispMag > maxDisp) maxDisp = dispMag;
      }
    } else {
      // Default free-form Gaussian
      for (let i = 0; i < pos.count; i++) {
        const bx = basePositions[i * 3], by = basePositions[i * 3 + 1], bz = basePositions[i * 3 + 2];
        let dx = 0, dy = 0, dz = 0;
        for (const g of pulls) {
          const dSq = (bx - g.px) ** 2 + (by - g.py) ** 2 + (bz - g.pz) ** 2;
          const w = Math.exp(-dSq / (2 * sigma * sigma));
          dx += g.dx * w; dy += g.dy * w; dz += g.dz * w;
        }
        pos.array[i * 3]     = bx + dx;
        pos.array[i * 3 + 1] = by + dy;
        pos.array[i * 3 + 2] = bz + dz;
        const disp = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (disp > maxDisp) maxDisp = disp;
      }
    }

    pos.needsUpdate = true;
    meshRef.current.geometry.computeVertexNormals();
    return maxDisp;
  }

  function triggerFracture(pulls, maxDisp) {
    fractureRef.current = true;
    maxDispAtFullRef.current = maxDisp;
    let worstGrab = pulls[0];
    let maxGrabMag = 0;
    for (const g of pulls) {
      const m = Math.sqrt(g.dx ** 2 + g.dy ** 2 + g.dz ** 2);
      if (m > maxGrabMag) { maxGrabMag = m; worstGrab = g; }
    }

    let pullNormal, grabPtDeformed;
    if (activeTest === "bending") {
      pullNormal = { x: 1, y: 0, z: 0 };
      grabPtDeformed = { x: 0, y: 0, z: 0 };
    } else if (activeTest === "strength") {
      pullNormal = { x: 0, y: 1, z: 0 };
      grabPtDeformed = { x: 0, y: 0, z: 0 };
    } else if (activeTest === "elongation") {
      pullNormal = { x: 0, y: 1, z: 0 };
      grabPtDeformed = { x: worstGrab.px, y: worstGrab.py + worstGrab.dy * 0.5, z: worstGrab.pz };
    } else {
      const pullMag = Math.sqrt(worstGrab.dx ** 2 + worstGrab.dy ** 2 + worstGrab.dz ** 2);
      pullNormal = pullMag > 0.001
        ? { x: worstGrab.dx / pullMag, y: worstGrab.dy / pullMag, z: worstGrab.dz / pullMag }
        : { x: 0, y: 1, z: 0 };
      grabPtDeformed = {
        x: worstGrab.px + worstGrab.dx,
        y: worstGrab.py + worstGrab.dy,
        z: worstGrab.pz + worstGrab.dz
      };
    }
    const pos = meshRef.current.geometry.attributes.position;
    const snapshot = new Float32Array(pos.array);
    const topGeo = buildTornGeometry(snapshot, geometry, grabPtDeformed, pullNormal, true);
    const botGeo = buildTornGeometry(snapshot, geometry, grabPtDeformed, pullNormal, false);
    setFractureState({ topGeo, botGeo, pullNormal });
  }

  function applyDeform() {
    if (!meshRef.current || !grabsRef.current.length || fractureRef.current) return;
    const maxDisp = computeVertexPositions(grabsRef.current);
    if (maxDisp > fractureThreshold) triggerFracture(grabsRef.current, maxDisp);
  }

  // Playback: replay recorded grabs scaled by playhead
  useEffect(() => {
    if (!playing || !recordedGrabsRef.current.length || !meshRef.current) return;
    if (fractureState) return;
    const t = playhead / 100;
    const scaledGrabs = recordedGrabsRef.current.map((g) => ({
      ...g, dx: g.dx * t, dy: g.dy * t, dz: g.dz * t
    }));
    const maxDisp = computeVertexPositions(scaledGrabs);
    // Trigger fracture at end of playback if original test fractured
    if (t >= 0.97 && maxDispAtFullRef.current > fractureThreshold) {
      triggerFracture(scaledGrabs, maxDisp);
    }
  }, [playing, playhead]);

  function handlePointerDown(e) {
    if (interactMode !== "deform" || fractureRef.current) return;
    if (activeTest === "temperature") return;
    e.stopPropagation();
    onSelect?.();
    if (orbitEnabledRef) orbitEnabledRef.current = false;
    const localPt = meshRef.current.worldToLocal(e.point.clone());
    const sx = e.clientX, sy = e.clientY;
    const fwd = new THREE.Vector3();
    camera.getWorldDirection(fwd);
    const right = new THREE.Vector3().crossVectors(fwd, camera.up).normalize();
    const camUp = camera.up.clone().normalize();
    const grab = { px: localPt.x, py: localPt.y, pz: localPt.z, dx: 0, dy: 0, dz: 0 };
    grabsRef.current.push(grab);
    function onMove(ev) {
      if (fractureRef.current) return;
      const mdx = (ev.clientX - sx) * 0.008;
      const mdy = -(ev.clientY - sy) * 0.008;
      if (activeTest === "strength") {
        // Strength: vertical drag only (pure axial tension/compression)
        grab.dx = 0;
        grab.dy = mdy;
        grab.dz = 0;
      } else {
        // Bending, elongation, default: full 3D free drag
        grab.dx = right.x * mdx + camUp.x * mdy;
        grab.dy = right.y * mdx + camUp.y * mdy;
        grab.dz = right.z * mdx + camUp.z * mdy;
      }
      applyDeform();
    }
    function onUp() {
      // Save grab state for playback
      if (grabsRef.current.length > 0) {
        recordedGrabsRef.current = grabsRef.current.map((g) => ({ ...g }));
        maxDispAtFullRef.current = computeVertexPositions(grabsRef.current);
        // Re-apply to restore visual (computeVertexPositions above already applied)
      }
      if (orbitEnabledRef) orbitEnabledRef.current = interactMode === "orbit";
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  const sc = scale || 1;
  const ts = (activeTest === "strength" || activeTest === "bending" || activeTest === "elongation")
    ? { x: 1, y: 1, z: 1 }
    : (testScale || { x: 1, y: 1, z: 1 });

  return (
    <group scale={[ts.x * sc, ts.y * sc, ts.z * sc]}>
      <mesh
        ref={meshRef}
        geometry={geometry}
        visible={!fractureState}
        onPointerDown={handlePointerDown}
        onPointerEnter={() => {
          if (interactMode === "deform" && !fractureRef.current && activeTest !== "temperature")
            document.body.style.cursor = "crosshair";
        }}
        onPointerLeave={() => { document.body.style.cursor = ""; }}
      >
        <meshStandardMaterial {...matProps} />
      </mesh>
      {fractureState && (
        <>
          <DraggablePiece
            geometry={fractureState.topGeo}
            matProps={matProps}
            initOffsetVec={fractureState.pullNormal}
            offsetScale={0.07}
            camera={camera}
            orbitEnabledRef={orbitEnabledRef}
            interactMode={interactMode}
          />
          <DraggablePiece
            geometry={fractureState.botGeo}
            matProps={matProps}
            initOffsetVec={fractureState.pullNormal}
            offsetScale={-0.07}
            camera={camera}
            orbitEnabledRef={orbitEnabledRef}
            interactMode={interactMode}
          />
        </>
      )}
    </group>
  );
}

function GridFloor() {
  return (
    <group position={[0, -1.28, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[22, 22]} />
        <meshStandardMaterial color="#040C18" roughness={0.96} transparent opacity={0.9} />
      </mesh>
      <gridHelper args={[20, 80, "#0A2E3F", "#061A27"]} />
      <gridHelper args={[20, 20, "#155A7A", "#0B3650"]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, 0]}>
        <ringGeometry args={[4.8, 5.6, 64]} />
        <meshBasicMaterial color="#00D1FF" transparent opacity={0.07} side={THREE.DoubleSide} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
        <circleGeometry args={[0.35, 32]} />
        <meshBasicMaterial color="#57F2FF" transparent opacity={0.22} />
      </mesh>
    </group>
  );
}

function PanelHeader({ title, action }) {
  return (
    <div className="panel-header">
      <h2>{title}</h2>
      {action}
    </div>
  );
}

function SectionTitle({ icon: Icon, title }) {
  return (
    <h3 className="section-title">
      <Icon size={15} />
      {title}
    </h3>
  );
}

function StatusPill({ icon: Icon, label, value, tone = "default" }) {
  return (
    <div className={`status-pill ${tone}`}>
      <Icon size={14} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function IconButton({ title, children, onClick }) {
  return (
    <button className="icon-button" title={title} onClick={onClick}>
      {children}
    </button>
  );
}

function ControlSlider({ label, min, max, step = 1, value, onChange }) {
  return (
    <label className="control-slider">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function Metric({ label, value, tone = "default" }) {
  return (
    <div className={`metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Readout({ label, value }) {
  return (
    <div className="readout">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function MiniChart({ values, color }) {
  const points = values.map((value, index) => `${(index / (values.length - 1)) * 100},${100 - value}`).join(" ");
  return (
    <svg className="mini-chart" viewBox="0 0 100 100" preserveAspectRatio="none">
      <polyline points={points} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" />
      <polygon points={`0,100 ${points} 100,100`} fill={color} opacity="0.12" />
    </svg>
  );
}

function StressStrainChart({ points, UTS, yieldStress, elongation }) {
  const svgPoints = points.map((v, i) => `${(i / (points.length - 1)) * 96 + 2},${96 - v * 0.88}`).join(" ");
  const yieldIdx = points.findIndex((v, i) => i > 0 && points[i] < points[i - 1]);
  const utsIdx = points.indexOf(Math.max(...points));
  const yieldX = yieldIdx > 0 ? (yieldIdx / (points.length - 1)) * 96 + 2 : null;
  const utsX = (utsIdx / (points.length - 1)) * 96 + 2;
  return (
    <div style={{ position: "relative" }}>
      <svg className="mini-chart" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ display: "block" }}>
        <line x1="2" y1="8" x2="2" y2="96" stroke="#2a3a5a" strokeWidth="1" />
        <line x1="2" y1="96" x2="98" y2="96" stroke="#2a3a5a" strokeWidth="1" />
        {yieldX && (
          <line x1={yieldX} y1="10" x2={yieldX} y2="96" stroke="#FFB020" strokeWidth="0.8" strokeDasharray="3,2" opacity="0.65" />
        )}
        <line x1={utsX} y1="10" x2={utsX} y2="96" stroke="#FF5A5A" strokeWidth="0.8" strokeDasharray="3,2" opacity="0.65" />
        <polyline points={svgPoints} fill="none" stroke="#00D1FF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <polygon points={`2,96 ${svgPoints} 98,96`} fill="#00D1FF" opacity="0.10" />
        {yieldX && <text x={yieldX + 1} y="14" fill="#FFB020" fontSize="6" opacity="0.85">항복</text>}
        <text x={utsX + 1} y="14" fill="#FF5A5A" fontSize="6" opacity="0.85">UTS</text>
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 10, color: "#7a8fa8" }}>
        <span>0</span>
        <span style={{ color: "#FFB020" }}>{yieldStress.toFixed(0)} MPa</span>
        <span style={{ color: "#FF5A5A" }}>{UTS.toFixed(0)} MPa</span>
        <span>{elongation.toFixed(1)}%</span>
      </div>
    </div>
  );
}

export default App;
