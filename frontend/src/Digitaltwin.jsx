// ════════════════════════════════════════════════════════════════
//  DigitalTwin.jsx — Smart Water Monitor Digital Twin
//  Drop-in component: receives live `sensor` + `thresholds` props
//  from App.jsx — NO backend changes required.
// ════════════════════════════════════════════════════════════════

import { useEffect, useRef, useState } from "react";

// ── Utility: clamp ──────────────────────────────────────────────
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ── Colour by status ────────────────────────────────────────────
function statusColor(status) {
  return { OVERFLOW: "#ef4444", FULL: "#f97316", MEDIUM: "#3b82f6", LOW: "#22c55e" }[status] || "#3b82f6";
}

// ════════════════════════════════════════════════════════════════
//  ANIMATED WATER CANVAS  (HTML5 Canvas wave simulation)
// ════════════════════════════════════════════════════════════════
function WaterCanvas({ pct, status }) {
  const canvasRef = useRef(null);
  const animRef   = useRef(null);
  const tRef      = useRef(0);
  const color     = statusColor(status);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;

    function draw() {
      ctx.clearRect(0, 0, W, H);
      tRef.current += 0.03;
      const t     = tRef.current;
      const level = H * (1 - clamp(pct, 0, 100) / 100);

      [0, Math.PI * 0.6].forEach((offset, idx) => {
        ctx.beginPath();
        ctx.moveTo(0, level);
        for (let x = 0; x <= W; x++) {
          const y = level + Math.sin((x / W) * Math.PI * 4 + t + offset) * 6
                          + Math.sin((x / W) * Math.PI * 6 + t * 1.3 + offset) * 3;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(W, H);
        ctx.lineTo(0, H);
        ctx.closePath();
        ctx.fillStyle = idx === 0 ? color + "cc" : color + "66";
        ctx.fill();
      });

      for (let i = 0; i < 4; i++) {
        const bx = ((Math.sin(t * 0.7 + i * 2.3) + 1) / 2) * W;
        const by = level + 10 + ((Math.cos(t * 0.5 + i * 1.7) + 1) / 2) * (H - level - 20);
        ctx.beginPath();
        ctx.arc(bx, by, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.35)";
        ctx.fill();
      }

      animRef.current = requestAnimationFrame(draw);
    }
    draw();
    return () => cancelAnimationFrame(animRef.current);
  }, [pct, status]);

  return (
    <canvas
      ref={canvasRef}
      width={200}
      height={300}
      style={{ width: "100%", height: "100%", display: "block", borderRadius: "0 0 12px 12px" }}
    />
  );
}

// ════════════════════════════════════════════════════════════════
//  3D ISOMETRIC TANK SVG
// ════════════════════════════════════════════════════════════════
function IsoTank({ pct, status }) {
  const color  = statusColor(status);
  const fillH  = clamp(pct, 0, 100);
  const tankH  = 120;
  const waterY = tankH * (1 - fillH / 100);

  return (
    <svg viewBox="0 0 160 200" xmlns="http://www.w3.org/2000/svg"
         style={{ width: "100%", maxWidth: 220, filter: "drop-shadow(0 8px 24px rgba(0,0,0,.18))" }}>
      <defs>
        <linearGradient id="tankBody" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="#e2e8f0"/>
          <stop offset="100%" stopColor="#cbd5e1"/>
        </linearGradient>
        <linearGradient id="tankTop" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#f1f5f9"/>
          <stop offset="100%" stopColor="#e2e8f0"/>
        </linearGradient>
        <linearGradient id="waterGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity="0.9"/>
          <stop offset="100%" stopColor={color} stopOpacity="0.6"/>
        </linearGradient>
        <clipPath id="tankClip">
          <rect x="30" y="40" width="100" height={tankH} rx="4"/>
        </clipPath>
      </defs>

      <rect x="30" y="40" width="100" height={tankH} rx="6"
            fill="url(#tankBody)" stroke="#94a3b8" strokeWidth="1.5"/>

      <g clipPath="url(#tankClip)">
        <rect x="30" y={40 + waterY} width="100" height={tankH - waterY}
              fill="url(#waterGrad)"/>
        {pct > 0 && <WaveLine y={40 + waterY} color={color}/>}
      </g>

      <rect x="34" y="44" width="14" height={tankH - 8} rx="3"
            fill="rgba(255,255,255,0.22)"/>
      <ellipse cx="80" cy="40" rx="50" ry="10" fill="url(#tankTop)" stroke="#94a3b8" strokeWidth="1.5"/>
      <rect x="72" y="28" width="16" height="14" rx="3" fill="#94a3b8"/>
      <ellipse cx="80" cy="28" rx="8" ry="4" fill="#cbd5e1"/>
      <rect x="60" y={40 + tankH} width="40" height="8" rx="3" fill="#94a3b8"/>
      <rect x="74" y={40 + tankH + 8} width="12" height="20" rx="3" fill="#94a3b8"/>

      <text x="80" y={40 + waterY - 8}
            textAnchor="middle" fontSize="13" fontWeight="800"
            fill={pct > 15 ? "white" : color}
            style={{ textShadow: "0 1px 4px rgba(0,0,0,.4)" }}>
        {Math.round(pct)}%
      </text>

      <rect x="22" y="168" width="116" height="20" rx="6" fill={color} opacity="0.15"/>
      <text x="80" y="182" textAnchor="middle" fontSize="10" fontWeight="700" fill={color}>
        {status}
      </text>

      {[0, 25, 50, 75, 100].map(lvl => {
        const ty = 40 + tankH * (1 - lvl / 100);
        return (
          <g key={lvl}>
            <line x1="130" y1={ty} x2="138" y2={ty} stroke="#94a3b8" strokeWidth="1"/>
            <text x="142" y={ty + 3.5} fontSize="7" fill="#64748b">{lvl}%</text>
          </g>
        );
      })}
    </svg>
  );
}

function WaveLine({ y, color }) {
  const pts = [];
  for (let x = 30; x <= 130; x += 5) {
    const wy = y + Math.sin((x - 30) / 8) * 3;
    pts.push(`${x},${wy}`);
  }
  return <polyline points={pts.join(" ")} fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5"/>;
}

// ════════════════════════════════════════════════════════════════
//  ANIMATED GAUGE
// ════════════════════════════════════════════════════════════════
function Gauge({ value, max = 100, label, unit = "%", color }) {
  const r   = 54;
  const cx  = 70, cy = 70;
  const sa  = Math.PI * 0.75;
  const ea  = Math.PI * 2.25;
  const arc = ea - sa;
  const pct = clamp(value, 0, max) / max;
  const ang = sa + pct * arc;

  function polar(a, rr) {
    return { x: cx + rr * Math.cos(a), y: cy + rr * Math.sin(a) };
  }

  const trackStart = polar(sa, r);
  const trackEnd   = polar(ea, r);
  const fillEnd    = polar(ang, r);
  const needleTip  = polar(ang, r - 14);
  const needleBase = polar(ang + Math.PI, 10);

  function arcPath(a1, a2, rr, large) {
    const s = polar(a1, rr), e = polar(a2, rr);
    return `M${s.x},${s.y} A${rr},${rr} 0 ${large},1 ${e.x},${e.y}`;
  }

  const trackLarge = 1;
  const fillLarge  = pct * arc > Math.PI ? 1 : 0;

  return (
    <svg viewBox="0 0 140 100" style={{ width: "100%", maxWidth: 200, overflow: "visible" }}>
      <path d={arcPath(sa, ea, r, trackLarge)} fill="none" stroke="#e2e8f0" strokeWidth="10" strokeLinecap="round"/>
      {pct > 0 && (
        <path d={arcPath(sa, ang, r, fillLarge)} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"/>
      )}
      <line x1={needleBase.x} y1={needleBase.y} x2={needleTip.x} y2={needleTip.y}
            stroke={color} strokeWidth="2.5" strokeLinecap="round"/>
      <circle cx={cx} cy={cy} r="5" fill={color}/>
      <circle cx={cx} cy={cy} r="2" fill="white"/>
      <text x={cx} y={cy + 22} textAnchor="middle" fontSize="14" fontWeight="800" fill="#0f172a">
        {typeof value === "number" ? value.toFixed(value < 10 ? 2 : 1) : "—"}
      </text>
      <text x={cx} y={cy + 33} textAnchor="middle" fontSize="7" fill="#64748b">{unit}</text>
      <text x={cx} y={cy - 44} textAnchor="middle" fontSize="8" fontWeight="600" fill="#475569">{label}</text>
    </svg>
  );
}

// ════════════════════════════════════════════════════════════════
//  LIVE SPARKLINE
// ════════════════════════════════════════════════════════════════
function Sparkline({ data, color, height = 48 }) {
  if (!data || data.length < 2) return <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: 11 }}>Collecting…</div>;
  const W = 260, H = height;
  const mn = Math.min(...data), mx = Math.max(...data);
  const range = mx - mn || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - ((v - mn) / range) * (H - 8) - 4;
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height }} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`spark-${color.replace("#","")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3"/>
          <stop offset="100%" stopColor={color} stopOpacity="0.02"/>
        </linearGradient>
      </defs>
      <polyline points={`0,${H} ${pts} ${W},${H}`}
        fill={`url(#spark-${color.replace("#","")})`} stroke="none"/>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round"/>
      {data.length > 0 && (() => {
        const last = pts.split(" ").pop().split(",");
        return <circle cx={last[0]} cy={last[1]} r="3.5" fill={color}/>;
      })()}
    </svg>
  );
}

// ════════════════════════════════════════════════════════════════
//  SENSOR CARD
// ════════════════════════════════════════════════════════════════
function SensorCard({ icon, label, value, unit, color, sparkData }) {
  return (
    <div className="dt-sensor-card">
      <div className="dt-sensor-icon" style={{ background: color + "18", color }}>
        {icon}
      </div>
      <div className="dt-sensor-body">
        <div className="dt-sensor-label">{label}</div>
        <div className="dt-sensor-value" style={{ color }}>
          {value ?? "—"} <span className="dt-sensor-unit">{unit}</span>
        </div>
        {sparkData && <Sparkline data={sparkData} color={color} height={36}/>}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
//  STATUS TIMELINE
// ════════════════════════════════════════════════════════════════
function StatusTimeline({ events }) {
  if (!events || events.length === 0)
    return <div className="dt-empty">No state transitions yet — waiting for LOW ↔ HIGH cycles.</div>;

  const recent = [...events].reverse().slice(0, 8);
  return (
    <div className="dt-timeline">
      {recent.map((ev, i) => {
        const isHigh = ev.type === "HIGH";
        const color  = isHigh ? "#f97316" : "#22c55e";
        return (
          <div key={i} className="dt-tl-row">
            <div className="dt-tl-dot" style={{ background: color }}/>
            <div className="dt-tl-line" style={{ background: i < recent.length - 1 ? "#e2e8f0" : "transparent" }}/>
            <div className="dt-tl-content">
              <span className="dt-tl-type" style={{ color }}>{ev.type}</span>
              <span className="dt-tl-pct">{ev.percentage}%</span>
              <span className="dt-tl-time">{ev.date} {ev.time}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
//  THRESHOLD VISUALISER
// ════════════════════════════════════════════════════════════════
function ThresholdBar({ pct, thresholds }) {
  const zones = [
    { from: 0,                    to: thresholds.low,    label: "LOW",      color: "#22c55e44" },
    { from: thresholds.low,       to: thresholds.medium, label: "MEDIUM",   color: "#3b82f644" },
    { from: thresholds.medium,    to: thresholds.high,   label: "FULL",     color: "#f9731644" },
    { from: thresholds.high,      to: 100,               label: "OVERFLOW", color: "#ef444444" },
  ];

  return (
    <div className="dt-thresh-wrap">
      <div className="dt-thresh-bar">
        {zones.map((z, i) => (
          <div key={i} className="dt-thresh-zone"
               style={{ width: `${z.to - z.from}%`, background: z.color, position: "relative" }}>
            <span className="dt-thresh-zone-lbl">{z.label}</span>
          </div>
        ))}
        <div className="dt-thresh-ptr" style={{ left: `${clamp(pct, 0, 100)}%` }}>
          <div className="dt-thresh-ptr-arrow"/>
          <div className="dt-thresh-ptr-val">{pct.toFixed(1)}%</div>
        </div>
      </div>
      <div className="dt-thresh-ticks">
        {[0, thresholds.low, thresholds.medium, thresholds.high, 100].map(v => (
          <span key={v} style={{ left: `${v}%` }}>{v}%</span>
        ))}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
//  SYSTEM HEALTH PANEL
// ════════════════════════════════════════════════════════════════
function HealthRow({ label, value, ok }) {
  return (
    <div className="dt-health-row">
      <span className="dt-health-dot" style={{ background: ok ? "#22c55e" : "#ef4444" }}/>
      <span className="dt-health-label">{label}</span>
      <span className="dt-health-val">{value}</span>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
//  ✅ FIXED: getPumpState — uses actual sensor.pump field from Arduino
//
//  Arduino sends:   pump="ON"  when RELAY_PIN=LOW  (relay CLOSED → pump running)
//                   pump="OFF" when RELAY_PIN=HIGH (relay OPEN  → pump stopped)
//
//  So:
//    pump="ON"  → relay CLOSED → impeller spins  → label "ON"
//    pump="OFF" → relay OPEN   → impeller stops  → label "OFF"
//
//  The `status` field is only used as a FALLBACK when sensor.pump is not yet available.
// ════════════════════════════════════════════════════════════════
function getPumpState(sensorPumpField, status) {
  // PRIMARY: use the actual pump field sent by Arduino ("ON" / "OFF")
  if (sensorPumpField === "ON")  return { on: true,  label: "ON",   relay: "CLOSED" };
  if (sensorPumpField === "OFF") return { on: false, label: "OFF",  relay: "OPEN"   };

  // FALLBACK: derive from tank status (Arduino logic: LOW→ON, FULL/OVERFLOW→OFF, MEDIUM→OFF)
  if (status === "LOW")                           return { on: true,  label: "ON",   relay: "CLOSED" };
  if (status === "FULL" || status === "OVERFLOW") return { on: false, label: "OFF",  relay: "OPEN"   };
  // MEDIUM: pump stays OFF (relay OPEN) per Arduino controlPump()
  return                                                 { on: false, label: "OFF",  relay: "OPEN"   };
}

// ════════════════════════════════════════════════════════════════
//  BATTERY-STYLE SVG TANK
// ════════════════════════════════════════════════════════════════
function BatteryTank({ pct, status, pumpOn }) {
  const color = { OVERFLOW:"#ef4444", FULL:"#ef4444", MEDIUM:"#3b82f6", LOW:"#22c55e" }[status] || "#22c55e";
  const tankW = 220, tankH = 310;
  const fillH = Math.max(4, (pct / 100) * tankH);
  const fillY = tankH - fillH;

  const svgRef  = useRef(null);
  const animRef = useRef(null);
  const tRef    = useRef(0);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    function tick() {
      tRef.current += 0.04;
      const t = tRef.current;
      const pts = [];
      for (let x = 0; x <= tankW; x += 4) {
        const y = fillY + Math.sin((x / tankW) * Math.PI * 5 + t) * 5
                        + Math.sin((x / tankW) * Math.PI * 3 + t * 1.4) * 3;
        pts.push(`${x},${y}`);
      }
      const wavePath = el.querySelector("#wave-path");
      const fillRect = el.querySelector("#fill-rect");
      if (wavePath) {
        wavePath.setAttribute("d",
          `M0,${fillY} ` + pts.map(p => `L${p}`).join(" ") + ` L${tankW},${tankH} L0,${tankH} Z`
        );
      }
      if (fillRect) fillRect.setAttribute("y", fillY);
      animRef.current = requestAnimationFrame(tick);
    }
    tick();
    return () => cancelAnimationFrame(animRef.current);
  }, [pct, status]);

  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:12 }}>
      <svg ref={svgRef} width={tankW+20} height={tankH+80} viewBox={`-10 -50 ${tankW+20} ${tankH+80}`}>
        <defs>
          <linearGradient id="tankGlass" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stopColor="#e8f4fd" stopOpacity="0.9"/>
            <stop offset="60%"  stopColor="#f0f9ff" stopOpacity="0.95"/>
            <stop offset="100%" stopColor="#dde8f0" stopOpacity="0.85"/>
          </linearGradient>
          <linearGradient id={`fillGrad-${status}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={color} stopOpacity="0.85"/>
            <stop offset="100%" stopColor={color} stopOpacity="0.95"/>
          </linearGradient>
          <clipPath id="tankBodyClip">
            <rect x="0" y="0" width={tankW} height={tankH} rx="22"/>
          </clipPath>
          <filter id="glowFx">
            <feGaussianBlur stdDeviation="3" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>

        <rect x={tankW/2-18} y={-34} width={36} height={28} rx={8}
              fill="#d1dde8" stroke="#b8cad6" strokeWidth="1.5"/>
        <rect x={tankW/2-12} y={-30} width={24} height={18} rx={5}
              fill="#e8f2f8" stroke="#c5d5e0" strokeWidth="1"/>

        <rect x="0" y="0" width={tankW} height={tankH} rx="22"
              fill="url(#tankGlass)" stroke="#c8d8e4" strokeWidth="2.5"
              style={{ filter:"drop-shadow(0 8px 24px rgba(100,160,200,.22))" }}/>

        <g clipPath="url(#tankBodyClip)">
          <rect id="fill-rect" x="0" y={fillY} width={tankW} height={tankH}
                fill={`url(#fillGrad-${status})`} opacity="0.92"/>
          <path id="wave-path" fill={color} opacity="0.7" stroke="none"/>
          <rect x="12" y={fillY+2} width={tankW-24} height="6" rx="3"
                fill="rgba(255,255,255,0.4)" opacity="0.7"/>
          {pct > 5 && [0,1,2,3].map(i => (
            <circle key={i}
              cx={30 + i * 52}
              cy={fillY + 20 + (i % 2) * 18}
              r={3 + i % 2}
              fill="rgba(255,255,255,0.35)"
            />
          ))}
        </g>

        <rect x="10" y="14" width="18" height={tankH-28} rx="9"
              fill="rgba(255,255,255,0.3)" clipPath="url(#tankBodyClip)"/>

        {[0,25,50,75,100].map(lvl => {
          const ty = (tankH * (1 - lvl/100));
          const isActive = pct >= lvl;
          return (
            <g key={lvl}>
              <line x1={tankW+2} y1={ty} x2={tankW+14} y2={ty}
                    stroke={isActive ? color : "#b0c4d0"} strokeWidth={lvl%50===0?2:1}/>
              <text x={tankW+18} y={ty+4} fontSize="10"
                    fill={isActive ? color : "#94a3b8"} fontWeight={isActive?"700":"400"}>
                {lvl}%
              </text>
            </g>
          );
        })}

        <text x={tankW/2} y={tankH/2 - 16} textAnchor="middle"
              fontSize="52" fontWeight="900"
              fill={pct > 40 ? "rgba(255,255,255,0.97)" : "#1e3a4a"}
              style={{ letterSpacing:"-2px", textShadow:"0 2px 12px rgba(0,0,0,.18)" }}>
          {pct.toFixed(1)}%
        </text>
        <text x={tankW/2} y={tankH/2 + 18} textAnchor="middle"
              fontSize="18" fontWeight="700" letterSpacing="3"
              fill={pct > 40 ? "rgba(255,255,255,0.82)" : "#2d5a70"}>
          {status}
        </text>

        <rect x={tankW/2-16} y={tankH} width={32} height={22} rx={6}
              fill="#c4d4de" stroke="#b0c4d0" strokeWidth="1.5"/>
        <rect x={tankW/2-10} y={tankH+22} width={20} height={14} rx={4}
              fill="#b8c8d4" stroke="#a4b8c6" strokeWidth="1"/>

        {/* ✅ FIXED: Pipe flow only animates when pump is actually ON */}
        <rect x={tankW} y={tankH/2-8} width={60} height={16} rx={6}
              fill="#c8d8e4" stroke="#b4c8d4" strokeWidth="1.5"/>
        {pumpOn && [0,1,2,3,4].map(i => (
          <rect key={i} x={tankW+10+i*10} y={tankH/2-2} width={6} height={4} rx={1}
                fill="#60a5fa" opacity="0.7">
            <animateTransform attributeName="transform" type="translate"
              values="0,0; 10,0; 0,0" dur={`${0.6+i*0.1}s`} repeatCount="indefinite"/>
          </rect>
        ))}
      </svg>

      <div style={{
        background:"white", border:"2px solid #dde8f0", borderRadius:"999px",
        padding:"10px 36px", fontSize:15, fontWeight:700, letterSpacing:"2px",
        color:"#334155", boxShadow:"0 2px 8px rgba(100,140,180,.12)"
      }}>
        WATER TANK
      </div>

      <div style={{ display:"flex", gap:20, alignItems:"center" }}>
        {[["#22c55e","LOW"],["#3b82f6","MEDIUM"],["#ef4444","FULL/OVERFLOW"]].map(([c,l])=>(
          <span key={l} style={{ display:"flex", alignItems:"center", gap:5,
            fontSize:11, fontWeight:700, color:"#475569" }}>
            <span style={{ width:8,height:8,borderRadius:"50%",background:c, flexShrink:0 }}/>
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
//  ✅ FIXED: DC Pump SVG — impeller ONLY spins when pumpOn=true
//     (which is now driven by the real sensor.pump field)
// ════════════════════════════════════════════════════════════════
function DCPump({ pumpOn, fsmState }) {
  const animRef = useRef(null);
  const impRef  = useRef(null);
  const angRef  = useRef(0);
  const speed   = pumpOn ? 6 : 0;   // 0 = stopped, 6 = spinning

  useEffect(() => {
    function tick() {
      // Only rotate when pump is ON
      if (pumpOn && impRef.current) {
        angRef.current = (angRef.current + speed) % 360;
        impRef.current.setAttribute("transform",
          `rotate(${angRef.current}, 80, 80)`);
      }
      animRef.current = requestAnimationFrame(tick);
    }
    tick();
    return () => cancelAnimationFrame(animRef.current);
  }, [pumpOn]);

  // ✅ FIXED relay states:
  //   pumpOn=true  → relay CLOSED (current flows → motor runs)
  //   pumpOn=false → relay OPEN   (no current → motor stopped)
  const ringColor = pumpOn ? "#22c55e" : "#94a3b8";
  const ringGlow  = pumpOn
    ? "drop-shadow(0 0 10px rgba(34,197,94,.55))"
    : "drop-shadow(0 2px 6px rgba(0,0,0,.10))";

  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:0 }}>
      <div style={{ fontSize:13, fontWeight:700, letterSpacing:"2px",
        color:"#475569", marginBottom:8, textTransform:"uppercase" }}>
        DC PUMP
      </div>

      <svg width="220" height="200" viewBox="0 0 220 200"
           style={{ filter: ringGlow }}>
        <defs>
          <radialGradient id="pumpBodyGrad" cx="50%" cy="40%">
            <stop offset="0%"   stopColor="#f0f4f8"/>
            <stop offset="100%" stopColor="#dde4ec"/>
          </radialGradient>
          <radialGradient id="pumpInnerGrad" cx="40%" cy="35%">
            <stop offset="0%"   stopColor="#e8eef4"/>
            <stop offset="100%" stopColor="#c8d4de"/>
          </radialGradient>
        </defs>

        <rect x="-2" y="72" width="22" height="16" rx="5"
              fill="#c8d4de" stroke="#b4c4ce" strokeWidth="1.5"/>

        <circle cx="80" cy="80" r="72" fill="url(#pumpBodyGrad)"
                stroke={ringColor} strokeWidth="3"/>
        <circle cx="80" cy="80" r="64" fill="url(#pumpInnerGrad)"
                stroke="#c8d8e4" strokeWidth="1.5"/>

        {/* ✅ Impeller group — ref used to rotate via rAF only when pumpOn */}
        <g ref={impRef}>
          {[0,60,120,180,240,300].map(angle => {
            const rad = (angle * Math.PI) / 180;
            const x1  = 80 + 10 * Math.cos(rad);
            const y1  = 80 + 10 * Math.sin(rad);
            const x2  = 80 + 48 * Math.cos(rad);
            const y2  = 80 + 48 * Math.sin(rad);
            return (
              <line key={angle} x1={x1} y1={y1} x2={x2} y2={y2}
                    stroke={pumpOn ? "#94a3b8" : "#b0bec8"}
                    strokeWidth="9" strokeLinecap="round"/>
            );
          })}
          <circle cx="80" cy="80" r="14" fill="#e0e8f0" stroke="#b4c4ce" strokeWidth="2"/>
          <circle cx="80" cy="80" r="5"  fill="#94a3b8"/>
        </g>

        <rect x="152" y="72" width="34" height="16" rx="5"
              fill="#c8d4de" stroke="#b4c4ce" strokeWidth="1.5"/>
        <rect x="184" y="68" width="20" height="24" rx="5"
              fill="#d4dfe8" stroke="#b4c4ce" strokeWidth="1.5"/>

        {/* ✅ Glow ring pulses ONLY when pump is ON */}
        {pumpOn && (
          <circle cx="80" cy="80" r="72" fill="none"
                  stroke="#22c55e" strokeWidth="4" opacity="0.35">
            <animate attributeName="opacity" values="0.35;0.08;0.35"
                     dur="1.4s" repeatCount="indefinite"/>
          </circle>
        )}

        {/* ✅ FIXED: Relay label now correctly matches pump state
              pumpOn=true  → relay CLOSED (coil energised, contacts close)
              pumpOn=false → relay OPEN   (no power, contacts open)       */}
        <rect x="22" y="162" width="116" height="42" rx="10"
              fill="white" stroke="#dde4ec" strokeWidth="1.5"/>
        <text x="80" y="179" textAnchor="middle" fontSize="9" fontWeight="600"
              fill="#94a3b8" letterSpacing="1">RELAY</text>
        <text x="80" y="196" textAnchor="middle" fontSize="14" fontWeight="900"
              fill={pumpOn ? "#22c55e" : "#ef4444"} letterSpacing="1">
          {pumpOn ? "CLOSED" : "OPEN"}
        </text>
      </svg>

      <div style={{
        background:"#f1f5f9", border:"2px solid #dde4ec",
        borderRadius:"12px", padding:"10px 32px", marginTop:4,
        textAlign:"center"
      }}>
        <div style={{ fontSize:10, fontWeight:700, letterSpacing:"1.5px",
          color:"#94a3b8", marginBottom:4, textTransform:"uppercase" }}>
          FSM STATE
        </div>
        <div style={{ fontSize:18, fontWeight:900, color:"#1e293b",
          letterSpacing:"2px" }}>
          {fsmState || "IDLE"}
        </div>
      </div>
    </div>
  );
}

// ── Pipe connection between tank and pump ──
function ConnectingPipe({ pumpOn, pct }) {
  const flowColor = pumpOn ? "#60a5fa" : "#c8d4de";
  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center",
      padding:"0 8px", marginTop:-30 }}>
      <svg width="140" height="36" viewBox="0 0 140 36">
        <rect x="0" y="10" width="140" height="16" rx="6"
              fill="#dde4ec" stroke="#c4d0da" strokeWidth="1.5"/>
        {/* ✅ Flow arrows only animate when pump is actually ON */}
        {pumpOn && [0,1,2,3,4,5].map(i => (
          <g key={i}>
            <rect x={8 + i*22} y="14" width="12" height="8" rx="2"
                  fill={flowColor} opacity="0.8">
              <animateTransform attributeName="transform" type="translate"
                values="0,0; 22,0; 0,0" dur={`${0.7}s`} begin={`${i*0.12}s`}
                repeatCount="indefinite"/>
            </rect>
          </g>
        ))}
        <rect x="0"   y="6"  width="12" height="24" rx="4" fill="#c4d0da"/>
        <rect x="128" y="6"  width="12" height="24" rx="4" fill="#c4d0da"/>
      </svg>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
//  ✅ FIXED: LiveTankPumpPanel — pump state now reads sensor.pump first
// ════════════════════════════════════════════════════════════════
function LiveTankPumpPanel({ sensor, connected, fsmState }) {
  const pct    = parseFloat(sensor?.percentage) || 0;
  const status = sensor?.status || "LOW";

  // ✅ KEY FIX: pass sensor.pump (Arduino's actual reported value) as first arg
  const pump   = getPumpState(sensor?.pump, status);

  const ts     = sensor?.timestamp
    ? new Date(sensor.timestamp).toLocaleTimeString()
    : "—";

  return (
    <div className="dt-card ltp-card">
      <div className="ltp-header">
        <div className="ltp-header-left">
          <span style={{ fontSize:20 }}>🏭</span>
          <div>
            <div className="ltp-title">LIVE WATER TANK &amp; PUMP MONITORING</div>
            <div className="ltp-sub">Digital Twin — Real-time hardware synchronization</div>
          </div>
        </div>
        <div className="ltp-header-right">
          <div className="ltp-status-pill" style={{
            background: connected ? "#f0fdf4" : "#fef2f2",
            color:      connected ? "#15803d" : "#b91c1c",
            border:     `1px solid ${connected ? "#bbf7d0" : "#fecaca"}`
          }}>
            <span style={{
              width:7, height:7, borderRadius:"50%",
              background: connected ? "#22c55e" : "#ef4444",
              display:"inline-block", marginRight:5,
              animation: connected ? "blink 2s infinite" : "none"
            }}/>
            {connected ? "LIVE" : "OFFLINE"}
          </div>
          <div className="ltp-status-pill" style={{
            background: pump.on ? "#f0fdf4" : "#f8fafc",
            color:      pump.on ? "#15803d" : "#64748b",
            border:     `1.5px solid ${pump.on ? "#22c55e" : "#cbd5e1"}`
          }}>
            ⚙️ PUMP: <strong style={{ marginLeft:4 }}>{pump.label}</strong>
          </div>
          <div className="ltp-timestamp">🕐 {ts}</div>
        </div>
      </div>

      <div className="ltp-visual-row">
        <div className="ltp-tank-col">
          {/* ✅ Pass pumpOn so tank pipe flow only shows when pump is running */}
          <BatteryTank pct={pct} status={status} pumpOn={pump.on}/>
        </div>

        <div className="ltp-pipe-col">
          {/* ✅ ConnectingPipe animates only when pump.on is true */}
          <ConnectingPipe pumpOn={pump.on} pct={pct}/>
          <div style={{ textAlign:"center", fontSize:10, fontWeight:600,
            color: pump.on ? "#3b82f6" : "#94a3b8", letterSpacing:".08em",
            marginTop:4 }}>
            {pump.on ? "▶ PUMPING" : "— STOPPED"}
          </div>
        </div>

        <div className="ltp-pump-col">
          {/* ✅ DCPump impeller spins only when pump.on is true */}
          <DCPump pumpOn={pump.on} fsmState={fsmState}/>
        </div>
      </div>

      <div className="ltp-stats-row">
        {[
          { icon:"💧", label:"WATER LEVEL", value:`${pct.toFixed(1)}%`,
            color: { OVERFLOW:"#ef4444",FULL:"#ef4444",MEDIUM:"#3b82f6",LOW:"#22c55e" }[status] || "#22c55e" },
          { icon:"📏", label:"SENSOR DIST", value:`${parseFloat(sensor?.distance||0).toFixed(1)} cm`, color:"#6366f1" },
          // ✅ FIXED: Relay shows CLOSED when pump ON, OPEN when pump OFF
          { icon:"⚙️", label:"RELAY STATE", value:pump.relay, color: pump.on ? "#22c55e" : "#ef4444" },
          { icon:"🏭", label:"FSM STATE",   value:fsmState||"IDLE", color:"#f97316" },
        ].map(({ icon, label, value, color }) => (
          <div key={label} className="ltp-stat-chip" style={{ borderTop:`3px solid ${color}` }}>
            <span style={{ fontSize:18 }}>{icon}</span>
            <div className="ltp-stat-val" style={{ color }}>{value}</div>
            <div className="ltp-stat-lbl">{label}</div>
          </div>
        ))}
      </div>

      <div className="ltp-legend">
        <span className="ltp-legend-title">ARDUINO MAPPING:</span>
        <span className="ltp-legend-item">🟢 Ultrasonic → Water Level</span>
        <span className="ltp-legend-item">⚡ RELAY_PIN 4 → Pump Control</span>
        {/* ✅ FIXED: corrected legend to match Arduino controlPump() logic */}
        <span className="ltp-legend-item">🔴 LOW/MEDIUM → Pump ON &nbsp;|&nbsp; FULL/OVERFLOW → Pump OFF</span>
        <span className="ltp-legend-item">💡 GREEN_LED=6 YELLOW_LED=7 RED_LED=8</span>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
//  MAIN DIGITAL TWIN COMPONENT
// ════════════════════════════════════════════════════════════════
export default function DigitalTwin({ sensor, thresholds, stateHist, fillCycles, connected, mongoOk, geminiOk }) {
  const [pctHistory,  setPctHistory]  = useState([]);
  const [distHistory, setDistHistory] = useState([]);
  const [rateHistory, setRateHistory] = useState([]);
  const [rate, setRate] = useState(0);
  const [timer, setTimer] = useState(null);
  const [fsmState, setFsmState] = useState("IDLE");
  const BACKEND = "http://localhost:8000";

  useEffect(() => {
    if (!sensor || sensor.percentage == null) return;
    setPctHistory(h  => [...h, parseFloat(sensor.percentage)].slice(-60));
    setDistHistory(h => [...h, parseFloat(sensor.distance)].slice(-60));
  }, [sensor]);

  useEffect(() => {
    async function fetchRate() {
      try {
        const r = await fetch(`${BACKEND}/api/consumption-rate`);
        const d = await r.json();
        setRate(d.rate_lph || 0);
        setRateHistory(h => [...h, d.rate_lph || 0].slice(-60));
      } catch {}
    }
    async function fetchTimer() {
      try {
        const r = await fetch(`${BACKEND}/api/prediction-timer`);
        const d = await r.json();
        setTimer(d);
      } catch {}
    }
    async function fetchFSM() {
      try {
        const r = await fetch(`${BACKEND}/api/industrial/pump`);
        if (!r.ok) return;
        const d = await r.json();
        if (d.fsm_state) setFsmState(d.fsm_state);
      } catch {}
    }
    fetchRate(); fetchTimer(); fetchFSM();
    const iv = setInterval(() => { fetchRate(); fetchTimer(); fetchFSM(); }, 5000);
    return () => clearInterval(iv);
  }, []);

  const pct    = parseFloat(sensor?.percentage) || 0;
  const dist   = parseFloat(sensor?.distance)   || 0;
  const status = sensor?.status || "LOW";
  const color  = statusColor(status);

  const cycleCount = fillCycles?.length || 0;
  const avgCycle   = cycleCount > 0
    ? (fillCycles.reduce((s, c) => s + c.duration_min, 0) / cycleCount).toFixed(1)
    : "—";

  return (
    <div className="dt-root">

      {/* ══ LIVE TANK & PUMP DIGITAL TWIN ══ */}
      <LiveTankPumpPanel sensor={sensor} connected={connected} fsmState={fsmState}/>

      {!connected && (
        <div className="dt-offline-banner">
          ⚠️ Backend offline — start uvicorn to see live data.
          Showing last known values.
        </div>
      )}

      <div className="dt-header">
        <div className="dt-header-left">
          <div className="dt-header-icon">🔷</div>
          <div>
            <div className="dt-header-title">Digital Twin</div>
            <div className="dt-header-sub">Real-time virtual model of your water tank system</div>
          </div>
        </div>
        <div className="dt-header-badge" style={{ background: color + "18", color, border: `1px solid ${color}33` }}>
          ● {status}
        </div>
      </div>

      <div className="dt-top-row">
        <div className="dt-card dt-tank-card">
          <div className="dt-card-title">🏗️ Tank Model</div>
          <div className="dt-tank-wrap">
            <IsoTank pct={pct} status={status}/>
          </div>
          <div className="dt-tank-stats">
            <div className="dt-tstat">
              <span className="dt-tstat-lbl">Level</span>
              <span className="dt-tstat-val" style={{ color }}>{pct.toFixed(1)}%</span>
            </div>
            <div className="dt-tstat">
              <span className="dt-tstat-lbl">Distance</span>
              <span className="dt-tstat-val">{dist.toFixed(1)} cm</span>
            </div>
            <div className="dt-tstat">
              <span className="dt-tstat-lbl">Volume</span>
              <span className="dt-tstat-val">{(pct / 100 * 10).toFixed(2)} L</span>
            </div>
          </div>
        </div>

        <div className="dt-card dt-gauges-card">
          <div className="dt-card-title">📊 Live Gauges</div>
          <div className="dt-gauges-grid">
            <Gauge value={pct}  max={100} label="Tank Level"   unit="%" color={color}/>
            <Gauge value={dist} max={10}  label="Sensor Dist." unit="cm" color="#6366f1"/>
            <Gauge value={rate} max={5}   label="Consumption"  unit="L/hr" color="#f97316"/>
            <Gauge
              value={timer?.total_minutes || 0}
              max={300}
              label="Time to LOW"
              unit="min"
              color="#06b6d4"
            />
          </div>
        </div>

        <div className="dt-card dt-canvas-card">
          <div className="dt-card-title">🌊 Live Water Sim</div>
          <div className="dt-canvas-wrap">
            <WaterCanvas pct={pct} status={status}/>
          </div>
          <div className="dt-canvas-label" style={{ color }}>
            {sensor?.alert || status}
          </div>
        </div>
      </div>

      <div className="dt-card dt-full-card">
        <div className="dt-card-title">🎚️ Threshold Zone Map</div>
        <ThresholdBar pct={pct} thresholds={thresholds}/>
      </div>

      <div className="dt-card dt-full-card">
        <div className="dt-card-title">📡 Live Sensor Streams</div>
        <div className="dt-sensor-grid">
          <SensorCard icon="💧" label="Water Level"    value={pct.toFixed(1)}  unit="%"    color={color}     sparkData={pctHistory}/>
          <SensorCard icon="📏" label="Sensor Distance" value={dist.toFixed(2)} unit="cm"   color="#6366f1"   sparkData={distHistory}/>
          <SensorCard icon="⚡" label="Consumption Rate" value={rate.toFixed(3)} unit="L/hr" color="#f97316"  sparkData={rateHistory}/>
          <SensorCard icon="⏳" label="Time to Empty"
            value={timer ? (timer.hours > 0 ? `${timer.hours}h ${timer.minutes}m` : `${timer.minutes}m`) : "—"}
            unit="" color="#06b6d4"/>
        </div>
      </div>

      <div className="dt-bottom-row">
        <div className="dt-card">
          <div className="dt-card-title">🕐 State Transition Timeline</div>
          <StatusTimeline events={stateHist}/>
        </div>

        <div className="dt-card">
          <div className="dt-card-title">🖥️ Twin System Health</div>
          <div className="dt-health-list">
            <HealthRow label="WebSocket"      value={connected ? "LIVE" : "OFFLINE"}    ok={connected}/>
            <HealthRow label="Sensor"         value={sensor?.arduino || "—"}            ok={sensor?.arduino !== "OFFLINE"}/>
            <HealthRow label="MongoDB"        value={mongoOk ? "Persisting" : "Memory"} ok={mongoOk}/>
            <HealthRow label="Gemini AI"      value={geminiOk ? "Ready" : "Offline"}    ok={geminiOk}/>
            <HealthRow label="Fill Cycles"    value={cycleCount}                        ok={cycleCount > 0}/>
            <HealthRow label="Avg Fill Time"  value={avgCycle === "—" ? "—" : `${avgCycle} min`} ok={avgCycle !== "—"}/>
            <HealthRow label="Buffer Readings" value={pctHistory.length}                ok={pctHistory.length > 5}/>
            <HealthRow label="Status"         value={status}                            ok={status !== "LOW" && status !== "OVERFLOW"}/>
          </div>
        </div>

        <div className="dt-card">
          <div className="dt-card-title">🔄 Fill Cycle Summary</div>
          {fillCycles && fillCycles.length > 0 ? (
            <div className="dt-cycles">
              {[...fillCycles].reverse().slice(0, 5).map((c, i) => (
                <div key={i} className="dt-cycle-row">
                  <div className="dt-cycle-date">{c.date}</div>
                  <div className="dt-cycle-detail">
                    <span className="dt-cycle-time">{c.low_time} → {c.high_time}</span>
                    <span className="dt-cycle-dur" style={{ color: "#3b82f6" }}>{c.duration_min} min</span>
                  </div>
                  <div className="dt-cycle-bar">
                    <div className="dt-cycle-fill" style={{ width: `${clamp((c.duration_min / 10) * 100, 5, 100)}%` }}/>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="dt-empty">Waiting for first LOW → HIGH fill cycle…</div>
          )}
        </div>
      </div>
    </div>
  );
}