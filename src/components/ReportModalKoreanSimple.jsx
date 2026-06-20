import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { classifyFracture, estimateHardness, estimateKIC, predictPhases } from "../lib/physics.js";

const STAGE_ORDER = [
  "initial",
  "maximumStress",
  "crackInitiation",
  "crackGrowth",
  "finalFracture",
  "crossSection"
];

const STAGE_LABELS = {
  initial: "시험 전",
  maximumStress: "최대 하중 상태",
  crackInitiation: "균열 시작",
  crackGrowth: "균열 성장",
  finalFracture: "최종 파단",
  crossSection: "단면 분석"
};

function ReportChart({ points, uts, ys }) {
  if (!points?.length) return null;
  const width = 360;
  const height = 180;
  const pad = { l: 38, r: 12, t: 14, b: 26 };
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const maxStrain = Math.max(12, points[points.length - 1]?.strainPct ?? 12);
  const polyline = points.map((p) => {
    const x = pad.l + (p.strainPct / maxStrain) * innerW;
    const y = pad.t + innerH - (p.stressMpa / Math.max(1, uts)) * innerH;
    return `${x},${y}`;
  }).join(" ");
  const ysX = pad.l + ((ys / Math.max(1, uts)) * 0.55) * innerW;

  return (
    <svg width={width} height={height} style={{ display: "block", background: "#fff", maxWidth: "100%" }}>
      {[0, 0.25, 0.5, 0.75, 1].map((v) => (
        <g key={v}>
          <line x1={pad.l} y1={pad.t + innerH * (1 - v)} x2={width - pad.r} y2={pad.t + innerH * (1 - v)} stroke="#d6dde7" strokeWidth="1" />
          <text x={pad.l - 6} y={pad.t + innerH * (1 - v) + 3} textAnchor="end" fontSize="9" fill="#64748b">{Math.round(uts * v)}</text>
        </g>
      ))}
      <polyline points={polyline} fill="none" stroke="#0f5ca8" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      <line x1={ysX} y1={pad.t} x2={ysX} y2={pad.t + innerH} stroke="#b45309" strokeDasharray="4,3" />
      <line x1={pad.l} y1={height - pad.b} x2={width - pad.r} y2={height - pad.b} stroke="#93a4b8" />
      <line x1={pad.l} y1={pad.t} x2={pad.l} y2={height - pad.b} stroke="#93a4b8" />
      <text x={width / 2} y={height - 4} textAnchor="middle" fontSize="10" fill="#475569">변형률 (%)</text>
      <text x={14} y={height / 2} textAnchor="middle" fontSize="10" fill="#475569" transform={`rotate(-90, 14, ${height / 2})`}>응력 (MPa)</text>
      <text x={ysX + 4} y={pad.t + 10} fontSize="9" fill="#b45309">항복</text>
    </svg>
  );
}

function SnapshotStage({ stageKey, views }) {
  const viewKey = stageKey === "crossSection" ? "crossSection" : "perspective";
  const image = views?.[viewKey];

  return (
    <section style={{ marginBottom: 18 }}>
      <h3 style={{ margin: "0 0 8px", fontSize: 13, color: "#0f5ca8" }}>{STAGE_LABELS[stageKey] ?? stageKey}</h3>
      <div style={{ border: "1px solid #d7dde6", borderRadius: 6, padding: 8, background: "#f8fafc" }}>
        {image ? (
          <img src={image} alt={STAGE_LABELS[stageKey]} style={{ display: "block", width: "100%", borderRadius: 4 }} />
        ) : (
          <div style={{ height: 180, display: "grid", placeItems: "center", color: "#94a3b8", fontSize: 11 }}>캡처 이미지 없음</div>
        )}
        <div style={{ marginTop: 6, fontSize: 10, color: "#475569", fontWeight: 600 }}>
          {stageKey === "crossSection" ? "단면 분석 화면" : "메인 시뮬레이션 화면"}
        </div>
      </div>
    </section>
  );
}

export default function ReportModalKoreanSimple({
  alloyName,
  composition,
  normalizedComposition,
  prediction,
  simulation,
  deformStats,
  activeTest,
  processParams,
  testSnapshots,
  stressStrainPoints,
  onClose
}) {
  const printRef = useRef(null);
  const [saving, setSaving] = useState(false);
  const uts = prediction?.utsMpa ?? prediction?.strengthMpa ?? 800;
  const ys = prediction?.yieldStressMpa ?? uts * 0.7;
  const elong = prediction?.elongationPercent ?? 16;
  const fracture = classifyFracture(elong, prediction?.areaReductionPercent ?? 30);
  const hardness = estimateHardness(uts);
  const kic = estimateKIC(uts, elong);
  const phases = predictPhases(composition ?? {});
  const stageKeys = useMemo(() => STAGE_ORDER.filter((stageKey) => testSnapshots?.[stageKey]), [testSnapshots]);
  const isBending = activeTest === "bending";
  const specimen = isBending
    ? { name: "ASTM 굽힘 시편", gauge: "지지 스팬 200 mm", section: "34 mm x 34 mm", feature: "지지 롤러 및 중앙 가압 노즈" }
    : { name: "ASTM 인장 시편", gauge: "표점 거리 50 mm", section: "직경 10 mm", feature: "필렛 전이부 포함 축소 게이지부" };

  const crackDepth = simulation?.result?.crackDepthPercent ?? Math.min(96, (deformStats?.damageRatio ?? 0.12) * 100);
  const remainingLigament = simulation?.result?.remainingLigamentPercent ?? Math.max(4, 100 - crackDepth);
  const progression = Math.min(100, Math.max(0, (deformStats?.damageRatio ?? 0.12) * 100));

  const handleSavePdf = useCallback(async () => {
    if (!printRef.current || saving) return;
    setSaving(true);
    try {
      const canvas = await html2canvas(printRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false
      });
      const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
      const pageW = 210;
      const pageH = 297;
      const margin = 8;
      const contentW = pageW - margin * 2;
      const scale = contentW / canvas.width;
      let yOffset = 0;
      let pageIndex = 0;

      while (yOffset < canvas.height) {
        if (pageIndex > 0) pdf.addPage();
        const sliceHeight = Math.min(canvas.height - yOffset, Math.floor((pageH - margin * 2) / scale));
        const slice = document.createElement("canvas");
        slice.width = canvas.width;
        slice.height = sliceHeight;
        const ctx = slice.getContext("2d");
        ctx.drawImage(canvas, 0, yOffset, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);
        pdf.addImage(slice.toDataURL("image/jpeg", 0.92), "JPEG", margin, margin, contentW, sliceHeight * scale);
        yOffset += sliceHeight;
        pageIndex += 1;
      }

      pdf.save(`재료시험보고서-${new Date().toISOString().slice(0, 10)}.pdf`);
    } finally {
      setSaving(false);
    }
  }, [saving]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2000,
        background: "rgba(11,18,32,0.58)",
        overflowY: "auto",
        padding: 18
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 920,
          maxWidth: "100%",
          margin: "0 auto",
          borderRadius: 10,
          background: "#fff",
          boxShadow: "0 20px 70px rgba(0,0,0,0.32)",
          overflow: "hidden"
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", background: "#0f5ca8", color: "#fff" }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800 }}>재료 시험 보고서</div>
            <div style={{ fontSize: 11, opacity: 0.92 }}>{isBending ? "3점 굽힘 시험" : "인장 강도 시험"}</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handleSavePdf} style={{ border: 0, borderRadius: 6, background: "#fff", color: "#0f5ca8", padding: "7px 12px", fontWeight: 700, cursor: "pointer" }}>{saving ? "PDF 생성 중..." : "PDF 저장"}</button>
            <button onClick={onClose} style={{ border: "1px solid rgba(255,255,255,0.32)", borderRadius: 6, background: "rgba(255,255,255,0.12)", color: "#fff", padding: "7px 10px", cursor: "pointer" }}>닫기</button>
          </div>
        </div>

        <div ref={printRef} style={{ padding: 24, color: "#1e293b", fontFamily: "'IBM Plex Sans','Noto Sans KR',sans-serif" }}>
          <section style={{ marginBottom: 18 }}>
            <h2 style={{ margin: 0, fontSize: 20, color: "#0f5ca8" }}>{alloyName ?? "스테인리스 시편"}</h2>
            <div style={{ marginTop: 4, fontSize: 12, color: "#64748b" }}>{new Date().toLocaleString("ko-KR", { hour12: false })}</div>
          </section>

          <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 18 }}>
            <div style={{ border: "1px solid #d7dde6", borderRadius: 8, padding: 14 }}>
              <h3 style={{ margin: "0 0 8px", color: "#0f5ca8", fontSize: 13 }}>재료 정보</h3>
              <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
                <tbody>
                  <tr><td style={{ padding: "5px 0", color: "#475569" }}>항복강도</td><td style={{ padding: "5px 0", textAlign: "right", fontWeight: 700 }}>{ys.toFixed(1)} MPa</td></tr>
                  <tr><td style={{ padding: "5px 0", color: "#475569" }}>인장강도</td><td style={{ padding: "5px 0", textAlign: "right", fontWeight: 700 }}>{uts.toFixed(1)} MPa</td></tr>
                  <tr><td style={{ padding: "5px 0", color: "#475569" }}>탄성계수</td><td style={{ padding: "5px 0", textAlign: "right" }}>{prediction?.elasticityGpa?.toFixed(1)} GPa</td></tr>
                  <tr><td style={{ padding: "5px 0", color: "#475569" }}>연신율</td><td style={{ padding: "5px 0", textAlign: "right" }}>{elong.toFixed(1)}%</td></tr>
                  <tr><td style={{ padding: "5px 0", color: "#475569" }}>경도 추정</td><td style={{ padding: "5px 0", textAlign: "right" }}>HV {hardness.HV} / HRC {hardness.HRC}</td></tr>
                  <tr><td style={{ padding: "5px 0", color: "#475569" }}>파괴 인성 추정</td><td style={{ padding: "5px 0", textAlign: "right" }}>{kic} MPa·m^0.5</td></tr>
                </tbody>
              </table>
            </div>

            <div style={{ border: "1px solid #d7dde6", borderRadius: 8, padding: 14 }}>
              <h3 style={{ margin: "0 0 8px", color: "#0f5ca8", fontSize: 13 }}>시편 정보</h3>
              <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
                <tbody>
                  <tr><td style={{ padding: "5px 0", color: "#475569" }}>시편 형상</td><td style={{ padding: "5px 0", textAlign: "right", fontWeight: 700 }}>{specimen.name}</td></tr>
                  <tr><td style={{ padding: "5px 0", color: "#475569" }}>표점 거리 / 스팬</td><td style={{ padding: "5px 0", textAlign: "right" }}>{specimen.gauge}</td></tr>
                  <tr><td style={{ padding: "5px 0", color: "#475569" }}>단면</td><td style={{ padding: "5px 0", textAlign: "right" }}>{specimen.section}</td></tr>
                  <tr><td style={{ padding: "5px 0", color: "#475569" }}>지그 구성</td><td style={{ padding: "5px 0", textAlign: "right" }}>{specimen.feature}</td></tr>
                  <tr><td style={{ padding: "5px 0", color: "#475569" }}>배치 방향</td><td style={{ padding: "5px 0", textAlign: "right" }}>{isBending ? "수평 배치" : "수직 배치"}</td></tr>
                </tbody>
              </table>
            </div>
          </section>

          <section style={{ marginBottom: 18, border: "1px solid #d7dde6", borderRadius: 8, padding: 14 }}>
            <h3 style={{ margin: "0 0 8px", color: "#0f5ca8", fontSize: 13 }}>시험 조건</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12, fontSize: 11 }}>
              <div><strong>용체화 온도</strong><br />{processParams?.["Solution_treatment_temperature"] ?? "-"} °C</div>
              <div><strong>유지 시간</strong><br />{processParams?.["Solution_treatment_time(s)"] ?? "-"} s</div>
              <div><strong>시험 온도</strong><br />{((processParams?.["Temperature (K)"] ?? 293) - 273).toFixed(0)} °C</div>
            </div>
          </section>

          <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 18 }}>
            <div style={{ border: "1px solid #d7dde6", borderRadius: 8, padding: 14 }}>
              <h3 style={{ margin: "0 0 8px", color: "#0f5ca8", fontSize: 13 }}>결과 요약</h3>
              <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
                <tbody>
                  <tr><td style={{ padding: "5px 0", color: "#475569" }}>최대 응력</td><td style={{ padding: "5px 0", textAlign: "right", fontWeight: 700 }}>{simulation?.result?.maxStressMpa ?? uts} MPa</td></tr>
                  <tr><td style={{ padding: "5px 0", color: "#475569" }}>최대 변형률</td><td style={{ padding: "5px 0", textAlign: "right" }}>{simulation?.result?.strainPercent ?? deformStats?.maxStrain?.toFixed(1)}%</td></tr>
                  <tr><td style={{ padding: "5px 0", color: "#475569" }}>변위</td><td style={{ padding: "5px 0", textAlign: "right" }}>{simulation?.result?.deformationMm ?? ((deformStats?.totalPull ?? 0) * 100).toFixed(1)} mm</td></tr>
                  <tr><td style={{ padding: "5px 0", color: "#475569" }}>파손 위험도</td><td style={{ padding: "5px 0", textAlign: "right" }}>{simulation?.result?.failureRisk ?? "높음"}</td></tr>
                  <tr><td style={{ padding: "5px 0", color: "#475569" }}>파단 형태</td><td style={{ padding: "5px 0", textAlign: "right" }}>{fracture.korean}</td></tr>
                  <tr><td style={{ padding: "5px 0", color: "#475569" }}>조직 비율</td><td style={{ padding: "5px 0", textAlign: "right" }}>A {phases.austenite}% / F {phases.ferrite}% / M {phases.martensite}%</td></tr>
                </tbody>
              </table>
            </div>

            <div style={{ border: "1px solid #d7dde6", borderRadius: 8, padding: 14 }}>
              <h3 style={{ margin: "0 0 8px", color: "#0f5ca8", fontSize: 13 }}>응력 분석</h3>
              <ReportChart points={stressStrainPoints} uts={uts} ys={ys} />
            </div>
          </section>

          <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 18 }}>
            <div style={{ border: "1px solid #d7dde6", borderRadius: 8, padding: 14 }}>
              <h3 style={{ margin: "0 0 8px", color: "#0f5ca8", fontSize: 13 }}>변형률 분석</h3>
              <div style={{ fontSize: 11, lineHeight: 1.8 }}>
                <div><strong>국부 최대 변형률</strong>: {deformStats?.maxStrain?.toFixed?.(1) ?? "0.0"}%</div>
                <div><strong>연성 지표</strong>: {elong.toFixed(1)}%</div>
                <div><strong>단면 수축률</strong>: {prediction?.areaReductionPercent != null ? `${prediction.areaReductionPercent}%` : "-"}</div>
                <div><strong>소성 진행 상태</strong>: {deformStats?.maxStrain < 2 ? "탄성 단계" : deformStats?.maxStrain < 8 ? "소성 변형 진행" : "파단 임계 접근"}</div>
              </div>
            </div>

            <div style={{ border: "1px solid #d7dde6", borderRadius: 8, padding: 14 }}>
              <h3 style={{ margin: "0 0 8px", color: "#0f5ca8", fontSize: 13 }}>단면 분석</h3>
              <div style={{ fontSize: 11, lineHeight: 1.8 }}>
                <div><strong>내부 응력 분포</strong>: 중앙부 집중</div>
                <div><strong>내부 변형률 분포</strong>: 외측 섬유부 최대</div>
                <div><strong>균열 깊이</strong>: {crackDepth.toFixed(1)}%</div>
                <div><strong>잔존 ligament</strong>: {remainingLigament.toFixed(1)}%</div>
                <div><strong>파손 진행도</strong>: {progression.toFixed(1)}%</div>
              </div>
            </div>
          </section>

          <section style={{ marginBottom: 18, border: "1px solid #d7dde6", borderRadius: 8, padding: 14 }}>
            <h3 style={{ margin: "0 0 8px", color: "#0f5ca8", fontSize: 13 }}>파단 분석</h3>
            <div style={{ fontSize: 11, lineHeight: 1.8 }}>
              <div><strong>파단 형태</strong>: {fracture.korean}</div>
              <div><strong>표면 형태</strong>: {fracture.morphology}</div>
              <div><strong>예상 파단 각도</strong>: {fracture.angle}°</div>
              <div><strong>조성</strong>: {Object.entries(normalizedComposition ?? composition ?? {}).map(([key, value]) => `${key} ${Number(value).toFixed(1)}%`).join(", ")}</div>
            </div>
          </section>

          <section>
            <h3 style={{ margin: "0 0 10px", color: "#0f5ca8", fontSize: 13 }}>시뮬레이션 이미지</h3>
            {stageKeys.length > 0 ? (
              stageKeys.map((stageKey) => (
                <SnapshotStage key={stageKey} stageKey={stageKey} views={testSnapshots[stageKey]} />
              ))
            ) : (
              <div style={{ padding: 18, border: "1px dashed #cbd5e1", borderRadius: 8, color: "#64748b", fontSize: 11 }}>자동 캡처된 시뮬레이션 이미지가 아직 없습니다.</div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
