import { useState, useEffect, useRef, useCallback } from "react";
import {
  Chart as ChartJS, ArcElement, Tooltip, Legend,
  CategoryScale, LinearScale, PointElement, LineElement, BarElement, Filler,
} from "chart.js";
import { Doughnut, Line, Bar } from "react-chartjs-2";
import "./App.css";
import DigitalTwin from "./Digitaltwin.jsx";
import "./DigitalTwin.css";
import AIInsights from "./AIInsights.jsx";
import "./AIInsights.css";

ChartJS.register(ArcElement,Tooltip,Legend,CategoryScale,LinearScale,PointElement,LineElement,BarElement,Filler);

const WS_URL      = "ws://localhost:8000/ws";
const BACKEND_URL = "http://localhost:8000";

// ── Status colours: green=LOW, blue=MEDIUM, red=HIGH/OVERFLOW ──
const SC = {
  OVERFLOW:{color:"#ef4444",bg:"#fef2f2",grad:"linear-gradient(180deg,#ef4444,#dc2626)"},
  FULL:    {color:"#ef4444",bg:"#fef2f2",grad:"linear-gradient(180deg,#f97316,#ef4444)"},
  MEDIUM:  {color:"#3b82f6",bg:"#eff6ff",grad:"linear-gradient(180deg,#60a5fa,#3b82f6)"},
  LOW:     {color:"#22c55e",bg:"#f0fdf4",grad:"linear-gradient(180deg,#4ade80,#22c55e)"},
};

// ════════════════════════════════════════════════════
//  WATER CONSUMPTION RATE CARD
// ════════════════════════════════════════════════════
function WaterConsumptionRate() {
  const [data,setData]=useState(null);
  const [loading,setLoading]=useState(true);
  const load=useCallback(async()=>{
    try{const r=await fetch(`${BACKEND_URL}/api/consumption-rate`);const d=await r.json();setData(d);}catch{}
    setLoading(false);
  },[]);
  useEffect(()=>{load();const iv=setInterval(load,5000);return()=>clearInterval(iv);},[load]);

  const rate=data?.rate_lph??0;
  const barData={
    labels:["Daily","Weekly","Monthly"],
    datasets:[{
      label:"Water Usage (L)",
      data:[data?.daily_L??0, data?.weekly_L??0, data?.monthly_L??0],
      backgroundColor:["rgba(59,130,246,0.85)","rgba(139,92,246,0.85)","rgba(249,115,22,0.85)"],
      borderRadius:8, borderSkipped:false,
    }],
  };
  const barOpts={
    responsive:true,maintainAspectRatio:false,
    plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>` ${ctx.parsed.y.toFixed(2)} L`}}},
    scales:{
      x:{grid:{display:false},ticks:{font:{size:11},color:"#64748b"}},
      y:{grid:{color:"rgba(0,0,0,.04)"},ticks:{font:{size:10},color:"#94a3b8"},beginAtZero:true,
         title:{display:true,text:"Litres",color:"#94a3b8",font:{size:10}}},
    },
  };

  return (
    <div className="feat-card rate-card">
      <div className="feat-eyebrow"><span className={`feat-dot ${rate>0?"feat-dot-green":"feat-dot-grey"}`}/>LIVE WATER CONSUMPTION RATE</div>
      {loading?<div className="feat-loading"><div className="spinner" style={{margin:"0 auto 8px"}}/>Calculating…</div>:(
        <>
          <div className="rate-hero">
            <span className="rate-hero-num">{rate.toFixed(3)}</span>
            <div className="rate-hero-right">
              <span className="rate-hero-unit">L/hr</span>
              <span className="rate-hero-sub">{data?.current_litres??0} L / {data?.tank_max_L??0} L</span>
            </div>
          </div>
          <div style={{height:160,marginTop:12}}><Bar data={barData} options={barOpts}/></div>
          <div className="rate-buffer-info" style={{marginTop:8}}>
            <span>📡 Buffer: <strong>{data?.buffer_readings??0}</strong> readings</span>
            <span>🪣 Tank: <strong>{data?.tank_sensor_cm??10} cm / {data?.tank_max_L??10} L</strong></span>
          </div>
        </>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════
//  PREDICTION TIMER CARD
// ════════════════════════════════════════════════════
function PredictionTimer(){
  const [data,setData]=useState(null);
  const [loading,setLoading]=useState(true);
  const load=useCallback(async()=>{
    try{const r=await fetch(`${BACKEND_URL}/api/prediction-timer`);const d=await r.json();setData(d);}catch{}
    setLoading(false);
  },[]);
  useEffect(()=>{load();const iv=setInterval(load,8000);return()=>clearInterval(iv);},[load]);
  const confColor={high:"#22c55e",medium:"#f59e0b",low:"#94a3b8"};
  const conf=data?.confidence??"low";
  return (
    <div className="feat-card pred-card">
      <div className="feat-eyebrow pred-eyebrow"><span>⏱</span>PREDICTION TIMER</div>
      {loading?<div className="feat-loading"><div className="spinner" style={{margin:"0 auto 8px"}}/>Calculating…</div>
      :(data?.total_minutes??0)===0?(
        <><div className="pred-zero">{data?.label??"No data"}</div><div className="pred-sub-msg">Start sensor to activate prediction</div></>
      ):(
        <>
          <div className="pred-time-row">
            {(data?.hours??0)>0&&<><span className="pred-big-num">{data.hours}</span><span className="pred-big-unit">Hrs</span></>}
            <span className="pred-big-num">{data?.minutes??0}</span><span className="pred-big-unit">Min</span>
          </div>
          <div className="pred-label">Tank Empty in {data?.label}</div>
          <div className="pred-chips">
            <span className="pred-chip">💧 {data?.litres_left} L left</span>
            <span className="pred-chip">⚡ {data?.rate_lph} L/hr</span>
            <span className="pred-chip pred-chip-conf" style={{background:confColor[conf]+"22",color:confColor[conf],borderColor:confColor[conf]+"55"}}>
              {conf.toUpperCase()} confidence
            </span>
          </div>
        </>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════
//  FORECAST CHART  (like reference image)
// ════════════════════════════════════════════════════
function ForecastChart({mlData}){
  const [history, setHistory]=useState([]);
  const pct=mlData?.current_pct??0;

  useEffect(()=>{
    setHistory(h=>[...h, pct].slice(-8));
  },[pct]);

  if(!mlData?.ready) return (
    <div className="forecast-chart-card">
      <div className="forecast-header">
        <div>
          <div className="forecast-title">📈 Water Level Forecast</div>
          <div className="forecast-sub">24-hour prediction with trend analysis</div>
        </div>
      </div>
      <div style={{height:220,display:"flex",alignItems:"center",justifyContent:"center",color:"#94a3b8",fontSize:13}}>
        Warming up ML engine… need 5+ readings
      </div>
    </div>
  );

  const modelA=mlData.model_a||mlData;
  const pred={
    "5min":  modelA?.predicted?.["5min"]  ?? modelA?.["5min"],
    "15min": modelA?.predicted?.["15min"] ?? modelA?.["15min"],
    "30min": modelA?.predicted?.["30min"] ?? modelA?.["30min"],
    "60min": modelA?.predicted?.["60min"] ?? modelA?.["60min"],
  };
  const holt=mlData.holt_forecast||[];

  // Build time labels: past history + future predictions
  const now=new Date();
  const histLabels=history.map((_,i)=>{
    const t=new Date(now-(history.length-1-i)*90*1000);
    return t.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
  });
  const futureLabels=["+5m","+15m","+30m","+60m"];
  const labels=[...histLabels,...futureLabels];

  const actualData=[...history,...Array(4).fill(null)];
 const predData = [
  ...Array(Math.max(0, history.length - 1)).fill(null),
  history.slice(-1)[0],
  pred["5min"], pred["15min"], pred["30min"], pred["60min"]
];

  const fusion=mlData.fusion;
  const riskColor=fusion?.risk_color||"#3b82f6";

  const chartData={
    labels,
    datasets:[
      {
        label:"Actual Level",
        data:actualData,
        borderColor:"#3b82f6",
        backgroundColor:"rgba(59,130,246,0.08)",
        tension:0.4, fill:true,
        pointRadius:5, pointBackgroundColor:"#3b82f6",
        pointBorderColor:"#fff", pointBorderWidth:2,
        spanGaps:true,
      },
      {
        label:"Predicted Level",
        data:predData,
        borderColor:"#f59e0b",
        backgroundColor:"rgba(245,158,11,0.06)",
        borderDash:[6,4],
        tension:0.4, fill:true,
        pointRadius:5, pointBackgroundColor:"#f59e0b",
        pointBorderColor:"#fff", pointBorderWidth:2,
        spanGaps:true,
      },
    ],
  };

  const chartOpts={
    responsive:true, maintainAspectRatio:false,
    plugins:{
      legend:{position:"bottom",labels:{font:{size:11},color:"#475569",usePointStyle:true,padding:16}},
      tooltip:{callbacks:{label:ctx=>` ${ctx.dataset.label}: ${ctx.parsed.y!=null?ctx.parsed.y.toFixed(1):"—"}%`}},
    },
    scales:{
      x:{grid:{color:"rgba(0,0,0,.04)"},ticks:{font:{size:10},color:"#94a3b8"}},
      y:{
        min:0, max:100,
        grid:{color:"rgba(0,0,0,.04)"},
        ticks:{font:{size:10},color:"#94a3b8",callback:v=>`${v}%`},
      },
    },
  };

  return (
    <div className="forecast-chart-card">
      <div className="forecast-header">
        <div>
          <div className="forecast-title">📈 Water Level Forecast</div>
          <div className="forecast-sub">24-hour prediction with trend analysis</div>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontSize:24,fontWeight:900,color:riskColor}}>{pct.toFixed(1)}%</div>
          <div style={{fontSize:11,color:riskColor,fontWeight:700}}>{fusion?.risk_level||mlData?.fusion?.risk_level||"Monitoring"}</div>
        </div>
      </div>
      <div style={{height:240,padding:"0 4px"}}><Line data={chartData} options={chartOpts}/></div>
      {fusion&&(
        <div className="forecast-decision" style={{background:riskColor+"0d",borderColor:riskColor+"33"}}>
          <span style={{color:riskColor,fontWeight:700}}>{fusion.risk_emoji} {fusion.ai_decision}</span>
          <span style={{color:"#475569",marginLeft:8}}>→ {fusion.recommended_action}</span>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════
//  CONSUMPTION BAR CHART  (like reference image)
// ════════════════════════════════════════════════════
function ConsumptionBarChart({usageData, sustain}){
  const daily   = (usageData?.daily||[]).filter(d=>d.minutes>0);
  const weekly  = (usageData?.weekly||[]).filter(d=>d.minutes>0);
  const monthly = (usageData?.monthly||[]).filter(d=>d.minutes>0);

  // Daily/Weekly/Monthly in litres from ML
  const dL=sustain?.daily_L||0;
  const wL=sustain?.weekly_L||0;
  const mL=sustain?.monthly_L||0;

  const barData={
    labels:["Daily","Weekly","Monthly"],
    datasets:[
      {
        label:"Actual Usage (L)",
        data:[dL, wL, mL],
        backgroundColor:["rgba(239,68,68,0.82)","rgba(245,158,11,0.82)","rgba(34,197,94,0.82)"],
        borderRadius:8, borderSkipped:false,
      },
      {
        label:"Available (L)",
        data:[10-dL>0?10-dL:0, 70-(wL>70?70:wL), 300-(mL>300?300:mL)],
        backgroundColor:["rgba(239,68,68,0.15)","rgba(245,158,11,0.15)","rgba(34,197,94,0.15)"],
        borderRadius:8, borderSkipped:false,
      },
    ],
  };

  const barOpts={
    responsive:true, maintainAspectRatio:false,
    plugins:{
      legend:{position:"top",labels:{font:{size:11},color:"#475569",usePointStyle:true,padding:12}},
      tooltip:{callbacks:{label:ctx=>` ${ctx.dataset.label}: ${ctx.parsed.y.toFixed(2)} L`}},
    },
    scales:{
      x:{grid:{display:false},ticks:{font:{size:11},color:"#64748b"}},
      y:{grid:{color:"rgba(0,0,0,.04)"},ticks:{font:{size:10},color:"#94a3b8"},
         beginAtZero:true,title:{display:true,text:"Litres",color:"#94a3b8",font:{size:10}}},
    },
  };

  return (
    <div className="forecast-chart-card">
      <div className="forecast-header">
        <div>
          <div className="forecast-title">📊 Water Consumption</div>
          <div className="forecast-sub">Daily · Weekly · Monthly usage vs available</div>
        </div>
      </div>
      <div style={{height:220}}><Bar data={barData} options={barOpts}/></div>
      <div style={{display:"flex",gap:12,marginTop:12,flexWrap:"wrap"}}>
        {[["💧","Daily",dL,"#ef4444"],["📅","Weekly",wL,"#f59e0b"],["🗓️","Monthly",mL,"#22c55e"]].map(([ic,l,v,c])=>(
          <div key={l} style={{flex:1,background:c+"0d",border:`1px solid ${c}33`,borderRadius:10,padding:"10px 14px",textAlign:"center",minWidth:80}}>
            <div style={{fontSize:18}}>{ic}</div>
            <div style={{fontSize:16,fontWeight:900,color:c}}>{v.toFixed(2)} L</div>
            <div style={{fontSize:10,color:"#64748b",fontWeight:600,textTransform:"uppercase"}}>{l}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════
//  PIE CHART ANALYTICS  — works with 1+ data points
// ════════════════════════════════════════════════════
const PALETTE={
  daily:  ["#22c55e","#f97316","#eab308","#3b82f6","#8b5cf6","#06b6d4","#ec4899"],
  weekly: ["#8b5cf6","#a78bfa","#c4b5fd","#3b82f6","#60a5fa","#818cf8"],
  monthly:["#06b6d4","#22d3ee","#f97316","#fb923c","#fcd34d","#34d399"],
};

function PieChartAnalytics({usageData,stateHistory,latestSensor,fillCycles}){
  const [period,setPeriod]=useState("daily");
  const periodData=(usageData?.[period]??[]).filter(d=>d.minutes>0);
  const allDays=(usageData?.daily??[]).filter(d=>d.minutes>0);
  const weeklyData=(usageData?.weekly??[]).filter(d=>d.minutes>0);
  const palette=PALETTE[period];
  const tabColor={daily:"#22c55e",weekly:"#f97316",monthly:"#8b5cf6"};

  // ── Doughnut (needs 2+ entries) ──
  const doughnutData={
    labels:periodData.map(d=>d.label),
    datasets:[{
      data:periodData.map(d=>+d.minutes.toFixed(2)),
      backgroundColor:periodData.map((_,i)=>palette[i%palette.length]+"cc"),
      borderColor:periodData.map((_,i)=>palette[i%palette.length]),
      borderWidth:2.5, hoverOffset:10,
    }],
  };
  const doughnutOptions={
    responsive:true, maintainAspectRatio:true, cutout:"62%", rotation:-90, circumference:360,
    plugins:{
      legend:{position:"right",labels:{font:{size:11},color:"#475569",padding:14,usePointStyle:true,
        generateLabels:(chart)=>{
          const ds=chart.data.datasets[0];
          const total=ds.data.reduce((s,v)=>s+v,0);
          return chart.data.labels.map((label,i)=>({
            text:`${label}  ${ds.data[i].toFixed(1)}m  (${Math.round(ds.data[i]/total*100)}%)`,
            fillStyle:ds.backgroundColor[i],strokeStyle:ds.borderColor[i],lineWidth:1.5,
          }));
        },
      }},
      tooltip:{callbacks:{label:(ctx)=>{
        const total=ctx.dataset.data.reduce((s,v)=>s+v,0);
        return ` ${ctx.label}: ${ctx.parsed.toFixed(1)} min (${Math.round(ctx.parsed/total*100)}%)`;
      }}},
    },
  };

  // ── Single-entry horizontal bar (works with 1 entry) ──
  const singleBarData={
    labels:periodData.map(d=>d.label),
    datasets:[{
      label:"Fill Duration (min)",
      data:periodData.map(d=>+d.minutes.toFixed(2)),
      backgroundColor:periodData.map((_,i)=>palette[i%palette.length]+"cc"),
      borderColor:periodData.map((_,i)=>palette[i%palette.length]),
      borderWidth:2, borderRadius:8, borderSkipped:false,
    }],
  };
  const singleBarOpts={
    indexAxis:"y", responsive:true, maintainAspectRatio:false,
    plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>` ${ctx.parsed.x.toFixed(1)} min`}}},
    scales:{
      x:{grid:{color:"rgba(0,0,0,.04)"},ticks:{font:{size:10},color:"#94a3b8"},beginAtZero:true},
      y:{grid:{display:false},ticks:{font:{size:11},color:"#475569",fontWeight:600}},
    },
  };

  // ── Fill cycles timeline (works with any number of cycles) ──
  const recentCycles=(fillCycles||[]).slice(-14); // last 14 cycles
  const cycleBarData={
    labels:recentCycles.map((c,i)=>`#${(fillCycles||[]).length-recentCycles.length+i+1}`),
    datasets:[{
      label:"Fill Duration (min)",
      data:recentCycles.map(c=>c.duration_min),
      backgroundColor:"rgba(59,130,246,0.7)",
      borderColor:"#3b82f6",
      borderWidth:1.5, borderRadius:6, borderSkipped:false,
    }],
  };
  const cycleBarOpts={
    responsive:true, maintainAspectRatio:false,
    plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>` ${ctx.parsed.y.toFixed(1)} min`}}},
    scales:{
      x:{grid:{display:false},ticks:{font:{size:9},color:"#94a3b8"}},
      y:{grid:{color:"rgba(0,0,0,.04)"},ticks:{font:{size:10},color:"#94a3b8"},beginAtZero:true,
         title:{display:true,text:"minutes",color:"#94a3b8",font:{size:10}}},
    },
  };

  // ── Daily vs Avg ──
  const weeklyAvg=weeklyData.length>0?+(weeklyData.reduce((s,d)=>s+d.minutes,0)/Math.max(weeklyData.length,1)).toFixed(2):0;
  const barData={
    labels:allDays.length>0?allDays.map(d=>d.label):["No data yet"],
    datasets:[
      {label:"Actual (min)",data:allDays.length>0?allDays.map(d=>+d.minutes.toFixed(2)):[0],
       backgroundColor:"rgba(59,130,246,0.75)",borderRadius:6,borderSkipped:false},
      {label:"Avg/Entry (min)",data:allDays.length>0?allDays.map(()=>weeklyAvg):[0],
       backgroundColor:"rgba(139,92,246,0.55)",borderRadius:6,borderSkipped:false},
    ],
  };
  const barOptions={
    responsive:true,maintainAspectRatio:false,
    plugins:{legend:{position:"top",labels:{font:{size:10},color:"#475569",padding:10,usePointStyle:true}},
             tooltip:{callbacks:{label:ctx=>` ${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)} min`}}},
    scales:{x:{grid:{display:false},ticks:{font:{size:10},color:"#94a3b8"}},
            y:{grid:{color:"rgba(0,0,0,.04)"},ticks:{font:{size:10},color:"#94a3b8"},beginAtZero:true}},
  };

  const statusCounts={};
  (stateHistory??[]).forEach(e=>{const t=e.type||"?";statusCounts[t]=(statusCounts[t]||0)+1;});
  const totalEvents=Object.values(statusCounts).reduce((s,v)=>s+v,0);
  const livePct=parseFloat(latestSensor?.percentage||0).toFixed(1);

  // ── Decide what to show for pie panel ──
  const showDoughnut = periodData.length >= 2;
  const showSingleBar = periodData.length === 1;
  const showEmpty = periodData.length === 0;

  // ── Decide what to show for trend panel ──
  const hasTrend = allDays.length >= 2;
  const hasCycles = recentCycles.length > 0;

  return (
    <div className="pie-analytics-card">
      <div className="pie-analytics-hdr">
        <div>
          <span className="pie-analytics-title">📊 Pie Chart Analytics</span>
          <div style={{fontSize:11,color:"#94a3b8",marginTop:3}}>
            {periodData.length} {period} fill entries · {(fillCycles||[]).length} total cycles
          </div>
        </div>
        <div className="pie-tabs">
          {["daily","weekly","monthly"].map(p=>(
            <button key={p} className={`pie-tab ${period===p?"pie-tab-on":""}`}
              style={period===p?{background:tabColor[p]+"18",borderColor:tabColor[p],color:tabColor[p]}:{}}
              onClick={()=>setPeriod(p)}>{p.charAt(0).toUpperCase()+p.slice(1)}</button>
          ))}
        </div>
      </div>

      <div className="charts-triple-grid">

        {/* ── Panel 1: Pie / Bar / Empty ── */}
        <div className="chart-panel">
          <div className="chart-panel-title">💧 Water Consumption</div>
          <div className="chart-panel-subtitle">
            {showDoughnut?"Doughnut breakdown":showSingleBar?"Single entry — bar view":"Waiting for fill cycles"}
          </div>
          {showEmpty&&(
            <div className="chart-empty-state">
              <span style={{fontSize:36}}>🥧</span>
              <span>No {period} fill data yet<br/>
                <small style={{color:"#94a3b8"}}>Wait for LOW → HIGH cycles<br/>Currently: {(fillCycles||[]).length} total cycles</small>
              </span>
            </div>
          )}
          {showSingleBar&&(
            <div>
              <div style={{height:90,marginBottom:12}}>
                <Bar data={singleBarData} options={singleBarOpts}/>
              </div>
              <div style={{background:"#f8fafc",borderRadius:10,padding:"10px 14px",border:"1px solid #f1f5f9"}}>
                <div style={{fontSize:11,color:"#94a3b8",fontWeight:600,textTransform:"uppercase",letterSpacing:".05em",marginBottom:4}}>
                  {period} entry
                </div>
                <div style={{display:"flex",alignItems:"baseline",gap:6}}>
                  <span style={{fontSize:28,fontWeight:900,color:palette[0]}}>{periodData[0].minutes.toFixed(1)}</span>
                  <span style={{fontSize:13,color:"#64748b"}}>min fill duration</span>
                </div>
                <div style={{fontSize:11,color:"#94a3b8",marginTop:4}}>
                  📅 {periodData[0].label} · Need 2+ entries for pie chart
                </div>
              </div>
            </div>
          )}
          {showDoughnut&&(
            <div style={{height:220,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 4px"}}>
              <Doughnut data={doughnutData} options={doughnutOptions}/>
            </div>
          )}
        </div>

        {/* ── Panel 2: Trend line OR fill cycles bar ── */}
        <div className="chart-panel">
          <div className="chart-panel-title">📈 Fill Cycle Trend</div>
          <div className="chart-panel-subtitle">
            {hasTrend?"Daily usage over time":hasCycles?`Last ${recentCycles.length} fill cycles`:"No cycles recorded yet"}
          </div>
          {!hasTrend&&!hasCycles&&(
            <div className="chart-empty-state">
              <span style={{fontSize:36}}>📉</span>
              <span>No cycle data yet<br/><small style={{color:"#94a3b8"}}>Cycles recorded: {(fillCycles||[]).length}</small></span>
            </div>
          )}
          {!hasTrend&&hasCycles&&(
            <div style={{height:210,position:"relative"}}>
              <Bar data={cycleBarData} options={cycleBarOpts}/>
            </div>
          )}
          {hasTrend&&(
            <div style={{height:210,position:"relative"}}>
              <Line data={{
                labels:allDays.map(d=>d.label),
                datasets:[{
                  label:"Fill Duration (min)",
                  data:allDays.map(d=>+d.minutes.toFixed(2)),
                  borderColor:"#3b82f6",backgroundColor:"rgba(59,130,246,0.1)",
                  tension:0.45,fill:true,pointRadius:5,
                  pointBackgroundColor:"#3b82f6",pointBorderColor:"#fff",pointBorderWidth:2,
                }],
              }} options={{
                responsive:true,maintainAspectRatio:false,
                plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>` ${ctx.parsed.y.toFixed(1)} min`}}},
                scales:{x:{grid:{color:"rgba(0,0,0,.04)"},ticks:{font:{size:10},color:"#94a3b8"}},
                        y:{grid:{color:"rgba(0,0,0,.04)"},ticks:{font:{size:10},color:"#94a3b8"},beginAtZero:true}},
              }}/>
            </div>
          )}
        </div>

        {/* ── Panel 3: Daily vs Avg ── */}
        <div className="chart-panel">
          <div className="chart-panel-title">📊 Daily vs Avg</div>
          <div className="chart-panel-subtitle">Actual fill vs average per entry</div>
          {allDays.length===0?(
            <div className="chart-empty-state">
              <span style={{fontSize:36}}>📊</span>
              <span>No daily data yet</span>
            </div>
          ):(
            <div style={{height:210,position:"relative"}}>
              <Bar data={barData} options={barOptions}/>
            </div>
          )}
        </div>

      </div>

      {/* State Events Summary */}
      <div className="pie-state-summary">
        <div className="pie-state-title">State Events Summary</div>
        <div className="pie-state-row-wrap">
          {totalEvents===0?(
            <span className="pie-no-data-small">No state events yet — waiting for LOW/HIGH transitions</span>
          ):(
            Object.entries(statusCounts).map(([type,count])=>{
              const color=type==="LOW"?"#22c55e":"#f97316";
              const pctVal=Math.round((count/totalEvents)*100);
              return (
                <div key={type} className="pie-stat-item">
                  <div className="pie-stat-top">
                    <span className="pie-stat-dot" style={{background:color}}/>
                    <span style={{color,fontWeight:700,fontSize:12}}>{type}</span>
                    <span style={{color:"#94a3b8",fontSize:11,marginLeft:4}}>({count})</span>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <div className="pie-stat-track">
                      <div className="pie-stat-fill" style={{width:`${pctVal}%`,background:color}}/>
                    </div>
                    <span className="pie-stat-pct">{pctVal}%</span>
                  </div>
                </div>
              );
            })
          )}
          {latestSensor&&(
            <div className="pie-live-level">
              <span className="pie-live-dot"/>
              Live: <strong>{livePct}%</strong>
              <span style={{color:"#94a3b8",marginLeft:4}}>({latestSensor.status})</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════
//  MAIN APP
// ════════════════════════════════════════════════════
export default function App(){
  const [tab,setTab]=useState("dashboard");
  const [connected,setConn]=useState(false);
  const [arduinoSt,setArduino]=useState("OFFLINE");
  const [geminiOk,setGeminiOk]=useState(false);
  const [geminiModel,setGemModel]=useState("detecting...");
  const [mongoOk,setMongoOk]=useState(false);
 const [sensor,setSensor]=useState({percentage:0,distance:0,status:"LOW",buzzer:"OFF",pump:"OFF",alert:"",timestamp:null,arduino:"OFFLINE"});
  const [stateHist,setStateHist]=useState([]);
  const [fillCycles,setFillCycles]=useState([]);
  const [cycleStats,setCycleStats]=useState(null);
  const [usageData,setUsageData]=useState({daily:[],weekly:[],monthly:[]});
  const [thresholds,setThresh]=useState({low:30,medium:60,high:80});
  const [threshIn,setThreshIn]=useState({low:"30",medium:"60",high:"80"});
  const [threshSaved,setThreshSvd]=useState(false);
  const [aiPred,setAiPred]=useState("");
  const [aiAna,setAiAna]=useState("");
  const [aiStats,setAiStats]=useState(null);
  const [aiOpt,setAiOpt]=useState("");
  const [ldP,setLdP]=useState(false);
  const [ldA,setLdA]=useState(false);
  const [ldO,setLdO]=useState(false);
  const [showNotif,setShowNotif]=useState(false);
  const [showSet,setShowSet]=useState(false);
  const [notifs,setNotifs]=useState([]);
  const [health,setHealth]=useState(null);
  const [ports,setPorts]=useState([]);
  const [mlData,setMlData]=useState(null);
  const prevSt=useRef("");const wsRef=useRef(null);const reconn=useRef(null);

  async function fetchAll(){
    try{
      const [hR,fcR,uR,tR,heR,pR]=await Promise.allSettled([
        fetch(`${BACKEND_URL}/api/history`),
        fetch(`${BACKEND_URL}/api/fill-cycles`),
        fetch(`${BACKEND_URL}/api/analytics/usage`),
        fetch(`${BACKEND_URL}/api/settings/thresholds`),
        fetch(`${BACKEND_URL}/api/health`),
        fetch(`${BACKEND_URL}/api/ports`),
      ]);
      if(hR.status==="fulfilled"){const d=await hR.value.json();setStateHist(d.history||[]);}
      if(fcR.status==="fulfilled"){const d=await fcR.value.json();setFillCycles(d.cycles||[]);setCycleStats(d.stats||null);}
      if(uR.status==="fulfilled"){const d=await uR.value.json();setUsageData(d);}
      if(tR.status==="fulfilled"){const d=await tR.value.json();setThresh(d);setThreshIn({low:String(d.low),medium:String(d.medium),high:String(d.high)});}
      if(heR.status==="fulfilled"){const d=await heR.value.json();setHealth(d);setGeminiOk(!!d.gemini_ok);setGemModel(d.gemini_model||"detecting...");setMongoOk(!!d.mongo_ok);}
      if(pR.status==="fulfilled"){const d=await pR.value.json();setPorts(d.ports||[]);}
    }catch{}
  }

  // Fetch ML data
  async function fetchML(){
    try{
      const r=await fetch(`${BACKEND_URL}/api/ml/predict`);
      if(!r.ok) return;
      const d=await r.json();
      if(d.ready) setMlData(d);
    }catch{}
  }

  useEffect(()=>{fetchAll();fetchML();const iv=setInterval(fetchAll,15000);const iv2=setInterval(fetchML,8000);return()=>{clearInterval(iv);clearInterval(iv2);};},[]);

  const connectWS=useCallback(()=>{
    if(wsRef.current?.readyState===WebSocket.OPEN) return;
    const ws=new WebSocket(WS_URL);wsRef.current=ws;
    ws.onopen=()=>{setConn(true);clearTimeout(reconn.current);fetchAll();fetchML();};
    ws.onclose=()=>{setConn(false);setArduino("OFFLINE");reconn.current=setTimeout(connectWS,3000);};
    ws.onerror=()=>ws.close();
    ws.onmessage=(e)=>{
      try{
        const msg=JSON.parse(e.data);
        if(msg.__event__==="thresholds_updated"){setThresh(msg.thresholds);return;}
        if(msg.type==="init"){
          setSensor(msg.current);setArduino(msg.current.arduino||"OFFLINE");
          setStateHist(msg.history||[]);setFillCycles(msg.fill_cycles||[]);
          setThresh(msg.thresholds||{low:30,medium:60,high:80});
          setGeminiOk(!!msg.gemini_ok);setGemModel(msg.gemini_model||"detecting...");
          setMongoOk(!!msg.mongo_ok);prevSt.current=msg.current.status;return;
        }
        setSensor(msg);setArduino(msg.arduino||"OFFLINE");
        if(msg.status!==prevSt.current){addNotif(msg.status,msg.percentage,msg.alert);prevSt.current=msg.status;setTimeout(fetchAll,500);}
      }catch{}
    };
  },[]);

  useEffect(()=>{connectWS();return()=>{clearTimeout(reconn.current);wsRef.current?.close();};},[connectWS]);

  function addNotif(st,pct,msg){
    const m={OVERFLOW:`🚨 OVERFLOW ${pct}%`,FULL:`✅ FULL ${pct}%`,MEDIUM:`💧 MEDIUM ${pct}%`,LOW:`⚠️ LOW ${pct}%`};
    setNotifs(p=>[{id:Date.now(),msg:msg||m[st]||st,time:new Date().toLocaleTimeString()},...p].slice(0,20));
  }

  async function saveThresh(){
    const b={low:parseFloat(threshIn.low),medium:parseFloat(threshIn.medium),high:parseFloat(threshIn.high)};
    if([b.low,b.medium,b.high].some(isNaN)) return;
    try{const r=await fetch(`${BACKEND_URL}/api/settings/thresholds`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)});const d=await r.json();if(d.success){setThresh(d.thresholds);setThreshSvd(true);setTimeout(()=>setThreshSvd(false),2000);}}catch{}
  }

  async function runPred(){setLdP(true);setAiPred("");try{const r=await fetch(`${BACKEND_URL}/api/ai/predict`,{method:"POST"});const d=await r.json();setAiPred(d.prediction||d.error);}catch{setAiPred("❌ Backend offline");}setLdP(false);}
  async function runAna(){setLdA(true);setAiAna("");setAiStats(null);try{const r=await fetch(`${BACKEND_URL}/api/ai/analytics`,{method:"POST"});const d=await r.json();setAiAna(d.analytics||d.error);if(d.stats)setAiStats(d.stats);if(d.usage)setUsageData(d.usage);}catch{setAiAna("❌ Backend offline");}setLdA(false);}
  async function runOpt(){setLdO(true);setAiOpt("");try{const r=await fetch(`${BACKEND_URL}/api/ai/optimize`,{method:"POST"});const d=await r.json();setAiOpt(d.suggestions||d.error);}catch{setAiOpt("❌ Backend offline");}setLdO(false);}

  const sc=SC[sensor.status]||SC.LOW;
  const pct=parseFloat(sensor.percentage)||0;
  const isDemo=arduinoSt.includes("DEMO");
  const isLive=connected&&!arduinoSt.includes("OFFLINE");
  const sustain=mlData?.sustainability;

  return (
    <div className="root">

      {/* SETTINGS MODAL */}
      {showSet&&(
        <div className="modal-overlay" onClick={()=>setShowSet(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-head"><span>⚙️ System Settings</span><button className="modal-close" onClick={()=>setShowSet(false)}>✕</button></div>
            <div className="s-sec">
              <div className="s-lbl">🖥️ System Status</div>
              <div className="s-row"><span>API Backend</span><span className={`sbadge ${connected?"s-green":"s-red"}`}>{connected?"ONLINE":"OFFLINE"}</span></div>
              <div className="s-row"><span>Arduino / Sensor</span><span className={`sbadge ${isLive&&!isDemo?"s-green":isDemo?"s-blue":"s-red"}`}>{isDemo?"DEMO":isLive?"CONNECTED":"DISCONNECTED"}</span></div>
              <div className="s-row"><span>Gemini AI</span><span className={`sbadge ${geminiOk?"s-green":"s-red"}`}>{geminiOk?`✅ ${geminiModel}`:"❌ Not working"}</span></div>
              <div className="s-row"><span>MongoDB</span><span className={`sbadge ${mongoOk?"s-green":"s-orange"}`}>{mongoOk?"✅ Connected":"⚠️ Memory only"}</span></div>
              {health&&<><div className="s-row"><span>State Logs</span><span className="sval">{health.state_logs}</span></div><div className="s-row"><span>Fill Cycles</span><span className="sval">{health.fill_cycles}</span></div></>}
            </div>
            <div className="s-sec">
              <div className="s-lbl">🎚️ Threshold Settings</div>
              {[["low","LOW ⬇️ (Green)","#22c55e"],["medium","MEDIUM 💧 (Blue)","#3b82f6"],["high","HIGH ⬆️ (Red)","#ef4444"]].map(([k,label,c])=>(
                <div key={k} className="thresh-row">
                  <label className="thresh-lbl" style={{color:c}}>{label}</label>
                  <input type="number" min="0" max="100" value={threshIn[k]} onChange={e=>setThreshIn(p=>({...p,[k]:e.target.value}))} className="thresh-inp" style={{borderColor:c+"66"}}/>
                  <span style={{fontSize:13,color:"#64748b"}}>%</span>
                  <div className="thresh-bar-bg"><div className="thresh-bar-f" style={{width:`${Math.min(threshIn[k],100)}%`,background:c}}/></div>
                </div>
              ))}
              <button className={`save-btn ${threshSaved?"save-ok":""}`} onClick={saveThresh}>{threshSaved?"✅ Saved!":"💾 Save Thresholds"}</button>
              <div className="s-note" style={{marginTop:8}}>Active: LOW &lt;{thresholds.low}% · MEDIUM &lt;{thresholds.medium}% · HIGH ≥{thresholds.high}%</div>
            </div>
            <div className="s-sec"><div className="s-lbl">🔌 COM Ports</div>
              {ports.length===0?<p className="s-note">No ports found.</p>:ports.map(p=><div key={p} className="s-row"><span>{p}</span><span className="sval">Available</span></div>)}
            </div>
            <div style={{display:"flex",gap:8,marginTop:4}}>
              <button className="modal-btn" onClick={fetchAll}>🔄 Refresh</button>
              <button className="modal-btn modal-sec" onClick={()=>setShowSet(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* HEADER */}
      <header className="hdr">
        <div className="hdr-l">
          <div className="logo">💧</div>
          <div>
            <div className="app-name">Smart Water Level Monitor</div>
            <div className="app-sub">REAL-TIME IoT DASHBOARD &nbsp;·&nbsp;
              <span style={{color:isLive?(isDemo?"#f59e0b":"#22c55e"):"#ef4444"}}>● {isDemo?"DEMO":isLive?"LIVE":"OFFLINE"}</span>
              {geminiOk&&<span style={{color:"#22c55e",marginLeft:8}}>· 🤖 AI READY</span>}
            </div>
          </div>
        </div>
        <div className="hdr-r">
          <button className="hbtn" onClick={()=>{setShowNotif(!showNotif);setShowSet(false);}}>🔔{notifs.length>0&&<span className="nbadge">{notifs.length}</span>}</button>
          <button className="hbtn" onClick={()=>{setShowSet(!showSet);setShowNotif(false);}}>⚙️</button>
        </div>
      </header>

      {showNotif&&(
        <div className="ndrop">
          <div className="ndrop-head">🔔 Notifications <button className="ndrop-clr" onClick={()=>setNotifs([])}>Clear</button></div>
          {notifs.length===0?<p className="ndrop-empty">No notifications</p>:notifs.map(n=><div key={n.id} className="ndrop-row">{n.msg}<span className="ndrop-t">{n.time}</span></div>)}
        </div>
      )}

      {/* TABS */}
      <div className="tabs">
        {[["dashboard","📊 Dashboard"],["twin","🔷 Digital Twin"],["ai","🧠 AI Intelligence"],["history","📋 History"]].map(([id,lbl])=>(
          <button key={id} className={`tab ${tab===id?"tab-on":""}`} onClick={()=>setTab(id)}>{lbl}</button>
        ))}
      </div>

      {/* DASHBOARD */}
      {tab==="dashboard"&&(
        <main className="content">
          {sensor.alert&&<div className="alert-strip" style={{background:sc.bg,borderColor:sc.color+"55",color:sc.color}}>{sensor.alert}</div>}
          <div className="top3">
            <div className="top-card">
              <div className="tc-eye">💧 WATER LEVEL</div><div className="tc-sub">Current Level</div>
              <div className="tc-val" style={{color:sc.color}}>{pct.toFixed(1)}%</div>
              <div className="tc-st" style={{color:sc.color}}>{sensor.status}</div>
              <div className="tc-note">{sensor.distance} cm from sensor</div>
            </div>
            <div className="top-card">
              <div className="tc-eye">📡 SENSOR</div><div className="tc-sub">Distance Reading</div>
              <div className="tc-val" style={{color:"#7c3aed"}}>{sensor.distance}<span style={{fontSize:18}}> cm</span></div>
              <div className="tc-st" style={{color:"#7c3aed",letterSpacing:"0.08em"}}>HC-SR04 ULTRASONIC</div>
              <div className="tc-note">Tank height: 10 cm</div>
            </div>
            <div className="top-card">
              <div className="tc-eye">🏠 TANK STATUS</div><div className="tc-sub">Tank Condition</div>
              <div className="tc-val" style={{color:sc.color}}>{sensor.status}</div>
              <div className="tc-st" style={{color:sc.color}}>Buzzer: {sensor.buzzer||"OFF"}</div>
              <div className="tc-note">Updated: {sensor.timestamp?new Date(sensor.timestamp).toLocaleTimeString():"—"}</div>
            </div>
          </div>
          <div className="bot-row">
            <div className="tank-card">
              <div className="tc-eye" style={{marginBottom:4}}>TANK VISUALIZATION</div>
              <div className="tank-title">Live Water Model</div>
              <div className="tank-wrap">
                <div className="tank3d">
                  <div className="tank-cap"/>
                  <div className="tank-body">
                    <div className="tank-water" style={{height:`${pct}%`,background:sc.grad}}><div className="wave"/></div>
                    <div className="tank-ov"><span className="tank-pct">{pct.toFixed(1)}%</span><span className="tank-lbl">{sensor.status}</span></div>
                  </div>
                </div>
              </div>
              <div className="legend">
                {[["LOW","#22c55e"],["MEDIUM","#3b82f6"],["FULL/OVERFLOW","#ef4444"]].map(([k,c])=>(
                  <span key={k} className="leg-item"><span className="leg-dot" style={{background:c}}/>{k}</span>
                ))}
              </div>
            </div>
            <div className="alerts-col">
              {[
                {title:"Tank Full Alert",active:sensor.status==="FULL"||sensor.status==="OVERFLOW",color:"#ef4444",bg:"#fef2f2",msg:sensor.status==="FULL"||sensor.status==="OVERFLOW"?"Stop water supply now":"Tank not full yet"},
                {title:"Low Water Alert",active:sensor.status==="LOW",color:"#f59e0b",bg:"#fffbeb",msg:sensor.status==="LOW"?"Refill water now!":"Level within safe range"},
                {title:"Fill Tracker",active:cycleStats!==null,color:"#3b82f6",bg:"#eff6ff",msg:cycleStats?`Last: ${cycleStats.last?.duration_min}min · Avg: ${cycleStats.avg_min}min`:"No fill cycles yet"},
                {title:"Sensor Status",active:isLive,color:"#22c55e",bg:"#f0fdf4",msg:isLive?(isDemo?"✅ DEMO mode active":"✅ Receiving live data"):"❌ No signal — check USB"},
              ].map((a,i)=>(
                <div key={i} className="a-card" style={a.active?{background:a.bg,borderColor:a.color+"44"}:{}}>
                  <div className="a-l"><div className="a-dot" style={{background:a.active?a.color:"#d1d5db"}}/>
                    <div><div className="a-title">{a.title}</div><div className="a-msg" style={{color:a.active?a.color:"#94a3b8"}}>{a.msg}</div></div>
                  </div>
                  <div className="a-ind" style={{background:a.active?a.color:"#e5e7eb"}}/>
                </div>
              ))}
            </div>
          </div>
        </main>
      )}

      {/* DIGITAL TWIN */}
      {tab==="twin"&&(
        <main className="content">
          <DigitalTwin sensor={sensor} thresholds={thresholds} stateHist={stateHist}
            fillCycles={fillCycles} connected={connected} mongoOk={mongoOk} geminiOk={geminiOk}/>
        </main>
      )}

      {/* AI INTELLIGENCE — PAGE 1 & PAGE 2 */}
      {tab==="ai"&&(
        <main className="content">
          {!connected&&<div className="warn">⚠️ Backend OFFLINE — run: <code>cd backend &amp;&amp; uvicorn main:app --reload --port 8000</code></div>}

          {/* ── PAGE 1 ──────────────────────────────────────────
              1) Aqua AI (inside AIInsights Overview tab)
              2) Live Water Consumption Rate
              3) Prediction Timer
              4) Pie Chart Analytics
          ─────────────────────────────────────────────────── */}

          {/* 1) Aqua AI Intelligence */}
          <AIInsights sensor={sensor} thresholds={thresholds} fillCycles={fillCycles} connected={connected}/>

          {/* 2+3) Rate + Timer side by side */}
          <div className="feat-row"><WaterConsumptionRate/><PredictionTimer/></div>

          {/* 4) Pie Chart Analytics */}
          <PieChartAnalytics usageData={usageData} stateHistory={stateHist} latestSensor={sensor} fillCycles={fillCycles}/>

          {/* ── PAGE DIVIDER ── */}
          <div className="page-divider">
            <span className="page-divider-line"/>
            <span className="page-divider-label"></span>
            <span className="page-divider-line"/>
          </div>

          {/* ── PAGE 2 ──────────────────────────────────────────
              5) Water Usage Prediction (Gemini)
              6) Analytics + Optimization (Gemini)
              7) Water Consumption Bar Chart (Daily/Weekly/Monthly)
              8) Water Level Forecast Chart
          ─────────────────────────────────────────────────── */}

          {/* 5) Water Usage Prediction */}
          <div className="card ai-pred-card">
            <div className="eyebrow">GEMINI AI · PREDICTION</div>
            <div className="card-h">⏳ Water Usage Prediction</div>
            <div className="card-row" style={{marginTop:12,gap:12}}>
              <div style={{flex:1}}>
                {!aiPred&&!ldP&&<div className="ai-empty"><div style={{fontSize:36,marginBottom:8}}>⏳</div><p>Events: {stateHist.length}/4 · Cycles: {fillCycles.length}</p>{stateHist.length>=4&&<p style={{color:"#22c55e",fontSize:13,marginTop:4}}>✅ Ready!</p>}</div>}
                {ldP&&<div className="ai-spin">🤖 Gemini AI predicting...</div>}
                {aiPred&&<div className="ai-res"><pre className="ai-pre">{aiPred}</pre></div>}
              </div>
              <button className="ai-btn" onClick={runPred} disabled={ldP||!geminiOk}>{ldP?"⏳...":!geminiOk?"❌ AI Off":"🔍 Run Prediction"}</button>
            </div>
          </div>

          {/* 6) Analytics + Optimization */}
          <div className="card">
            <div className="card-hr">
              <div><div className="eyebrow">GEMINI AI · DEEP ANALYSIS</div><div className="card-h">📊 Analytics + Optimization</div></div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                <button className="ai-btn" onClick={runAna} disabled={ldA||!geminiOk}>{ldA?"⏳...":"📊 Run Analytics"}</button>
                <button className="ai-btn ai-green" onClick={runOpt} disabled={ldO||!geminiOk}>{ldO?"⏳...":"🌆 AI Optimize"}</button>
              </div>
            </div>
            {aiStats&&(
              <div className="mini-stats">
                {[["Avg Fill",`${aiStats.avgFill}m`,"#3b82f6"],["Last Fill",`${aiStats.lastFill}m`,"#f97316"],["Fastest",`${aiStats.minFill}m`,"#22c55e"],["Slowest",`${aiStats.maxFill}m`,"#ef4444"],["Cycles",aiStats.totalCycles,"#8b5cf6"]].map(([l,v,c])=>(
                  <div key={l} className="mstat"><div style={{color:c,fontWeight:800,fontSize:16}}>{v}</div><div style={{color:"#94a3b8",fontSize:11}}>{l}</div></div>
                ))}
              </div>
            )}
            <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
              <div style={{flex:1,minWidth:280}}>
                {!aiAna&&!ldA&&<div className="ai-empty"><div style={{fontSize:36}}>🧠</div><p>{stateHist.length>=4?"Click 'Run Analytics' ↑":`Need ${stateHist.length}/4 state events`}</p></div>}
                {ldA&&<div className="ai-spin">🤖 Generating insights...</div>}
                {aiAna&&<div className="ai-res"><pre className="ai-pre">{aiAna}</pre></div>}
              </div>
              {(aiOpt||ldO)&&(
                <div style={{flex:1,minWidth:280}}>
                  {ldO&&<div className="ai-spin">🌆 Generating tips...</div>}
                  {aiOpt&&<div className="ai-opt"><div style={{fontWeight:700,fontSize:14,color:"#166534",marginBottom:8}}>🌆 AI Optimization</div><pre className="ai-pre">{aiOpt}</pre></div>}
                </div>
              )}
            </div>
          </div>

          {/* 7+8) Consumption Bar Chart + Forecast Line Chart side by side */}
          <div className="two-col-row">
            <ConsumptionBarChart usageData={usageData} sustain={sustain}/>
            <ForecastChart mlData={mlData}/>
          </div>

        </main>
      )}

      {/* HISTORY */}
      {tab==="history"&&(
        <main className="content">
          {!connected&&<div className="warn">⚠️ Backend OFFLINE</div>}
          <div className="info-banner">📋 <strong>Smart History:</strong> Total: <strong>{stateHist.length}</strong> events · Cycles: <strong>{fillCycles.length}</strong>{mongoOk&&<span style={{color:"#166534",marginLeft:8}}></span>}</div>
          {cycleStats&&(
            <div className="card" style={{background:"linear-gradient(135deg,#eff6ff,#f0fdf4)",borderColor:"#bfdbfe"}}>
              <div className="card-h" style={{marginBottom:16}}>🔄 Fill Cycle Summary</div>
              <div className="fill-grid">
                {[{l:"Total",v:cycleStats.count,i:"🔄",c:"#3b82f6"},{l:"Last Fill",v:`${cycleStats.last?.duration_min??"—"} min`,i:"🕐",c:"#8b5cf6"},{l:"Average",v:`${cycleStats.avg_min} min`,i:"📊",c:"#06b6d4"},{l:"Fastest",v:`${cycleStats.min_min} min`,i:"⚡",c:"#22c55e"},{l:"Slowest",v:`${cycleStats.max_min} min`,i:"🐌",c:"#f97316"}].map(s=>(
                  <div key={s.l} className="fill-item"><span style={{fontSize:24}}>{s.i}</span><span className="fill-val" style={{color:s.c}}>{s.v}</span><span className="fill-lbl">{s.l}</span></div>
                ))}
              </div>
            </div>
          )}
          <div className="card">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <div className="card-h">📋 State Event Log</div>
              <button className="refresh-btn" onClick={fetchAll}>🔄 Refresh</button>
            </div>
            {stateHist.length===0?(
              <div style={{textAlign:"center",padding:"40px",color:"#94a3b8"}}><div style={{fontSize:40}}>📭</div><p style={{marginTop:8}}>Connect Arduino and start backend.</p></div>
            ):(
              <div style={{overflowX:"auto"}}>
                <table className="tbl">
                  <thead><tr><th>#</th><th>Event</th><th>Date</th><th>Time</th><th>Level</th></tr></thead>
                  <tbody>
                    {[...stateHist].reverse().map((r,i)=>(
                      <tr key={i}>
                        <td style={{color:"#94a3b8",fontSize:12}}>{stateHist.length-i}</td>
                        <td><span className="tbadge" style={{background:r.type==="LOW"?"#f0fdf4":"#fff7ed",color:r.type==="LOW"?"#22c55e":"#f97316"}}>{r.type==="LOW"?"⬇️ LOW":"⬆️ HIGH"}</span></td>
                        <td>{r.date}</td><td>{r.time}</td>
                        <td style={{fontWeight:700,color:r.type==="LOW"?"#22c55e":"#f97316"}}>{r.percentage}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          {fillCycles.length>0&&(
            <div className="card">
              <div className="card-h" style={{marginBottom:16}}>⏱️ Fill Cycle Detail</div>
              <div style={{overflowX:"auto"}}>
                <table className="tbl">
                  <thead><tr><th>Date</th><th>LOW Time</th><th>HIGH Time</th><th>Duration</th><th>Low %</th><th>High %</th></tr></thead>
                  <tbody>
                    {[...fillCycles].reverse().map((c,i)=>(
                      <tr key={i}>
                        <td>{c.date}</td>
                        <td style={{color:"#22c55e"}}>{c.low_time}</td>
                        <td style={{color:"#f97316"}}>{c.high_time}</td>
                        <td style={{fontWeight:700,color:"#3b82f6"}}>{c.duration_min} min</td>
                        <td style={{color:"#22c55e"}}>{c.low_pct}%</td>
                        <td style={{color:"#f97316"}}>{c.high_pct}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      )}
    </div>
  );
}