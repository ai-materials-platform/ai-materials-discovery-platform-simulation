import React, { useCallback, useEffect, useRef, useState } from "react";
import { classifyFracture, estimateHardness, estimateKIC, predictPhases } from "../lib/physics.js";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

const STAGE_LABELS = {
  initial: "Initial State",
  elastic: "Elastic State",
  yield: "Yield State",
  plastic: "Plastic State",
  maximumStress: "Maximum Stress State",
  crackInitiation: "Crack Initiation",
  crackGrowth: "Crack Growth",
  nearFailure: "Near Failure",
  finalFracture: "Final Fracture"
};

const VIEW_LABELS = {
  front: "Front View",
  side: "Side / Stress View",
  top: "Top / Strain View",
  bottom: "Bottom / Fracture View",
  perspective: "Perspective / 3D Orbit View",
  crossSection: "Cross Section View"
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
    <svg width={width} height={height} style={{ display: "block", background: "#fff" }}>
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
      <text x={width / 2} y={height - 4} textAnchor="middle" fontSize="10" fill="#475569">Strain (%)</text>
      <text x={14} y={height / 2} textAnchor="middle" fontSize="10" fill="#475569" transform={`rotate(-90, 14, ${height / 2})`}>Stress (MPa)</text>
      <text x={ysX + 4} y={pad.t + 10} fontSize="9" fill="#b45309">Yield</text>
    </svg>
  );
}

function SnapshotStage({ stageKey, views }) {
  const orderedViews = ["front", "side", "top", "bottom", "perspective", "crossSection"];
  return (
    <section style={{ marginBottom: 18 }}>
      <h3 style={{ margin: "0 0 8px", fontSize: 13, color: "#0f5ca8" }}>{STAGE_LABELS[stageKey] ?? stageKey}</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
        {orderedViews.map((viewKey) => (
          <div key={viewKey} style={{ border: "1px solid #d7dde6", borderRadius: 6, padding: 6, background: "#f8fafc" }}>
            {views?.[viewKey] ? (
              <img src={views[viewKey]} alt={VIEW_LABELS[viewKey]} style={{ display: "block", width: "100%", borderRadius: 4 }} />
            ) : (
              <div style={{ height: 132, display: "grid", placeItems: "center", color: "#94a3b8", fontSize: 11 }}>No capture</div>
            )}
            <div style={{ marginTop: 5, fontSize: 10, color: "#475569", fontWeight: 600 }}>{VIEW_LABELS[viewKey]}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function ReportModalDigitalTwin({
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
  const stageKeys = Object.keys(testSnapshots ?? {}).sort((a, b) => {
    const order = Object.keys(STAGE_LABELS);
    return order.indexOf(a) - order.indexOf(b);
  });
  const isBending = activeTest === "bending";
  const specimen = isBending
    ? { name: "ASTM E290 Rectangular Bending Bar", gauge: "200 mm span", section: "34 mm x 34 mm", feature: "Support rollers + loading nose" }
    : { name: "ASTM E8 Round Tensile Specimen", gauge: "50 mm gauge length", section: "10 mm diameter", feature: "Reduced gauge with smooth fillets" };

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
      pdf.save(`digital-twin-report-${new Date().toISOString().slice(0, 10)}.pdf`);
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
            <div style={{ fontSize: 16, fontWeight: 800 }}>Digital Twin Material Test Report</div>
            <div style={{ fontSize: 11, opacity: 0.92 }}>{isBending ? "Three-Point Bending Test" : "Tensile Strength Test"}</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handleSavePdf} style={{ border: 0, borderRadius: 6, background: "#fff", color: "#0f5ca8", padding: "7px 12px", fontWeight: 700, cursor: "pointer" }}>{saving ? "PDF 생성 중..." : "PDF 저장"}</button>
            <button onClick={onClose} style={{ border: "1px solid rgba(255,255,255,0.32)", borderRadius: 6, background: "rgba(255,255,255,0.12)", color: "#fff", padding: "7px 10px", cursor: "pointer" }}>닫기</button>
          </div>
        </div>

        <div ref={printRef} style={{ padding: 24, color: "#1e293b", fontFamily: "'IBM Plex Sans','Noto Sans KR',sans-serif" }}>
          <section style={{ marginBottom: 18 }}>
            <h2 style={{ margin: 0, fontSize: 20, color: "#0f5ca8" }}>{alloyName ?? "Material Specimen"}</h2>
            <div style={{ marginTop: 4, fontSize: 12, color: "#64748b" }}>{new Date().toLocaleString("ko-KR", { hour12: false })}</div>
          </section>

          <section style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 16, marginBottom: 18 }}>
            <div style={{ border: "1px solid #d7dde6", borderRadius: 8, padding: 14 }}>
              <h3 style={{ margin: "0 0 8px", color: "#0f5ca8", fontSize: 13 }}>Specimen Information</h3>
              <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
                <tbody>
                  <tr><td style={{ padding: "5px 0", color: "#475569" }}>Type</td><td style={{ padding: "5px 0", textAlign: "right", fontWeight: 700 }}>{specimen.name}</td></tr>
                  <tr><td style={{ padding: "5px 0", color: "#475569" }}>Gauge / Span</td><td style={{ padding: "5px 0", textAlign: "right" }}>{specimen.gauge}</td></tr>
                  <tr><td style={{ padding: "5px 0", color: "#475569" }}>Cross Section</td><td style={{ padding: "5px 0", textAlign: "right" }}>{specimen.section}</td></tr>
                  <tr><td style={{ padding: "5px 0", color: "#475569" }}>Fixture</td><td style={{ padding: "5px 0", textAlign: "right" }}>{specimen.feature}</td></tr>
                  <tr><td style={{ padding: "5px 0", color: "#475569" }}>Scale</td><td style={{ padding: "5px 0", textAlign: "right" }}>{isBending ? "Horizontal laboratory setup" : "Vertical laboratory setup"}</td></tr>
                </tbody>
              </table>
            </div>

            <div style={{ border: "1px solid #d7dde6", borderRadius: 8, padding: 14 }}>
              <h3 style={{ margin: "0 0 8px", color: "#0f5ca8", fontSize: 13 }}>Material Information</h3>
              <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
                <tbody>
                  <tr><td style={{ padding: "5px 0", color: "#475569" }}>Yield Stress</td><td style={{ padding: "5px 0", textAlign: "right", fontWeight: 700 }}>{ys.toFixed(1)} MPa</td></tr>
                  <tr><td style={{ padding: "5px 0", color: "#475569" }}>UTS</td><td style={{ padding: "5px 0", textAlign: "right", fontWeight: 700 }}>{uts.toFixed(1)} MPa</td></tr>
                  <tr><td style={{ padding: "5px 0", color: "#475569" }}>Elastic Modulus</td><td style={{ padding: "5px 0", textAlign: "right" }}>{prediction?.elasticityGpa?.toFixed(1)} GPa</td></tr>
                  <tr><td style={{ padding: "5px 0", color: "#475569" }}>Elongation</td><td style={{ padding: "5px 0", textAlign: "right" }}>{elong.toFixed(1)}%</td></tr>
                  <tr><td style={{ padding: "5px 0", color: "#475569" }}>Hardness</td><td style={{ padding: "5px 0", textAlign: "right" }}>HV {hardness.HV} / HRC {hardness.HRC}</td></tr>
                  <tr><td style={{ padding: "5px 0", color: "#475569" }}>Fracture Toughness</td><td style={{ padding: "5px 0", textAlign: "right" }}>{kic} MPa·m^0.5</td></tr>
                </tbody>
              </table>
            </div>
          </section>

          <section style={{ marginBottom: 18, border: "1px solid #d7dde6", borderRadius: 8, padding: 14 }}>
            <h3 style={{ margin: "0 0 8px", color: "#0f5ca8", fontSize: 13 }}>Simulation Parameters</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12, fontSize: 11 }}>
              <div><strong>Solution Treatment</strong><br />{processParams?.["Solution_treatment_temperature"] ?? "-"} °C</div>
              <div><strong>Holding Time</strong><br />{processParams?.["Solution_treatment_time(s)"] ?? "-"} s</div>
              <div><strong>Test Temperature</strong><br />{((processParams?.["Temperature (K)"] ?? 293) - 273).toFixed(0)} °C</div>
            </div>
          </section>

          <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 18 }}>
            <div style={{ border: "1px solid #d7dde6", borderRadius: 8, padding: 14 }}>
              <h3 style={{ margin: "0 0 8px", color: "#0f5ca8", fontSize: 13 }}>Stress Analysis</h3>
              <ReportChart points={stressStrainPoints} uts={uts} ys={ys} />
            </div>
            <div style={{ border: "1px solid #d7dde6", borderRadius: 8, padding: 14 }}>
              <h3 style={{ margin: "0 0 8px", color: "#0f5ca8", fontSize: 13 }}>Results Summary</h3>
              <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
                <tbody>
                  <tr><td style={{ padding: "5px 0", color: "#475569" }}>Max Stress</td><td style={{ padding: "5px 0", textAlign: "right", fontWeight: 700 }}>{simulation?.result?.maxStressMpa ?? uts} MPa</td></tr>
                  <tr><td style={{ padding: "5px 0", color: "#475569" }}>Strain</td><td style={{ padding: "5px 0", textAlign: "right" }}>{simulation?.result?.strainPercent ?? deformStats?.maxStrain?.toFixed(1)}%</td></tr>
                  <tr><td style={{ padding: "5px 0", color: "#475569" }}>Deflection / Pull</td><td style={{ padding: "5px 0", textAlign: "right" }}>{simulation?.result?.deformationMm ?? ((deformStats?.totalPull ?? 0) * 100).toFixed(1)} mm</td></tr>
                  <tr><td style={{ padding: "5px 0", color: "#475569" }}>Failure Risk</td><td style={{ padding: "5px 0", textAlign: "right" }}>{simulation?.result?.failureRisk ?? "High"}</td></tr>
                  <tr><td style={{ padding: "5px 0", color: "#475569" }}>Fracture Mode</td><td style={{ padding: "5px 0", textAlign: "right" }}>{fracture.korean}</td></tr>
                  <tr><td style={{ padding: "5px 0", color: "#475569" }}>Microstructure</td><td style={{ padding: "5px 0", textAlign: "right" }}>A {phases.austenite}% / F {phases.ferrite}% / M {phases.martensite}%</td></tr>
                </tbody>
              </table>
            </div>
          </section>

          <section style={{ marginBottom: 18, border: "1px solid #d7dde6", borderRadius: 8, padding: 14 }}>
            <h3 style={{ margin: "0 0 8px", color: "#0f5ca8", fontSize: 13 }}>Failure Analysis</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, fontSize: 11, lineHeight: 1.7 }}>
              <div>
                <div><strong>Fracture Type</strong>: {fracture.korean}</div>
                <div><strong>Surface Morphology</strong>: {fracture.morphology}</div>
                <div><strong>Fracture Angle</strong>: {fracture.angle}°</div>
              </div>
              <div>
                <div><strong>Composition</strong>: {Object.entries(normalizedComposition ?? composition ?? {}).map(([key, value]) => `${key} ${Number(value).toFixed(1)}%`).join(", ")}</div>
              </div>
            </div>
          </section>

          <section>
            <h3 style={{ margin: "0 0 10px", color: "#0f5ca8", fontSize: 13 }}>Automatic Simulation Snapshots</h3>
            {stageKeys.length > 0 ? (
              stageKeys.map((stageKey) => (
                <SnapshotStage key={stageKey} stageKey={stageKey} views={testSnapshots[stageKey]} />
              ))
            ) : (
              <div style={{ padding: 18, border: "1px dashed #cbd5e1", borderRadius: 8, color: "#64748b", fontSize: 11 }}>자동 캡처된 스냅샷이 아직 없습니다.</div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
