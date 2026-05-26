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
  elasticityGpa: 144.8,
  thermalConductivity: 78.6,
  meltingPoint: 1487.2,
  predictionConfidence: 94.6,
  latticeStability: 91.4
};

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
  const strengthMpa = 820 + ni * 360 + cr * 420 + ti * 240 - al * 110;
  return {
    composition,
    density: Number((5.8 + densityScale * 2.2).toFixed(2)),
    strengthMpa: Number(strengthMpa.toFixed(1)),
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
  const [logs, setLogs] = useState([
    { time: nowTime(), text: "조성 비율 기반 합금 모델 로드 완료" },
    { time: nowTime(), text: "Python 예측 백엔드 대기 중" }
  ]);
  const [search, setSearch] = useState("");
  const [compareMode, setCompareMode] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(34);
  const [platformStatus, setPlatformStatus] = useState({ available: false, error: "확인 중" });
  const [predictionUrl, setPredictionUrl] = useState("");
  const [process, setProcess] = useState({
    "Solution_treatment_temperature": 1050,
    "Solution_treatment_time(s)": 3600,
    "Temperature (K)": 293
  });
  const didInitialPrediction = useRef(false);

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
      setPlayhead((value) => (value >= 100 ? 0 : value + 1.2));
    }, 120);
    return () => window.clearInterval(timer);
  }, [playing]);

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
    }
  }

  async function runSimulation(testId = activeTest) {
    setActiveTest(testId);
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
      setPlayhead(12);
      setPlaying(true);
      addLog(`${result.testLabel} 실행: 응력 ${result.result.maxStressMpa} MPa, 변형률 ${result.result.strainPercent}%`);
    } catch {
      const predicted = await predictAlloy();
      const result = {
        testType: testId,
        testLabel: TESTS.find((test) => test.id === testId)?.label ?? "물성 테스트",
        prediction: predicted,
        result: {
          maxStressMpa: predicted.strengthMpa,
          strainPercent: 3.8,
          temperatureC: 720,
          deformationMm: 7.4,
          safetyIndex: 82.2,
          thermalGradient: 128,
          failureRisk: "낮음"
        },
        timelineEvents: []
      };
      setSimulation(result);
      addLog(`${result.testLabel} 로컬 시뮬레이션 완료`);
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
            <ControlSlider label={`밀도 계수 ${densityScale.toFixed(2)}`} min={0.1} max={1} step={0.01} value={densityScale} onChange={setDensityScale} />
            <ControlSlider label={`모델 스케일 ${(selectedAlloy?.scale ?? 1).toFixed(2)}x`} min={0.55} max={1.8} step={0.01} value={selectedAlloy?.scale ?? 1} onChange={updateScale} />
            <div className="composition-actions">
              <button className="command primary" onClick={() => predictAlloy()}><WandSparkles size={15} />AI 예측 실행</button>
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
              ["lattice", "원자 격자"]
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
          </div>

          <div className="test-strip">
            {TESTS.map((test) => {
              const Icon = test.icon;
              return (
                <button key={test.id} className={`test-button ${activeTest === test.id ? "selected" : ""}`} onClick={() => runSimulation(test.id)}>
                  <Icon size={17} />
                  {test.label} 테스트
                </button>
              );
            })}
          </div>
        </section>

        <aside className="right-panel panel">
          <PanelHeader title="AI 예측 결과" action={
            <div style={{ display: "flex", gap: "6px" }}>
              <button className="command" onClick={handleReset}><RotateCcw size={15} />초기화</button>
              <button className="command" onClick={() => runSimulation(activeTest)}><Play size={15} />시뮬레이션 시작</button>
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
            <MiniChart values={[22, 35, 54, 62, 74, simulation?.result.temperatureC ? 90 : 68]} color="#FFB020" />
          </section>
          <section className="analytics-card">
            <SectionTitle icon={Activity} title="응력-변형률 그래프" />
            <MiniChart values={[12, 24, 31, 42, simulation?.result.strainPercent ? 64 : 52, 78]} color="#00D1FF" />
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

function AlloyScene({ alloys, selectedId, mode, activeTest, prediction, simulation, shape, interactMode, orbitEnabledRef, onSelectId, resetKey }) {
  return (
    <group>
      <CameraControls orbitEnabledRef={orbitEnabledRef} resetKey={resetKey} />
      <GridFloor />
      <axesHelper args={[3.5]} position={[-5, -1.28, -5]} />
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

function AlloyModel({ alloy, selected, mode, activeTest, prediction, simulation, offset, shape, interactMode, orbitEnabledRef, onSelect, resetKey }) {
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
  const color = activeTest === "temperature" ? "#FF8844" : stressedColor ?? modeColor;
  const emissive = selected ? color : "#0B1020";
  const opacity = mode === "xray" ? 0.38 : 0.82;
  const matProps = {
    color, emissive,
    emissiveIntensity: selected ? 0.65 : (activeTest === "temperature" ? 0.48 : 0.24),
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
  const tx = testScale.x * deform.x * sc;
  const ty = testScale.y * deform.y * sc;
  const tz = testScale.z * deform.z * sc;
  const gap = Math.max(0, maxDeform - fractureDeform) * 1.6 + (fractured ? 0.28 : 0);

  if (fractured) {
    return (
      <group position={[offset, 0.1, 0]} rotation={[0, 0, testRotZ]}>
        <FracturedMesh shape={shape} sx={tx} sy={ty} sz={tz} matProps={matProps} gap={gap} mode={mode} />
        <FractureGlow />
      </group>
    );
  }

  return (
    <group ref={group} position={[offset, 0.1, 0]} rotation={[0, 0, testRotZ]}>
      {shape === "lattice" ? (
        <group scale={[tx, ty, tz]} onPointerDown={handlePointerDown}>
          {points.map(([x, y, z]) => (
            <mesh key={`${x}-${y}-${z}`} position={[x, y, z]}>
              <sphereGeometry args={[0.085, 18, 18]} />
              <meshStandardMaterial {...matProps} />
            </mesh>
          ))}
          <mesh>
            <boxGeometry args={[1.95, 1.95, 1.95]} />
            <meshStandardMaterial color="#57F2FF" transparent opacity={mode === "xray" ? 0.12 : 0.045} wireframe={mode === "wireframe"} />
          </mesh>
        </group>
      ) : shape === "sphere" ? (
        <mesh scale={[tx, ty, tz]} onPointerDown={handlePointerDown}>
          <sphereGeometry args={[1.05, 64, 64]} />
          <meshStandardMaterial {...matProps} />
        </mesh>
      ) : shape === "cube" ? (
        <mesh scale={[tx, ty, tz]} onPointerDown={handlePointerDown}>
          <boxGeometry args={[1.8, 1.8, 1.8]} />
          <meshStandardMaterial {...matProps} />
        </mesh>
      ) : (
        <mesh scale={[tx, ty, tz]} onPointerDown={handlePointerDown}>
          <boxGeometry args={[2.4, 1.2, 1.6]} />
          <meshStandardMaterial {...matProps} />
        </mesh>
      )}
      <CrackLines active={stressRatio > 0.6 || activeTest === "strength"} />
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

function GridFloor() {
  return (
    <group position={[0, -1.28, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <gridHelper args={[12, 24, "#1F607A", "#143047"]} />
      <mesh>
        <planeGeometry args={[12, 12]} />
        <meshBasicMaterial color="#07101C" transparent opacity={0.32} side={THREE.DoubleSide} />
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

export default App;
