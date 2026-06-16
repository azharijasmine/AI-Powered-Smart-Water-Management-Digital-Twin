// ════════════════════════════════════════════════════════════════
//  AIInsights.jsx — AI Intelligence & ML Analytics Dashboard
//  Integrates: ML predictions, Gemini reports, sustainability,
//              Chart.js line/bar/forecast charts, AI assistant
// ════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef } from "react";

const BACKEND = "http://localhost:8000";

// ── Colour helpers ────────────────────────────────────────────
const SC = {
  OVERFLOW: "#ef4444", FULL: "#f97316",
  MEDIUM:   "#3b82f6", LOW:  "#22c55e",
};

// ════════════════════════════════════════════════════════════════
//  MINI LINE CHART  (pure SVG, no Chart.js dependency)
// ════════════════════════════════════════════════════════════════
function LineChart({ series, height = 140, showGrid = true }) {
  // series: [{label, data: [numbers], color}]
  if (!series || series.length === 0) return null;

  const W = 420, H = height;
  const PAD = { top: 12, right: 16, bottom: 28, left: 36 };
  const iW = W - PAD.left - PAD.right;
  const iH = H - PAD.top  - PAD.bottom;

  const allVals = series.flatMap(s => s.data).filter(v => v != null);
  if (allVals.length === 0) return null;

  const minV = Math.min(...allVals);
  const maxV = Math.max(...allVals);
  const range = maxV - minV || 1;

  function toX(i, len) { return PAD.left + (i / (len - 1 || 1)) * iW; }
  function toY(v)       { return PAD.top  + iH - ((v - minV) / range) * iH; }

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map(f => minV + f * range);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height }} preserveAspectRatio="none">
      {/* Grid */}
      {showGrid && gridLines.map((v, i) => (
        <g key={i}>
          <line x1={PAD.left} y1={toY(v)} x2={W - PAD.right} y2={toY(v)}
                stroke="#f1f5f9" strokeWidth="1"/>
          <text x={PAD.left - 4} y={toY(v) + 3.5} textAnchor="end"
                fontSize="8" fill="#94a3b8">{Math.round(v)}</text>
        </g>
      ))}
      {/* X axis */}
      <line x1={PAD.left} y1={H - PAD.bottom} x2={W - PAD.right} y2={H - PAD.bottom}
            stroke="#e2e8f0" strokeWidth="1"/>
      {/* Series */}
      {series.map((s, si) => {
        const pts = s.data.map((v, i) => `${toX(i, s.data.length)},${toY(v)}`).join(" ");
        const area = `${PAD.left},${H-PAD.bottom} ${pts} ${toX(s.data.length-1, s.data.length)},${H-PAD.bottom}`;
        return (
          <g key={si}>
            {/* Area fill */}
            <polyline points={area} fill={s.color + "18"} stroke="none"/>
            {/* Line */}
            <polyline points={pts} fill="none" stroke={s.color} strokeWidth="2"
                      strokeLinejoin="round" strokeLinecap="round"
                      strokeDasharray={s.dashed ? "5,3" : undefined}/>
            {/* Last dot */}
            {s.data.length > 0 && (() => {
              const last = s.data.length - 1;
              return <circle cx={toX(last, s.data.length)} cy={toY(s.data[last])}
                             r="3.5" fill={s.color} stroke="white" strokeWidth="1.5"/>;
            })()}
          </g>
        );
      })}
      {/* X labels */}
      {series[0]?.labels?.map((lbl, i) => (
        <text key={i} x={toX(i, series[0].labels.length)} y={H - PAD.bottom + 10}
              textAnchor="middle" fontSize="7" fill="#94a3b8">{lbl}</text>
      ))}
    </svg>
  );
}

// ════════════════════════════════════════════════════════════════
//  BAR CHART (pure SVG)
// ════════════════════════════════════════════════════════════════
function BarChart({ data, color = "#3b82f6", height = 120 }) {
  if (!data || data.length === 0)
    return <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: 12 }}>No forecast data yet</div>;

  const max = Math.max(...data.map(d => d.value), 0.1);
  const W = 420, H = height;
  const barW = Math.min(36, (W - 40) / data.length - 4);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height }} preserveAspectRatio="none">
      {data.map((d, i) => {
        const x  = 20 + i * ((W - 40) / data.length) + (W - 40) / data.length / 2 - barW / 2;
        const bH = ((d.value / max) * (H - 30));
        const y  = H - 20 - bH;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={bH} rx="4"
                  fill={color} opacity="0.85"/>
            <text x={x + barW/2} y={y - 3} textAnchor="middle" fontSize="7" fill={color} fontWeight="700">
              {d.value.toFixed(1)}
            </text>
            <text x={x + barW/2} y={H - 6} textAnchor="middle" fontSize="7" fill="#94a3b8">
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ════════════════════════════════════════════════════════════════
//  AI ASSISTANT AVATAR  (CSS 3D animated character)
// ════════════════════════════════════════════════════════════════
function AIAssistant({ status, mlData, message }) {
  const [anim, setAnim] = useState("idle");
  const color = SC[status] || "#3b82f6";

  useEffect(() => {
    if (mlData?.anomaly_detected) { setAnim("alert"); return; }
    if (status === "OVERFLOW")    { setAnim("alert"); return; }
    if (status === "LOW")         { setAnim("warn");  return; }
    setAnim("idle");
  }, [status, mlData]);

  const face =
    anim === "alert" ? "😰" :
    anim === "warn"  ? "😟" :
    status === "FULL" ? "😊" :
    status === "MEDIUM" ? "🙂" : "😄";

  return (
    <div className="ai-assistant">
      <div className="ai-avatar" style={{ borderColor: color, boxShadow: `0 0 24px ${color}44` }}
           data-anim={anim}>
        <div className="ai-avatar-body" style={{ background: `linear-gradient(135deg, ${color}22, ${color}44)` }}>
          <div className="ai-face">{face}</div>
          <div className="ai-pulse" style={{ background: color }}/>
        </div>
      </div>
      <div className="ai-speech">
        <div className="ai-speech-name">💧 Aqua AI</div>
        <div className="ai-speech-bubble" style={{ borderColor: color + "44" }}>
          {message || `Tank is ${status}. Monitoring active.`}
        </div>
        <div className="ai-speech-status" style={{ color }}>
          {mlData?.trend || "Analysing…"}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
//  PREDICTION CARD
// ════════════════════════════════════════════════════════════════
function PredCard({ label, value, unit, icon, color }) {
  return (
    <div className="pred-card" style={{ borderColor: color + "44" }}>
      <div className="pred-icon" style={{ color }}>{icon}</div>
      <div className="pred-val"  style={{ color }}>{value ?? "—"}<span className="pred-unit">{unit}</span></div>
      <div className="pred-lbl">{label}</div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
//  SUSTAINABILITY PANEL
// ════════════════════════════════════════════════════════════════
function SustainPanel({ data }) {
  if (!data) return <div className="ai-empty">Run ML analysis to see sustainability metrics.</div>;

  const items = [
    { icon: "💧", label: "Daily Usage",   value: `${data.daily_L} L`,   color: "#3b82f6" },
    { icon: "📅", label: "Weekly Usage",  value: `${data.weekly_L} L`,  color: "#6366f1" },
    { icon: "🗓️", label: "Monthly Est.",  value: `${data.monthly_L} L`, color: "#8b5cf6" },
    { icon: "🌱", label: "Carbon Saved",  value: `${data.carbon_saved_kg} kg CO₂`, color: "#22c55e" },
    { icon: "💰", label: "Water Saved vs Baseline", value: `${data.liters_saved_vs_baseline} L/day`, color: "#f97316" },
    { icon: "⭐", label: "Efficiency",    value: `${data.efficiency_score}/10`, color: "#f59e0b" },
  ];

  return (
    <div className="sustain-grid">
      {items.map((item, i) => (
        <div key={i} className="sustain-card" style={{ borderColor: item.color + "33" }}>
          <div className="sustain-icon" style={{ color: item.color }}>{item.icon}</div>
          <div className="sustain-val"  style={{ color: item.color }}>{item.value}</div>
          <div className="sustain-lbl">{item.label}</div>
        </div>
      ))}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
//  REPORT VIEWER
// ════════════════════════════════════════════════════════════════
function ReportViewer({ report, loading, title }) {
  if (loading) return (
    <div className="report-loading">
      <div className="report-spinner"/>
      Generating {title}…
    </div>
  );
  if (!report) return (
    <div className="ai-empty">Click "Generate" to create {title}.</div>
  );
  return (
    <div className="report-body">
      {report.split("\n").map((line, i) => {
        const isBold  = line.startsWith("##") || line.startsWith("📋") || line.startsWith("━");
        const isHead  = line.startsWith("📊") || line.startsWith("🔍") || line.startsWith("💡")
                     || line.startsWith("🔮") || line.startsWith("🌱") || line.startsWith("⚠️")
                     || line.startsWith("⭐") || line.startsWith("🔬") || line.startsWith("📉")
                     || line.startsWith("⚡") || line.startsWith("🚨") || line.startsWith("🌊");
        return (
          <p key={i} className={`report-line ${isBold?"report-title":""} ${isHead?"report-section":""}`}>
            {line}
          </p>
        );
      })}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ════════════════════════════════════════════════════════════════
export default function AIInsights({ sensor, thresholds, fillCycles, connected }) {
  const [mlData,      setMlData]      = useState(null);
  const [mlLoading,   setMlLoading]   = useState(false);
  const [forecast,    setForecast]    = useState(null);
  const [analyst,     setAnalyst]     = useState("");
  const [analLoading, setAnalLoading] = useState(false);
  const [dailyRep,    setDailyRep]    = useState("");
  const [weeklyRep,   setWeeklyRep]   = useState("");
  const [dailyLd,     setDailyLd]     = useState(false);
  const [weeklyLd,    setWeeklyLd]    = useState(false);
  const [activeTab,   setActiveTab]   = useState("overview");
  const [pctHistory,  setPctHistory]  = useState([]);
  const [assistantMsg, setAssistantMsg] = useState("");

  const status = sensor?.status || "LOW";
  const pct    = parseFloat(sensor?.percentage) || 0;

  // Build rolling history for chart
  useEffect(() => {
    if (sensor?.percentage != null)
      setPctHistory(h => [...h, pct].slice(-40));
  }, [sensor]);

  // Auto-fetch ML every 10s
  useEffect(() => {
    fetchML();
    const iv = setInterval(fetchML, 10000);
    return () => clearInterval(iv);
  }, []);

  async function fetchML() {
    try {
      const r = await fetch(`${BACKEND}/api/ml/predict`);
      const d = await r.json();
      if (d.ready) {
        setMlData(d);
        setForecast(d.daily_forecast);
        // Update assistant message
        if (d.anomaly_detected) setAssistantMsg(`⚠️ Anomaly detected! Z-score: ${d.z_score}. Unusual consumption pattern.`);
        else if (d.trend?.includes("Rapidly")) setAssistantMsg(`${d.trend} detected. Rate: ${d.rate_of_change} %/min.`);
        else setAssistantMsg(`Level at ${d.current_pct}%. ${d.trend}. Confidence: ${d.confidence_label}.`);
      } else {
        setAssistantMsg(d.message || "Collecting data…");
      }
    } catch { setAssistantMsg("Backend offline."); }
  }

  async function runAnalyst() {
    setAnalLoading(true); setAnalyst("");
    try {
      const r = await fetch(`${BACKEND}/api/ai/analyst`, { method: "POST" });
      const d = await r.json();
      setAnalyst(d.analysis || d.error || "No response");
      if (d.ml_data) setMlData(d.ml_data);
    } catch { setAnalyst("❌ Backend offline"); }
    setAnalLoading(false);
  }

  async function genDaily() {
    setDailyLd(true); setDailyRep("");
    try {
      const r = await fetch(`${BACKEND}/api/ai/report/daily`, { method: "POST" });
      const d = await r.json();
      setDailyRep(d.report || d.error);
    } catch { setDailyRep("❌ Backend offline"); }
    setDailyLd(false);
  }

  async function genWeekly() {
    setWeeklyLd(true); setWeeklyRep("");
    try {
      const r = await fetch(`${BACKEND}/api/ai/report/weekly`, { method: "POST" });
      const d = await r.json();
      setWeeklyRep(d.report || d.error);
    } catch { setWeeklyRep("❌ Backend offline"); }
    setWeeklyLd(false);
  }

  // Build prediction chart series
  const predSeries = mlData?.ready ? [
    {
      label: "Actual",
      data:  pctHistory,
      color: SC[status] || "#3b82f6",
    },
    {
      label: "Predicted",
      data:  [
        ...Array(Math.max(0, pctHistory.length - 4)).fill(null),
        pctHistory[pctHistory.length - 1],
        mlData.predicted?.["5min"],
        mlData.predicted?.["15min"],
        mlData.predicted?.["30min"],
      ].filter(v => v != null),
      color: "#a855f7",
      dashed: true,
    },
  ] : [];

  const holtSeries = mlData?.holt_forecast ? [{
    label: "Holt Forecast",
    data:  mlData.holt_forecast,
    color: "#06b6d4",
    dashed: true,
  }] : [];

  const fcBarData = forecast?.labels?.map((lbl, i) => ({
    label: lbl,
    value: forecast.forecasts[i] || 0,
  })) || [];

  const tabs = ["overview", "prediction", "forecast", "sustainability", "reports"];

  return (
    <div className="ai-insights-root">

      {/* ══ AI ASSISTANT ══ */}
      <AIAssistant status={status} mlData={mlData} message={assistantMsg}/>

      {/* ══ INNER TABS ══ */}
      <div className="ai-inner-tabs">
        {tabs.map(t => (
          <button key={t} className={`ai-itab ${activeTab===t?"ai-itab-on":""}`}
                  onClick={() => setActiveTab(t)}>
            {{ overview:"🔭 Overview", prediction:"🤖 ML Prediction",
               forecast:"📈 Forecast", sustainability:"🌱 Sustainability",
               reports:"📋 Reports" }[t]}
          </button>
        ))}
      </div>

      {/* ══ OVERVIEW ══ */}
      {activeTab === "overview" && (
        <div className="ai-section">
          <div className="ai-section-head">
            <span>🔭 System Overview</span>
            <button className="ai-run-btn" onClick={runAnalyst} disabled={analLoading}>
              {analLoading ? "⏳ Analysing…" : "🔬 Run Deep Analysis"}
            </button>
          </div>

          {/* Quick stats */}
          <div className="pred-grid">
            <PredCard label="Current Level"   value={pct.toFixed(1)}       unit="%" icon="💧" color={SC[status]||"#3b82f6"}/>
            <PredCard label="ML Confidence"   value={mlData?.confidence_pct ?? "—"} unit="%" icon="🎯" color="#6366f1"/>
            <PredCard label="Rate of Change"  value={mlData?.rate_of_change ?? "—"} unit="%/min" icon="⚡" color="#f97316"/>
            <PredCard label="Efficiency"      value={mlData?.efficiency?.score ?? "—"} unit="/10" icon="⭐" color="#f59e0b"/>
          </div>

          {/* Real-time chart */}
          <div className="ai-chart-card">
            <div className="ai-chart-title">📡 Live Level + ML Prediction</div>
            {predSeries.length > 0
              ? <LineChart series={predSeries} height={150}/>
              : <div className="ai-empty">Collecting readings…</div>}
            {mlData?.ready && (
              <div className="ai-chart-legend">
                <span style={{color: SC[status]||"#3b82f6"}}>● Actual</span>
                <span style={{color: "#a855f7"}}>– – Predicted</span>
                {mlData.anomaly_detected && <span style={{color:"#ef4444"}}>⚠️ Anomaly</span>}
              </div>
            )}
          </div>

          {/* Analyst output */}
          {(analyst || analLoading) && (
            <div className="ai-chart-card">
              <div className="ai-chart-title">🔬 AI Water Analyst</div>
              <ReportViewer report={analyst} loading={analLoading} title="analysis"/>
            </div>
          )}
        </div>
      )}

      {/* ══ ML PREDICTION ══ */}
      {activeTab === "prediction" && (
        <div className="ai-section">
          <div className="ai-section-head">
            <span>🤖 ML Prediction Engine</span>
            <button className="ai-run-btn" onClick={fetchML}>🔄 Refresh</button>
          </div>

          {mlData?.ready ? (
            <>
              {/* Prediction horizon cards */}
              <div className="pred-grid">
                <PredCard label="In 5 min"  value={mlData.predicted?.["5min"]}  unit="%" icon="⏱️" color="#3b82f6"/>
                <PredCard label="In 15 min" value={mlData.predicted?.["15min"]} unit="%" icon="⏱️" color="#6366f1"/>
                <PredCard label="In 30 min" value={mlData.predicted?.["30min"]} unit="%" icon="⏱️" color="#8b5cf6"/>
                <PredCard label="In 60 min" value={mlData.predicted?.["60min"]} unit="%" icon="⏱️" color="#a855f7"/>
              </div>

              {/* ML stats */}
              <div className="ml-stats-grid">
                <div className="ml-stat"><span className="ml-stat-lbl">Trend</span><span className="ml-stat-val">{mlData.trend}</span></div>
                <div className="ml-stat"><span className="ml-stat-lbl">R² Score</span><span className="ml-stat-val">{mlData.r_squared}</span></div>
                <div className="ml-stat"><span className="ml-stat-lbl">Confidence</span><span className="ml-stat-val">{mlData.confidence_label} ({mlData.confidence_pct}%)</span></div>
                <div className="ml-stat"><span className="ml-stat-lbl">Time to LOW</span><span className="ml-stat-val">{mlData.mins_to_low_label || "—"}</span></div>
                <div className="ml-stat"><span className="ml-stat-lbl">Anomaly</span>
                  <span className="ml-stat-val" style={{color: mlData.anomaly_detected?"#ef4444":"#22c55e"}}>
                    {mlData.anomaly_detected ? `⚠️ Yes (z=${mlData.z_score})` : "✅ None"}
                  </span>
                </div>
                <div className="ml-stat"><span className="ml-stat-lbl">Data Window</span><span className="ml-stat-val">{mlData.data_window_min} min</span></div>
              </div>

              {/* Holt forecast chart */}
              <div className="ai-chart-card">
                <div className="ai-chart-title">📊 Holt Double Exponential Forecast (next 10 readings)</div>
                <LineChart series={holtSeries} height={130}/>
              </div>

              {/* Actual vs Predicted */}
              <div className="ai-chart-card">
                <div className="ai-chart-title">🎯 Actual vs Predicted Level</div>
                <LineChart series={predSeries} height={150}/>
              </div>
            </>
          ) : (
            <div className="ai-empty">
              {mlData?.message || "Warming up ML engine — collecting sensor readings…"}
              <br/><small style={{color:"#94a3b8",marginTop:8,display:"block"}}>Need 5+ readings. Wait a moment then click Refresh.</small>
            </div>
          )}
        </div>
      )}

      {/* ══ FORECAST ══ */}
      {activeTab === "forecast" && (
        <div className="ai-section">
          <div className="ai-section-head">
            <span>📈 7-Day Usage Forecast</span>
            <button className="ai-run-btn" onClick={fetchML}>🔄 Refresh</button>
          </div>

          <div className="ai-chart-card">
            <div className="ai-chart-title">📅 Predicted Daily Water Usage (next 7 days)</div>
            <BarChart data={fcBarData} color="#3b82f6" height={130}/>
            <p style={{fontSize:11,color:"#94a3b8",marginTop:8,textAlign:"center"}}>
              Method: Holt Double Exponential Smoothing · Unit: Litres
            </p>
          </div>

          {mlData?.ready && (
            <div className="ai-chart-card">
              <div className="ai-chart-title">📉 Consumption Rate History</div>
              <div className="ml-stats-grid">
                <div className="ml-stat"><span className="ml-stat-lbl">Daily Est.</span><span className="ml-stat-val">{mlData.sustainability?.daily_L} L</span></div>
                <div className="ml-stat"><span className="ml-stat-lbl">Weekly Est.</span><span className="ml-stat-val">{mlData.sustainability?.weekly_L} L</span></div>
                <div className="ml-stat"><span className="ml-stat-lbl">Monthly Est.</span><span className="ml-stat-val">{mlData.sustainability?.monthly_L} L</span></div>
                <div className="ml-stat"><span className="ml-stat-lbl">Fill Cycles</span><span className="ml-stat-val">{fillCycles?.length || 0}</span></div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══ SUSTAINABILITY ══ */}
      {activeTab === "sustainability" && (
        <div className="ai-section">
          <div className="ai-section-head">
            <span>🌱 Sustainability & Environmental Impact</span>
          </div>

          <SustainPanel data={mlData?.sustainability}/>

          {mlData?.efficiency && (
            <div className="ai-chart-card" style={{marginTop:16}}>
              <div className="ai-chart-title">⭐ Efficiency Score</div>
              <div style={{textAlign:"center",padding:"20px 0"}}>
                <div style={{fontSize:52,fontWeight:900,color:"#f59e0b"}}>{mlData.efficiency.score}</div>
                <div style={{fontSize:14,color:"#64748b",marginTop:4}}>{mlData.efficiency.label}</div>
                <div style={{marginTop:16,height:16,background:"#f1f5f9",borderRadius:8,overflow:"hidden"}}>
                  <div style={{
                    height:"100%",
                    width:`${(mlData.efficiency.score/10)*100}%`,
                    background:"linear-gradient(90deg,#22c55e,#f59e0b,#ef4444)",
                    borderRadius:8,
                    transition:"width 1s ease"
                  }}/>
                </div>
                <div style={{fontSize:11,color:"#94a3b8",marginTop:6}}>Score out of 10 — based on fill consistency and consumption rate</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══ REPORTS ══ */}
      {activeTab === "reports" && (
        <div className="ai-section">
          <div className="ai-section-head"><span>📋 AI Reports</span></div>

          <div className="reports-grid">
            {/* Daily Report */}
            <div className="ai-chart-card">
              <div className="ai-chart-title" style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span>📋 Daily Report</span>
                <button className="ai-run-btn ai-run-sm" onClick={genDaily} disabled={dailyLd}>
                  {dailyLd ? "⏳" : "Generate"}
                </button>
              </div>
              <ReportViewer report={dailyRep} loading={dailyLd} title="Daily Report"/>
            </div>

            {/* Weekly Report */}
            <div className="ai-chart-card">
              <div className="ai-chart-title" style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span>📈 Weekly Report</span>
                <button className="ai-run-btn ai-run-sm" onClick={genWeekly} disabled={weeklyLd}>
                  {weeklyLd ? "⏳" : "Generate"}
                </button>
              </div>
              <ReportViewer report={weeklyRep} loading={weeklyLd} title="Weekly Report"/>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}