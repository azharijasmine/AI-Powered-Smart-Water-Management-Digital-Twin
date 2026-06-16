// ═══════════════════════════════════════════════════════════════════
//  PUMP DIGITAL TWIN PANEL
//  ▼ PASTE THIS ENTIRE BLOCK inside DigitalTwin.jsx ▼
//    Paste it ABOVE the `export default function DigitalTwin` line
// ═══════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from "react";

const BACKEND = "http://localhost:8000";

// ── Rotating pump impeller SVG ───────────────────────────────────
function PumpImpeller({ spinning, color }) {
  return (
    <svg viewBox="0 0 80 80" width="80" height="80"
         style={{ display: "block", margin: "0 auto" }}>
      <defs>
        <radialGradient id="impGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor={color} stopOpacity="0.9"/>
          <stop offset="100%" stopColor={color} stopOpacity="0.3"/>
        </radialGradient>
      </defs>
      {/* Housing */}
      <circle cx="40" cy="40" r="36" fill="#1e293b" stroke={color}
              strokeWidth="2" opacity="0.9"/>
      {/* Spinning group */}
      <g style={{
        transformOrigin: "40px 40px",
        animation: spinning ? "pumpSpin 0.6s linear infinite" : "none",
      }}>
        {/* 4 blades */}
        {[0, 90, 180, 270].map(deg => (
          <ellipse key={deg}
            cx="40" cy="24" rx="5" ry="14"
            fill="url(#impGrad)"
            style={{
              transformOrigin: "40px 40px",
              transform: `rotate(${deg}deg)`,
            }}
          />
        ))}
        {/* Centre hub */}
        <circle cx="40" cy="40" r="7" fill={color} opacity="0.9"/>
        <circle cx="40" cy="40" r="3" fill="white" opacity="0.7"/>
      </g>
      {/* Inline CSS for spin keyframe */}
      <style>{`@keyframes pumpSpin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </svg>
  );
}

// ── Pipe flow animation ───────────────────────────────────────────
function FlowPipe({ active, color }) {
  return (
    <svg viewBox="0 0 200 30" width="100%" height="30"
         style={{ overflow: "visible" }}>
      {/* Pipe body */}
      <rect x="0" y="10" width="200" height="10" rx="5"
            fill="#1e293b" stroke={color + "66"} strokeWidth="1"/>
      {/* Animated dashes */}
      {active && (
        <rect x="0" y="12" width="200" height="6" rx="3"
              fill="none" stroke={color} strokeWidth="3"
              strokeDasharray="20 10"
              style={{ animation: "flowAnim 0.8s linear infinite" }}/>
      )}
      <style>{`@keyframes flowAnim { from{stroke-dashoffset:0} to{stroke-dashoffset:-30} }`}</style>
    </svg>
  );
}

// ════════════════════════════════════════════════════════════════
//  MAIN PUMP PANEL COMPONENT
// ════════════════════════════════════════════════════════════════
export function PumpPanel({ sensor, connected }) {
  const [pumpData, setPumpData] = useState({
    pump: "OFF", pumpMode: "AUTO", relay: false,
  });
  const [loading, setLoading] = useState(false);
  const [lastAck,  setLastAck]  = useState("");

  // Poll pump status every 3 s
  const fetchPump = useCallback(async () => {
    try {
      const r = await fetch(`${BACKEND}/api/pump/status`);
      const d = await r.json();
      setPumpData(d);
    } catch {}
  }, []);

  useEffect(() => {
    fetchPump();
    const iv = setInterval(fetchPump, 3000);
    return () => clearInterval(iv);
  }, [fetchPump]);

  // Handle pump_updated WebSocket event
  useEffect(() => {
    // DigitalTwin.jsx already has the WS — listen via prop update
    if (sensor?.pump) {
      setPumpData(p => ({
        ...p,
        pump:     sensor.pump,
        pumpMode: sensor.pumpMode || p.pumpMode,
        relay:    sensor.relay    || p.relay,
      }));
    }
  }, [sensor]);

  async function sendCmd(cmd) {
    setLoading(true);
    try {
      const r = await fetch(`${BACKEND}/api/pump/control`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ command: cmd }),
      });
      const d = await r.json();
      if (d.success) {
        setPumpData(p => ({ ...p, pump: d.pump, pumpMode: d.pumpMode }));
        setLastAck(`✅ ${cmd} acknowledged`);
        setTimeout(() => setLastAck(""), 2500);
      }
    } catch { setLastAck("❌ Backend offline"); }
    setLoading(false);
  }

  const isRunning = pumpData.pump === "ON" || pumpData.relay === true;
  const isAuto    = pumpData.pumpMode === "AUTO";
  const color     = isRunning ? "#22c55e" : "#94a3b8";
  const statusLabel =
    pumpData.pumpMode === "AUTO"
      ? `AUTO — pump ${isRunning ? "ON" : "OFF"}`
      : `MANUAL — ${pumpData.pump}`;

  return (
    <div className="dt-card" style={{ marginTop: 16 }}>
      {/* ── Title ── */}
      <div className="dt-card-title">⚙️ Pump Digital Twin</div>

      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-start" }}>

        {/* ── Left: animated impeller ── */}
        <div style={{ flex: "0 0 auto", textAlign: "center", minWidth: 120 }}>
          <PumpImpeller spinning={isRunning} color={color}/>
          <div style={{
            marginTop: 8, fontSize: 11, fontWeight: 700,
            color, textTransform: "uppercase", letterSpacing: "0.06em",
          }}>
            {isRunning ? "● RUNNING" : "○ STOPPED"}
          </div>

          {/* Relay indicator */}
          <div style={{
            marginTop: 6, display: "inline-flex", alignItems: "center", gap: 6,
            background: (isRunning ? "#22c55e" : "#94a3b8") + "18",
            border: `1px solid ${(isRunning ? "#22c55e" : "#94a3b8")}44`,
            borderRadius: 8, padding: "4px 10px", fontSize: 10, fontWeight: 700,
            color: isRunning ? "#22c55e" : "#94a3b8",
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: "50%",
              background: isRunning ? "#22c55e" : "#94a3b8",
              display: "inline-block",
              animation: isRunning ? "pulse 1s ease-in-out infinite" : "none",
            }}/>
            RELAY {isRunning ? "CLOSED" : "OPEN"}
          </div>

          <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}`}</style>
        </div>

        {/* ── Centre: pipe + status ── */}
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ marginBottom: 6, fontSize: 11, color: "#64748b", fontWeight: 600 }}>
            WATER FLOW
          </div>
          <FlowPipe active={isRunning} color={color}/>

          <div style={{
            marginTop: 12, background: color + "12",
            border: `1px solid ${color}33`, borderRadius: 10,
            padding: "10px 14px",
          }}>
            <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600,
                          textTransform: "uppercase", letterSpacing: "0.05em" }}>
              STATUS
            </div>
            <div style={{ fontSize: 15, fontWeight: 800, color, marginTop: 3 }}>
              {statusLabel}
            </div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>
              Tank: {parseFloat(sensor?.percentage || 0).toFixed(1)}% — {sensor?.status || "—"}
            </div>
          </div>

          {lastAck && (
            <div style={{ marginTop: 8, fontSize: 11, color: "#22c55e", fontWeight: 600 }}>
              {lastAck}
            </div>
          )}
        </div>

        {/* ── Right: control buttons ── */}
        <div style={{ flex: "0 0 auto", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600,
                        textTransform: "uppercase", marginBottom: 2 }}>
            CONTROLS
          </div>
          {[
            { cmd: "ON",   label: "⚡ Pump ON",   active: pumpData.pump === "ON"   && !isAuto, color: "#22c55e" },
            { cmd: "OFF",  label: "⏹ Pump OFF",   active: pumpData.pump === "OFF"  && !isAuto, color: "#ef4444" },
            { cmd: "AUTO", label: "🔄 Auto Mode", active: isAuto,                              color: "#3b82f6" },
          ].map(({ cmd, label, active, color: bc }) => (
            <button
              key={cmd}
              disabled={loading || !connected}
              onClick={() => sendCmd(cmd)}
              style={{
                padding: "8px 18px", borderRadius: 8, cursor: loading ? "wait" : "pointer",
                fontWeight: 700, fontSize: 12, border: `2px solid ${bc}`,
                background: active ? bc : "transparent",
                color:      active ? "white" : bc,
                opacity:    (!connected || loading) ? 0.5 : 1,
                transition: "all 0.15s",
              }}
            >
              {label}
            </button>
          ))}

          {!connected && (
            <div style={{ fontSize: 10, color: "#ef4444", marginTop: 4 }}>
              ⚠️ Backend offline
            </div>
          )}
        </div>
      </div>

      {/* ── Hardware mapping legend ── */}
      <div style={{
        marginTop: 16, padding: "10px 14px",
        background: "#f8fafc", borderRadius: 10,
        border: "1px solid #f1f5f9", fontSize: 11,
        display: "flex", gap: 24, flexWrap: "wrap",
      }}>
        {[
          ["🔷 Arduino Pin 9", "→ Relay IN"],
          ["⚡ Relay Module",   "→ DC Pump Switch"],
          ["📡 Ultrasonic",    "→ Tank Water Level"],
          ["🔄 Auto Mode",     "→ ON < 30% | OFF > 90%"],
        ].map(([k, v]) => (
          <div key={k}>
            <span style={{ fontWeight: 700, color: "#475569" }}>{k} </span>
            <span style={{ color: "#94a3b8" }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}