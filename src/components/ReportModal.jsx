import React, { useCallback, useEffect, useRef, useState } from "react";
import { predictPhases, classifyFracture, estimateHardness, estimateKIC } from "../lib/physics.js";

// ── Mini stress-strain SVG for the report ──────────────────────────────────
function ReportSSChart({ points, UTS, YS, elongPct }) {
  if (!points || points.length < 2) return null;
  const W = 320, H = 160;
  const padL = 42, padB = 28, padR = 10, padT = 14;
  const w = W - padL - padR, h = H - padB - padT;

  const maxStrain = elongPct || 20;
  const pts = points.map((p, i) => {
    const x = padL + (p.strainPct / maxStrain) * w;
    const y = padT + h - (p.stressMpa / UTS) * h;
    return `${x},${y}`;
  }).join(" ");

  const yieldX = padL + ((YS / UTS) * (YS / (points[points.length-1]?.stressMpa || UTS)) * w);

  return (
    <svg width={W} height={H} style={{ fontFamily: "monospace", fontSize: 9 }}>
      {/* Grid */}
      {[0, 0.25, 0.5, 0.75, 1].map(v => (
        <g key={v}>
          <line x1={padL} y1={padT + h * (1-v)} x2={W - padR} y2={padT + h * (1-v)}
            stroke="#e0ddd8" strokeWidth="0.5" />
          <text x={padL - 4} y={padT + h * (1-v) + 3} textAnchor="end" fill="#888" fontSize={8}>
            {Math.round(UTS * v)}
          </text>
        </g>
      ))}
      {/* Strain axis labels */}
      {[0, 0.5, 1].map(v => (
        <text key={v} x={padL + w * v} y={H - 6} textAnchor="middle" fill="#888" fontSize={8}>
          {(maxStrain * v).toFixed(0)}%
        </text>
      ))}
      {/* Axis labels */}
      <text x={10} y={H / 2} textAnchor="middle" fill="#555" fontSize={9}
        transform={`rotate(-90, 10, ${H / 2})`}>응력 (MPa)</text>
      <text x={W / 2} y={H - 1} textAnchor="middle" fill="#555" fontSize={9}>변형률 (%)</text>
      {/* Yield line */}
      <line x1={yieldX} y1={padT} x2={yieldX} y2={padT + h}
        stroke="#b45309" strokeWidth={1} strokeDasharray="4,3" opacity={0.7} />
      <text x={yieldX + 2} y={padT + 10} fill="#b45309" fontSize={8}>항복점</text>
      {/* UTS line */}
      <line x1={padL + w * 0.785} y1={padT} x2={padL + w * 0.785} y2={padT + h}
        stroke="#c0392b" strokeWidth={1} strokeDasharray="4,3" opacity={0.7} />
      <text x={padL + w * 0.787} y={padT + 10} fill="#c0392b" fontSize={8}>UTS</text>
      {/* Curve fill */}
      <polygon
        points={`${padL},${padT + h} ${pts} ${padL + (elongPct / maxStrain) * w},${padT + h}`}
        fill="#1a5fa8" opacity={0.08}
      />
      {/* Curve line */}
      <polyline points={pts} fill="none" stroke="#1a5fa8" strokeWidth={2}
        strokeLinecap="round" strokeLinejoin="round" />
      {/* Axes */}
      <line x1={padL} y1={padT} x2={padL} y2={padT + h} stroke="#ccc" strokeWidth={1} />
      <line x1={padL} y1={padT + h} x2={W - padR} y2={padT + h} stroke="#ccc" strokeWidth={1} />
    </svg>
  );
}

// ── Fatigue S-N Chart ────────────────────────────────────────────────────────
function ReportSNChart({ snCurve, Se }) {
  if (!snCurve || snCurve.length < 2) return null;
  const W = 280, H = 130;
  const padL = 40, padB = 24, padR = 10, padT = 10;
  const w = W - padL - padR, h = H - padB - padT;
  const maxS = Math.max(...snCurve.map(p => p.S)) * 1.05;
  const pts = snCurve.map(p => {
    const x = padL + ((p.logN - 1) / 7) * w;
    const y = padT + h - (p.S / maxS) * h;
    return `${x},${y}`;
  }).join(" ");
  const seY = padT + h - (Se / maxS) * h;
  return (
    <svg width={W} height={H} style={{ fontFamily: "monospace", fontSize: 8 }}>
      <line x1={padL} y1={seY} x2={W - padR} y2={seY}
        stroke="#217a3c" strokeWidth={1} strokeDasharray="3,2" opacity={0.8} />
      <text x={padL + 2} y={seY - 2} fill="#217a3c" fontSize={7.5}>내구한도 {Se?.toFixed(0)} MPa</text>
      <polyline points={pts} fill="none" stroke="#c0392b" strokeWidth={2}
        strokeLinecap="round" strokeLinejoin="round" />
      {[1,3,5,7].map(v => (
        <g key={v}>
          <line x1={padL + (v/7)*w} y1={padT} x2={padL + (v/7)*w} y2={padT+h}
            stroke="#eee" strokeWidth={0.5} />
          <text x={padL + (v/7)*w} y={H-6} textAnchor="middle" fill="#888" fontSize={7}>
            10{String(v+1).split("").map(d => "⁰¹²³⁴⁵⁶⁷⁸⁹"[d]).join("")}
          </text>
        </g>
      ))}
      {[0, 0.5, 1].map(v => (
        <text key={v} x={padL-2} y={padT + h*(1-v)+3} textAnchor="end" fill="#888" fontSize={7}>
          {Math.round(maxS * v)}
        </text>
      ))}
      <line x1={padL} y1={padT} x2={padL} y2={padT+h} stroke="#ccc" strokeWidth={1} />
      <line x1={padL} y1={padT+h} x2={W-padR} y2={padT+h} stroke="#ccc" strokeWidth={1} />
      <text x={W/2} y={H-1} textAnchor="middle" fill="#555" fontSize={8}>반복 횟수 (cycles)</text>
    </svg>
  );
}

// ── Microstructure Phase Bar ─────────────────────────────────────────────────
function PhaseBar({ phases }) {
  const colors = { austenite: "#1a5fa8", ferrite: "#217a3c", martensite: "#c0392b", bainite: "#b45309" };
  const labels = { austenite: "오스테나이트", ferrite: "페라이트", martensite: "마르텐사이트", bainite: "베이나이트" };
  return (
    <div>
      <div style={{ display: "flex", height: 14, borderRadius: 3, overflow: "hidden", marginBottom: 4 }}>
        {Object.entries(phases).filter(([k]) => colors[k] && phases[k] > 0).map(([k, v]) => (
          <div key={k} style={{ width: `${v}%`, background: colors[k] }} title={`${labels[k]}: ${v}%`} />
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px" }}>
        {Object.entries(phases).filter(([k]) => colors[k]).map(([k, v]) => (
          <span key={k} style={{ fontSize: 10, color: "#444", display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: colors[k], display: "inline-block" }} />
            {labels[k]}: <strong>{v}%</strong>
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Main Report Modal ─────────────────────────────────────────────────────────
export default function ReportModal({
  alloyName, composition, normalizedComposition, prediction,
  simulation, deformStats, activeTest, processParams,
  imageUrl, stressStrainPoints, onClose
}) {
  const printAreaRef = useRef(null);

  // Derived values
  const UTS  = prediction?.strengthMpa ?? 800;
  const YS   = prediction?.yieldStressMpa ?? UTS * 0.70;
  const E    = prediction?.elasticityGpa ?? 200;
  const elong = prediction?.elongationPercent ?? 15;
  const area  = prediction?.areaReductionPercent ?? 30;

  const phases    = predictPhases(composition ?? {});
  const fracture  = classifyFracture(elong, area);
  const hardness  = estimateHardness(UTS);
  const KIC       = estimateKIC(UTS, elong);

  // ── 파생 파라미터 ──
  const density = prediction?.density ?? 7.8;
  const solTemp = processParams?.["Solution_treatment_temperature"] ?? 1100;
  const solTime = processParams?.["Solution_treatment_time(s)"] ?? 3600;
  const testTempC = ((processParams?.["Temperature (K)"] ?? 293) - 273);
  const R = 8.314;
  const compVals = Object.values(composition ?? {});
  const total = compVals.reduce((s, v) => s + Number(v), 0) || 1;
  const Smix = -R * compVals.reduce((s, v) => {
    const x = Number(v) / total;
    return x > 0 ? s + x * Math.log(x) : s;
  }, 0);
  const compNorm = Object.fromEntries(
    Object.entries(composition ?? {}).map(([k, v]) => [k, Number(v) / total])
  );
  const dominant = Object.entries(compNorm).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Fe";
  const alloyClass =
    dominant === "Ni" ? "니켈기 초합금" :
    dominant === "Ti" ? "타이타늄 합금" :
    dominant === "Fe" ? "철강 합금" :
    dominant === "Co" ? "코발트기 합금" :
    dominant === "Al" ? "알루미늄 합금" :
    `${dominant}기 합금`;
  const ELEMENT_ROLES = {
    Ni: "오스테나이트 안정화, 인성·내식성 향상",
    Cr: "내산화·내식성, 석출 강화",
    Ti: "석출 강화 (TiN/TiC), 결정립 미세화",
    Mo: "고용 강화, 크리프 내성",
    Al: "석출 강화 (Ni₃Al), 산화 보호막",
    Co: "고온 강도 향상",
    Fe: "기지 원소",
    Nb: "석출 강화, 결정립 고정",
    W:  "고용 강화, 크리프 저항",
    V:  "석출 강화, 결정립 미세화",
    C:  "고온 강도 (과다 시 취성 주의)",
    Cu: "석출 강화 (시효), 내식성",
    Mn: "오스테나이트 안정화, 탈산·탈황",
    Si: "산화 저항, 고용 강화",
    N:  "고용 강화, 내식성 향상",
    Zr: "결정립 고정, 산화막 안정화",
    Ta: "고온 강도, 석출 강화",
  };
  const maxBendStress = simulation?.result?.maxStressMpa ?? UTS * 0.85;
  const safetyFactor = simulation?.result?.safetyIndex ?? (YS / maxBendStress);


  const testName = {
    strength: "인장 강도 시험 (ASTM E8)",
    bending: "3점 굽힘 시험 (ASTM E290)",
    elongation: "연신율 시험",
    temperature: "고온 특성 시험 (ASTM E21)"
  }[activeTest] ?? "인장 시험";

  const today = new Date().toLocaleString("ko-KR", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false
  });

  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  const handlePrint = useCallback(async () => {
    // Electron desktop: use printToPDF → save dialog
    if (window.desktopApi?.savePDF) {
      setSaving(true);
      setSaveMsg("");
      try {
        const result = await window.desktopApi.savePDF();
        if (result?.success) {
          setSaveMsg(`저장 완료: ${result.filePath?.split(/[\\/]/).pop() ?? "파일"}`);
        } else if (!result?.canceled) {
          setSaveMsg("저장 실패");
        }
      } catch (e) {
        setSaveMsg("저장 오류: " + (e?.message ?? "unknown"));
      } finally {
        setSaving(false);
      }
    } else {
      // 브라우저 fallback
      window.print();
    }
  }, []);

  // ESC to close
  useEffect(() => {
    const fn = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [onClose]);

  const comp = normalizedComposition ?? composition ?? {};
  const maxStrain = deformStats?.maxStrain ?? 0;

  const tbl = { width: "100%", borderCollapse: "collapse", fontSize: 11, marginTop: 6 };
  const th  = { background: "#f0f0f0", padding: "4px 8px", borderBottom: "1px solid #ddd",
                fontWeight: 600, textAlign: "left", fontSize: 11 };
  const td  = { padding: "4px 8px", borderBottom: "1px solid #ececec", fontSize: 11 };
  const tdR = { ...td, textAlign: "right", fontFamily: "monospace" };
  const sec = { marginBottom: 18 };
  const h2s = { fontSize: 13, fontWeight: 700, color: "#1a5fa8", borderBottom: "2px solid #1a5fa8",
                paddingBottom: 4, marginBottom: 10, marginTop: 0 };

  return (
    <>
      {/* ── Backdrop ── */}
      <div
        className="report-backdrop"
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
          zIndex: 2000, display: "flex", alignItems: "flex-start",
          justifyContent: "center", overflowY: "auto", padding: "24px 16px"
        }}
      >
        {/* ── Modal Box ── */}
        <div
          className="report-modal"
          onClick={e => e.stopPropagation()}
          style={{
            background: "#fff", borderRadius: 6, width: 820,
            maxWidth: "100%", boxShadow: "0 8px 40px rgba(0,0,0,0.25)",
            fontFamily: "'IBM Plex Sans','Noto Sans KR',sans-serif",
            color: "#1e1e1e"
          }}
        >
          {/* ── Toolbar ── */}
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "12px 20px", background: "#1a5fa8", borderRadius: "6px 6px 0 0"
          }}>
            <span style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>
              ⚗ 재료 시험 보고서
            </span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {saveMsg && (
                <span style={{ fontSize: 11, color: saveMsg.includes("완료") ? "#afffb5" : "#ffb3b3" }}>
                  {saveMsg}
                </span>
              )}
              <button
                onClick={handlePrint}
                disabled={saving}
                style={{
                  background: "#fff", color: "#1a5fa8", border: "none",
                  borderRadius: 4, padding: "5px 14px", fontWeight: 700,
                  fontSize: 12, cursor: saving ? "not-allowed" : "pointer",
                  opacity: saving ? 0.7 : 1
                }}
              >
                {saving ? "저장 중..." : "💾 PDF 저장"}
              </button>
              <button
                onClick={onClose}
                style={{
                  background: "rgba(255,255,255,0.2)", color: "#fff",
                  border: "1px solid rgba(255,255,255,0.4)",
                  borderRadius: 4, padding: "5px 10px", cursor: "pointer", fontSize: 12
                }}
              >
                ✕ 닫기
              </button>
            </div>
          </div>

          {/* ── Print Area ── */}
          <div
            ref={printAreaRef}
            className="report-print-area"
            style={{ padding: "24px 28px" }}
          >
            {/* Header */}
            <div style={{ textAlign: "center", marginBottom: 18, borderBottom: "1px solid #ddd", paddingBottom: 14 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#1a5fa8", letterSpacing: -0.5 }}>
                합금 디지털 트윈 — 재료 시험 보고서
              </div>
              <div style={{ fontSize: 12, color: "#555", marginTop: 4 }}>
                합금: <strong>{alloyName ?? "—"}</strong> &nbsp;·&nbsp; 시험: <strong>{testName}</strong>
                &nbsp;·&nbsp; 발행일: {today}
              </div>
            </div>

            {/* ── 1. 합금 조성 ── */}
            <section style={sec}>
              <h2 style={h2s}>1. 합금 조성 및 원소 역할 분석</h2>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <table style={tbl}>
                    <thead><tr>
                      <th style={th}>원소</th>
                      <th style={{ ...th, textAlign: "right" }}>정규화 (%)</th>
                      <th style={th}>주요 역할</th>
                    </tr></thead>
                    <tbody>
                      {Object.entries(composition ?? {}).map(([el, v]) => (
                        <tr key={el}>
                          <td style={{ ...td, fontWeight: 700 }}>{el}</td>
                          <td style={tdR}>{Number(comp[el] ?? v).toFixed(1)}%</td>
                          <td style={{ ...td, fontSize: 10, color: "#555" }}>{ELEMENT_ROLES[el] ?? "합금 기지 원소"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div>
                  <table style={tbl}>
                    <tbody>
                      <tr><td style={td}>합금 클래스</td><td style={{ ...tdR, color: "#1a5fa8", fontWeight: 700 }}>{alloyClass}</td></tr>
                      <tr><td style={td}>혼합 엔트로피 ΔSmix</td><td style={tdR}>{Smix.toFixed(2)} J/mol·K</td></tr>
                      <tr><td style={td}>고엔트로피 여부</td><td style={tdR}>{Smix > 11 ? "고엔트로피 합금 (HEA)" : Smix > 8 ? "중엔트로피 합금" : "저엔트로피 (통상 합금)"}</td></tr>
                      <tr><td style={td}>Cr 당량 (Cr_eq)</td><td style={tdR}>{phases.Cr_eq}</td></tr>
                      <tr><td style={td}>Ni 당량 (Ni_eq)</td><td style={tdR}>{phases.Ni_eq}</td></tr>
                    </tbody>
                  </table>
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 11, marginBottom: 6, color: "#555", fontWeight: 600 }}>예측 미세조직 상 분율</div>
                    <PhaseBar phases={phases} />
                    <div style={{ fontSize: 10, color: "#888", marginTop: 6, lineHeight: 1.5 }}>
                      Schaeffler 다이어그램 기반 추정값. 실제 상 분율은 냉각 속도·시효 조건에 따라 달라질 수 있습니다.
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* ── 2. 공정 조건 ── */}
            <section style={sec}>
              <h2 style={h2s}>2. 공정 조건</h2>
              <table style={{ ...tbl, width: "60%" }}>
                <thead><tr>
                  <th style={th}>항목</th>
                  <th style={{ ...th, textAlign: "right" }}>값</th>
                  <th style={th}>의미</th>
                </tr></thead>
                <tbody>
                  <tr>
                    <td style={td}>고용화 처리 온도</td>
                    <td style={tdR}>{solTemp} °C</td>
                    <td style={{ ...td, fontSize: 10, color: "#666" }}>합금 원소를 고르게 녹여내기 위해 가열하는 온도</td>
                  </tr>
                  <tr>
                    <td style={td}>고용화 처리 시간</td>
                    <td style={tdR}>{(solTime/3600).toFixed(1)} h</td>
                    <td style={{ ...td, fontSize: 10, color: "#666" }}>균질화에 필요한 유지 시간 — 길수록 석출물 재용해 완전</td>
                  </tr>
                  <tr>
                    <td style={td}>시험 온도</td>
                    <td style={tdR}>{testTempC.toFixed(0)} °C</td>
                    <td style={{ ...td, fontSize: 10, color: "#666" }}>시험이 진행되는 환경 온도 (고온일수록 강도 저하)</td>
                  </tr>
                </tbody>
              </table>
            </section>

            {/* ── 3. 예측 물성값 ── */}
            <section style={sec}>
              <h2 style={h2s}>3. 예측 물성값</h2>
              <table style={tbl}>
                <thead><tr>
                  <th style={th}>특성</th>
                  <th style={{ ...th, textAlign: "right" }}>값</th>
                  <th style={th}>의미</th>
                </tr></thead>
                <tbody>
                  <tr>
                    <td style={{ ...td, fontWeight: 700 }}>인장강도 (UTS)</td>
                    <td style={{ ...tdR, fontWeight: 700, color: "#1a5fa8" }}>{UTS.toFixed(1)} MPa</td>
                    <td style={{ ...td, fontSize: 10, color: "#555" }}>재료가 끊어지기 직전까지 버틸 수 있는 최대 응력. 높을수록 강한 재료</td>
                  </tr>
                  <tr>
                    <td style={td}>항복응력 (YS)</td>
                    <td style={tdR}>{YS.toFixed(1)} MPa</td>
                    <td style={{ ...td, fontSize: 10, color: "#555" }}>영구적인 변형이 시작되는 응력. 이 값을 초과하면 원래 모양으로 돌아오지 않음</td>
                  </tr>
                  <tr>
                    <td style={td}>탄성 계수 (Young's modulus)</td>
                    <td style={tdR}>{E.toFixed(1)} GPa</td>
                    <td style={{ ...td, fontSize: 10, color: "#555" }}>힘을 가했을 때 재료가 얼마나 뻣뻣한지를 나타냄. 높을수록 변형이 적음</td>
                  </tr>
                  <tr>
                    <td style={td}>연신율 (Elongation)</td>
                    <td style={tdR}>{elong?.toFixed(1) ?? "—"} %</td>
                    <td style={{ ...td, fontSize: 10, color: "#555" }}>파단까지 늘어나는 비율. 높을수록 잘 늘어나는 연성 재료</td>
                  </tr>
                  <tr>
                    <td style={td}>단면 감소율 (RA)</td>
                    <td style={tdR}>{area?.toFixed(1) ?? "—"} %</td>
                    <td style={{ ...td, fontSize: 10, color: "#555" }}>파단 후 단면적이 줄어든 비율. 높을수록 연성이 좋고 에너지 흡수 능력이 큼</td>
                  </tr>
                  <tr>
                    <td style={td}>경도 (HV / HB / HRC)</td>
                    <td style={tdR}>{hardness.HV} / {hardness.HB} / {hardness.HRC}</td>
                    <td style={{ ...td, fontSize: 10, color: "#555" }}>표면이 긁힘에 얼마나 저항하는지. 강도와 비례하는 경향</td>
                  </tr>
                  <tr>
                    <td style={td}>파괴인성 (KIC)</td>
                    <td style={tdR}>{KIC} MPa·√m</td>
                    <td style={{ ...td, fontSize: 10, color: "#555" }}>균열이 있어도 버티는 능력. 낮으면 작은 결함에도 갑자기 파단될 수 있음</td>
                  </tr>
                  <tr>
                    <td style={td}>밀도</td>
                    <td style={tdR}>{density.toFixed(2)} g/cm³</td>
                    <td style={{ ...td, fontSize: 10, color: "#555" }}>단위 부피당 질량. 낮을수록 가벼운 재료 (Al: ~2.7, Ti: ~4.5, Fe: ~7.9)</td>
                  </tr>
                  <tr>
                    <td style={td}>용융점</td>
                    <td style={tdR}>{prediction?.meltingPoint?.toFixed(0) ?? "—"} °C</td>
                    <td style={{ ...td, fontSize: 10, color: "#555" }}>재료가 녹기 시작하는 온도. 내열 용도에서는 이 값이 높을수록 유리</td>
                  </tr>
                  <tr>
                    <td style={td}>열전도율</td>
                    <td style={tdR}>{prediction?.thermalConductivity?.toFixed(1) ?? "—"} W/m·K</td>
                    <td style={{ ...td, fontSize: 10, color: "#555" }}>열이 얼마나 잘 전달되는지. 방열 부품은 높아야, 단열 부품은 낮아야 유리</td>
                  </tr>
                </tbody>
              </table>
            </section>

            {/* ── 4. 응력-변형률 곡선 ── */}
            <section style={sec}>
              <h2 style={h2s}>4. 응력-변형률 곡선</h2>
              <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
                <ReportSSChart points={stressStrainPoints} UTS={UTS} YS={YS} elongPct={elong} />
                <div style={{ fontSize: 11, color: "#555", lineHeight: 1.9, maxWidth: 300 }}>
                  <div style={{ fontWeight: 700, color: "#333", marginBottom: 6 }}>그래프 읽는 법</div>
                  <div>· <strong>가로축 (변형률)</strong>: 원래 길이 대비 늘어난 비율 (%)</div>
                  <div>· <strong>세로축 (응력)</strong>: 단위 면적당 작용하는 힘 (MPa)</div>
                  <div style={{ marginTop: 6 }}>
                    · <span style={{ color: "#b45309", fontWeight: 600 }}>주황 점선 (항복점)</span>: 여기서부터 영구 변형 시작 → {YS.toFixed(0)} MPa
                  </div>
                  <div>· <span style={{ color: "#c0392b", fontWeight: 600 }}>빨간 점선 (UTS)</span>: 재료가 버틸 수 있는 최대 응력 → {UTS.toFixed(0)} MPa</div>
                  <div style={{ marginTop: 6 }}>· <strong>곡선 아래 면적</strong>: 재료가 흡수할 수 있는 에너지의 크기 (넓을수록 인성이 높음)</div>
                  <div style={{ marginTop: 6 }}>· <strong>초기 기울기</strong>: 탄성 계수 E = {E.toFixed(0)} GPa (가파를수록 뻣뻣한 재료)</div>
                </div>
              </div>
            </section>

            {/* ── 5. 3D 시뮬레이션 이미지 ── */}
            <section style={sec}>
              <h2 style={h2s}>5. 3D 시뮬레이션 스냅샷</h2>
              {imageUrl ? (
                <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                  <img
                    src={imageUrl}
                    alt="3D Simulation"
                    style={{ width: 340, borderRadius: 4, border: "1px solid #ddd" }}
                  />
                  <div style={{ fontSize: 11, color: "#555", lineHeight: 1.8 }}>
                    <div><strong>시험 종류:</strong> {testName}</div>
                    <div><strong>최대 변형률:</strong> {maxStrain.toFixed(1)}%</div>
                    <div><strong>재료 상태:</strong> {maxStrain < 2 ? "탄성" : maxStrain < 8 ? "소성 변형" : "파단"}</div>
                    {simulation?.result && <>
                      <div><strong>최대 응력:</strong> {simulation.result.maxStressMpa?.toFixed(0)} MPa</div>
                      <div><strong>파손 위험:</strong> {simulation.result.failureRisk}</div>
                      <div><strong>안전 지수:</strong> {simulation.result.safetyIndex?.toFixed(1)}</div>
                    </>}
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 11, color: "#999", padding: 16, background: "#f8f8f8",
                  borderRadius: 4, textAlign: "center" }}>
                  시뮬레이션 실행 후 보고서를 다시 생성하면 이미지가 포함됩니다.
                </div>
              )}
            </section>

            {/* ── 6. Von Mises 응력장 ── */}
            <section style={sec}>
              <h2 style={h2s}>6. Von Mises 응력 분석</h2>
              <table style={tbl}>
                <thead><tr>
                  <th style={th}>항목</th>
                  <th style={{ ...th, textAlign: "right" }}>값</th>
                  <th style={th}>의미</th>
                </tr></thead>
                <tbody>
                  <tr>
                    <td style={td}>최대 Von Mises 응력</td>
                    <td style={tdR}>{(simulation?.result?.maxStressMpa ?? UTS).toFixed(0)} MPa</td>
                    <td style={{ ...td, fontSize: 10, color: "#555" }}>시편 내부에서 가장 큰 응력이 걸리는 지점의 등가 응력값 — 3D 응력 상태를 하나의 숫자로 표현</td>
                  </tr>
                  <tr>
                    <td style={td}>항복 응력 (YS)</td>
                    <td style={tdR}>{YS.toFixed(0)} MPa</td>
                    <td style={{ ...td, fontSize: 10, color: "#555" }}>Von Mises 응력이 이 값을 넘으면 재료가 영구 변형됨</td>
                  </tr>
                  <tr>
                    <td style={td}>안전계수 (SF)</td>
                    <td style={{ ...tdR, fontWeight: 700, color: safetyFactor >= 1.5 ? "#217a3c" : safetyFactor >= 1.0 ? "#b45309" : "#c0392b" }}>
                      {typeof safetyFactor === "number" ? safetyFactor.toFixed(2) : "—"} {safetyFactor < 1.0 ? "⚠ 항복 초과" : safetyFactor < 1.5 ? "(주의)" : "(안전)"}
                    </td>
                    <td style={{ ...td, fontSize: 10, color: "#555" }}>항복응력 ÷ 최대응력. 1.0 미만이면 이미 소성 변형 중, 1.5 이상이면 안전한 설계</td>
                  </tr>
                  <tr>
                    <td style={td}>컬러맵 색상 의미</td>
                    <td style={{ ...td, textAlign: "right" }}>
                      <span style={{ color: "#0000ff" }}>■</span> → <span style={{ color: "#00bb44" }}>■</span> → <span style={{ color: "#ff0000" }}>■</span>
                    </td>
                    <td style={{ ...td, fontSize: 10, color: "#555" }}>파란색: 응력 낮음 (안전) / 초록색: 중간 / 빨간색: 응력 높음 (위험)</td>
                  </tr>
                  <tr>
                    <td style={td}>시험 방식에 따른 분포</td>
                    <td style={{ ...td, textAlign: "right", fontSize: 10 }}>{activeTest === "bending" ? "굽힘" : "인장"}</td>
                    <td style={{ ...td, fontSize: 10, color: "#555" }}>
                      {activeTest === "bending"
                        ? "굽힘 시험: 위아래 표면에서 응력 최대, 중앙 중립면에서 0 — 표면 결함이 파단을 지배함"
                        : "인장 시험: 게이지 중앙에서 응력 집중, 넥킹 시 단면 급감으로 응력 급등"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </section>

            {/* ── 7. 파단 분석 ── */}
            <section style={sec}>
              <h2 style={h2s}>7. 파단 분석</h2>
              <table style={tbl}>
                <thead><tr>
                  <th style={th}>항목</th>
                  <th style={{ ...th, textAlign: "right" }}>값</th>
                  <th style={th}>의미</th>
                </tr></thead>
                <tbody>
                  <tr>
                    <td style={td}>파단 유형</td>
                    <td style={{ ...tdR, fontWeight: 700, color: fracture.type === "brittle" ? "#c0392b" : "#217a3c" }}>{fracture.korean}</td>
                    <td style={{ ...td, fontSize: 10, color: "#555" }}>
                      {fracture.type === "ductile" ? "끊어지기 전에 눈에 띄게 늘어남 — 사전 경고가 있어 비교적 안전한 파단" :
                       fracture.type === "brittle" ? "거의 변형 없이 갑자기 파단 — 위험한 파단 방식, 충격에 취약" :
                       "연성과 취성이 혼합된 중간 형태"}
                    </td>
                  </tr>
                  <tr>
                    <td style={td}>파면 형상</td>
                    <td style={tdR}>{fracture.morphology}</td>
                    <td style={{ ...td, fontSize: 10, color: "#555" }}>
                      {fracture.type === "ductile" ? "컵-앤드-콘 (cup-and-cone): 중앙 섬유상 + 가장자리 45° 전단면" :
                       "평탄하고 결정면을 따라 쪼개지는 벽개면 (cleavage)"}
                    </td>
                  </tr>
                  <tr>
                    <td style={td}>파단 각도</td>
                    <td style={tdR}>{fracture.angle}°</td>
                    <td style={{ ...td, fontSize: 10, color: "#555" }}>최대 전단응력 방향. 45°에 가까울수록 전단에 의한 연성 파단, 90°면 취성 파단</td>
                  </tr>
                  <tr>
                    <td style={td}>파괴인성 (KIC)</td>
                    <td style={tdR}>{KIC} MPa·√m</td>
                    <td style={{ ...td, fontSize: 10, color: "#555" }}>균열이 있을 때 버티는 능력. 낮으면 작은 균열도 갑자기 성장해 파단 유발</td>
                  </tr>
                </tbody>
              </table>
            </section>

            {/* ── 8. 신뢰도 및 모델 정보 ── */}
            <section style={{ ...sec, marginBottom: 0 }}>
              <h2 style={h2s}>8. 예측 신뢰도</h2>
              <table style={{ ...tbl, width: "70%" }}>
                <thead><tr>
                  <th style={th}>항목</th>
                  <th style={{ ...th, textAlign: "right" }}>값</th>
                  <th style={th}>의미</th>
                </tr></thead>
                <tbody>
                  <tr>
                    <td style={td}>예측 신뢰도</td>
                    <td style={{ ...tdR, fontWeight: 700, color: (prediction?.predictionConfidence ?? 0) > 90 ? "#217a3c" : "#b45309" }}>
                      {prediction?.predictionConfidence?.toFixed(1) ?? "—"} %
                    </td>
                    <td style={{ ...td, fontSize: 10, color: "#555" }}>예측 모델이 이 조성을 얼마나 잘 학습했는지. 90% 이상이면 신뢰도 높음</td>
                  </tr>
                  <tr>
                    <td style={td}>격자 안정성</td>
                    <td style={tdR}>{prediction?.latticeStability?.toFixed(1) ?? "—"} %</td>
                    <td style={{ ...td, fontSize: 10, color: "#555" }}>결정 구조가 얼마나 안정적으로 유지될지 예측. 낮으면 상 분리나 취화 위험</td>
                  </tr>
                  <tr>
                    <td style={td}>예측 모델</td>
                    <td style={{ ...td, textAlign: "right" }}>{prediction?.predictionSource ? "플랫폼 예측 모델" : "로컬 모델"}</td>
                    <td style={{ ...td, fontSize: 10, color: "#555" }}>예측에 사용된 엔진 — 플랫폼 모델은 실험 데이터 학습 기반, 로컬은 조성 비율 기반 추정</td>
                  </tr>
                  <tr>
                    <td style={td}>혼합 엔트로피 (ΔSmix)</td>
                    <td style={tdR}>{Smix.toFixed(2)} J/mol·K</td>
                    <td style={{ ...td, fontSize: 10, color: "#555" }}>원소가 골고루 섞일수록 높아짐. 11 J/mol·K 이상이면 고엔트로피 합금(HEA)으로 분류</td>
                  </tr>
                </tbody>
              </table>
              <div style={{ marginTop: 12, padding: "8px 12px", background: "#f8f7f5", borderLeft: "3px solid #1a5fa8", fontSize: 10, color: "#666", lineHeight: 1.6 }}>
                본 보고서는 디지털 트윈 시뮬레이션으로 자동 생성된 예측값입니다. 실제 제조·가공 조건에 따라 결과가 달라질 수 있으며, 설계 적용 전 실측 시험을 권장합니다.
              </div>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}
