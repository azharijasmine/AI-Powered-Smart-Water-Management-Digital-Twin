"""
Smart Water Monitor — Backend v6 (DEMO MODE ON)
================================================
DEMO_MODE = True  ← simulates sine-wave tank data, no Arduino needed.
To switch to real Arduino: set DEMO_MODE = False and set SERIAL_PORT.
"""

import asyncio, json, serial, serial.tools.list_ports
from datetime import datetime, timedelta
from typing import List, Optional
import threading, time, math, smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from collections import defaultdict

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import google.generativeai as genai

try:
    from pymongo import MongoClient
    MONGO_PKG = True
except ImportError:
    MONGO_PKG = False

# ── ML Engine (pure Python — no sklearn needed) ──────
try:
    from ml_engine import run_ml_prediction, forecast_daily_usage, compute_efficiency_score
    ML_OK = True
except ImportError:
    ML_OK = False
    print('[ML] ml_engine.py not found — ML endpoints disabled')


# ═══════════════════════════════════════════════════════
#  ⚙️  CONFIGURATION — EDIT THESE BEFORE RUNNING
# ═══════════════════════════════════════════════════════

SERIAL_PORT = "COM3"          # Windows: COM3 | Linux: /dev/ttyUSB0
BAUD_RATE   = 9600

# ✅ DEMO MODE ON — simulates tank data without real Arduino
DEMO_MODE   = True   # ← DEMO mode

GEMINI_API_KEY = "AIzaSyBt-YmbCxzOWOmIWk0tggfC9obP2XfVHoQ"
GEMINI_MODEL   = None         # None = auto-detect best available model

MONGO_ENABLED  = True                        # ✅ MongoDB ON
MONGO_URI      = "mongodb://localhost:27017"
MONGO_DB       = "watermonitor"              # ✅ matches Compass

EMAIL_FROM     = "anisfathima152@gmail.com"
EMAIL_TO       = "aljaseerabanu@gmail.com"
EMAIL_PASSWORD = "Azhari@19"
EMAIL_COOLDOWN = 60

TANK_SENSOR_CM  = 10.0
TANK_MAX_LITERS = 10.0

SERIAL_TIMEOUT   = 2
SERIAL_RETRY_SEC = 5


# ═══════════════════════════════════════════════════════
#  APP SETUP
# ═══════════════════════════════════════════════════════
app = FastAPI(title="Smart Water Monitor API v6 — Demo")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ═══════════════════════════════════════════════════════
#  GEMINI AI
# ═══════════════════════════════════════════════════════
genai.configure(api_key=GEMINI_API_KEY)
_gemini_model_obj = None
_gemini_ok        = False

MODELS_TO_TRY = [
    "gemini-1.5-flash", "gemini-1.5-flash-latest", "gemini-1.5-pro",
    "gemini-1.0-pro",   "gemini-pro",
    "models/gemini-1.5-flash", "models/gemini-1.0-pro", "models/gemini-pro",
]

def _init_gemini():
    global _gemini_model_obj, _gemini_ok, GEMINI_MODEL
    print("[GEMINI] Auto-detecting model...")
    if GEMINI_MODEL:
        try:
            m = genai.GenerativeModel(GEMINI_MODEL)
            m.generate_content("hi")
            _gemini_model_obj = m; _gemini_ok = True
            print(f"[GEMINI] ✅ Using configured: {GEMINI_MODEL}"); return
        except Exception as e:
            print(f"[GEMINI] Configured model failed: {e}")
    try:
        available = [m.name for m in genai.list_models()
                     if "generateContent" in m.supported_generation_methods]
        print(f"[GEMINI] Found {len(available)} models: {available}")
        MODELS_TO_TRY[:0] = available
    except Exception as e:
        print(f"[GEMINI] Could not list models: {e}")
    for name in MODELS_TO_TRY:
        try:
            m = genai.GenerativeModel(name)
            m.generate_content("hi")
            _gemini_model_obj = m; _gemini_ok = True; GEMINI_MODEL = name
            print(f"[GEMINI] ✅ Auto-detected: {name}"); return
        except Exception as e:
            print(f"[GEMINI] ✗ {name}: {str(e)[:80]}")
    print("[GEMINI] ❌ No working model found.")

def call_gemini(prompt: str) -> str:
    if not _gemini_ok or not _gemini_model_obj:
        return "❌ Gemini AI unavailable."
    try:
        r = _gemini_model_obj.generate_content(prompt)
        return r.text
    except Exception as e:
        return f"❌ Gemini error: {e}"


# ═══════════════════════════════════════════════════════
#  MONGODB
# ═══════════════════════════════════════════════════════
_db = None; _col_events = None; _col_cycles = None; _mongo_ok = False

def _init_mongo():
    global _db, _col_events, _col_cycles, _mongo_ok
    if not MONGO_ENABLED or not MONGO_PKG:
        print(f"[MONGO] {'Disabled in config' if not MONGO_ENABLED else 'pymongo not installed'}"); return
    try:
        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=3000)
        client.server_info()
        _db = client[MONGO_DB]
        _col_events = _db["state_events"]
        _col_cycles = _db["fill_cycles"]
        _mongo_ok = True
        print(f"[MONGO] ✅ Connected: {MONGO_URI}")
    except Exception as e:
        print(f"[MONGO] ❌ {e}\n[MONGO] Running in memory-only mode")

def mongo_save_event(ev):
    if _mongo_ok and _col_events is not None:       # ← fix: pymongo collections can't be bool-tested
        try: _col_events.insert_one(dict(ev))  # copy! insert_one mutates dict
        except: pass

def mongo_save_cycle(cy):
    if _mongo_ok and _col_cycles is not None:       # ← fix
        try: _col_cycles.insert_one(dict(cy))  # copy! prevents ObjectId leak
        except: pass

def mongo_get_events(limit=200):
    if _mongo_ok and _col_events is not None:       # ← fix
        try: return list(_col_events.find({}, {"_id": 0}).sort("timestamp", -1).limit(limit))
        except: pass
    return []

def mongo_get_cycles(limit=100):
    if _mongo_ok and _col_cycles is not None:       # ← fix
        try: return list(_col_cycles.find({}, {"_id": 0}).sort("date", -1).limit(limit))
        except: pass
    return []


# ═══════════════════════════════════════════════════════
#  THRESHOLDS
# ═══════════════════════════════════════════════════════
thresholds = {"low": 30.0, "medium": 60.0, "high": 80.0}

def get_status(pct: float) -> str:
    if pct >= thresholds["high"]:   return "OVERFLOW"
    if pct >= thresholds["medium"]: return "FULL"
    if pct >= thresholds["low"]:    return "MEDIUM"
    return "LOW"

def get_alert(status: str) -> str:
    return {
        "OVERFLOW": "🚨 OVERFLOW! Drain immediately!",
        "FULL":     "⚠ Tank Full! Stop water supply.",
        "MEDIUM":   "✅ Water level normal.",
        "LOW":      "⚠ Low Water! Refill soon.",
    }.get(status, "")


# ═══════════════════════════════════════════════════════
#  GLOBAL STATE
# ═══════════════════════════════════════════════════════
latest_data: dict = {
    "distance":   0.0,
    "percentage": 0.0,
    "status":     "LOW",
    "buzzer":     "OFF",
    "pump":       "OFF",
    "alert":      "",
    "timestamp":  datetime.now().isoformat(),
    "arduino":    "OFFLINE",
}
state_history: List[dict] = []
fill_cycles:   List[dict] = []
_last_logged:  str        = ""
_pending_low:  Optional[dict] = None
last_email_sent: dict     = {}

_rbuf:     List[dict] = []
_RBUF_MAX: int        = 3600


# ═══════════════════════════════════════════════════════
#  TANK MATHS
# ═══════════════════════════════════════════════════════
def pct_to_litres(pct: float) -> float:
    return round(max(0.0, (pct / 100.0) * TANK_MAX_LITERS), 3)


def compute_rate_lph(window_min: int = 5) -> float:
    if len(_rbuf) < 2:
        return 0.0
    cutoff = datetime.now() - timedelta(minutes=window_min)
    window = [r for r in _rbuf if r["ts"] >= cutoff]
    if len(window) < 2:
        window = _rbuf[-2:]
    oldest, newest = window[0], window[-1]
    pct_drop     = oldest["pct"] - newest["pct"]
    water_used_L = (pct_drop / 100.0) * TANK_MAX_LITERS
    elapsed_s  = (newest["ts"] - oldest["ts"]).total_seconds()
    elapsed_hr = elapsed_s / 3600.0
    if elapsed_hr < (1.0 / 3600.0):
        return 0.0
    rate = water_used_L / elapsed_hr
    return round(max(rate, 0.0), 3)


def compute_usage_averages() -> dict:
    rate      = compute_rate_lph(window_min=10)
    today     = datetime.now().strftime("%Y-%m-%d")
    week_ago  = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
    month_ago = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")

    def sum_min(pred):
        return sum(c["duration_min"] for c in fill_cycles if pred(c.get("date", "")))

    t_min = sum_min(lambda d: d == today)
    w_min = sum_min(lambda d: d >= week_ago)
    m_min = sum_min(lambda d: d >= month_ago)

    if rate > 0:
        d_L = round((t_min  / 60.0) * rate, 2)
        w_L = round((w_min  / 60.0) * rate, 2)
        m_L = round((m_min  / 60.0) * rate, 2)
        if not fill_cycles:
            d_L = round(rate * 24,      2)
            w_L = round(rate * 24 * 7,  2)
            m_L = round(rate * 24 * 30, 2)
    else:
        d_L = w_L = m_L = 0.0

    return {"rate_lph": rate, "daily_L": d_L, "weekly_L": w_L, "monthly_L": m_L}


def compute_prediction_timer() -> dict:
    pct  = float(latest_data.get("percentage", 0))
    rate = compute_rate_lph(window_min=10)

    low_L       = pct_to_litres(thresholds["low"])
    current_L   = pct_to_litres(pct)
    litres_left = round(max(current_L - low_L, 0.0), 3)

    if pct <= thresholds["low"]:
        return {"hours": 0, "minutes": 0, "total_minutes": 0,
                "litres_left": litres_left, "rate_lph": rate,
                "confidence": "low", "label": "Tank at LOW — refill now!"}

    if rate < 0.001:
        return {"hours": 0, "minutes": 0, "total_minutes": 0,
                "litres_left": litres_left, "rate_lph": 0.0,
                "confidence": "low", "label": "Warming up…"}

    total_hours = litres_left / rate
    total_min   = int(total_hours * 60)
    h = int(total_hours)
    m = int((total_hours - h) * 60)

    buf_age = 0.0
    if len(_rbuf) >= 2:
        buf_age = (_rbuf[-1]["ts"] - _rbuf[0]["ts"]).total_seconds() / 60.0
    conf  = "high" if buf_age >= 5 else "medium" if buf_age >= 2 else "low"
    label = (f"{h} Hr{'s' if h != 1 else ''} {m} Min") if h > 0 else f"{m} Min"

    return {"hours": h, "minutes": m, "total_minutes": total_min,
            "litres_left": litres_left, "rate_lph": rate,
            "confidence": conf, "label": label}


# ═══════════════════════════════════════════════════════
#  WEBSOCKET MANAGER
# ═══════════════════════════════════════════════════════
class WsManager:
    def __init__(self): self.active: List[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.append(ws)
        print(f"[WS] +client  (total: {len(self.active)})")

    def disconnect(self, ws: WebSocket):
        if ws in self.active: self.active.remove(ws)

    async def broadcast(self, data: dict):
        dead = []
        for ws in self.active:
            try:   await ws.send_json(data)
            except: dead.append(ws)
        for ws in dead: self.disconnect(ws)

mgr = WsManager()


# ═══════════════════════════════════════════════════════
#  STATE-BASED HISTORY LOGGER
# ═══════════════════════════════════════════════════════
def log_event(status: str, pct: float, ts: datetime):
    global _last_logged, _pending_low
    if status not in ("LOW", "FULL", "OVERFLOW"): return
    log_type = "HIGH" if status in ("FULL", "OVERFLOW") else "LOW"
    if log_type == _last_logged: return
    _last_logged = log_type

    event = {
        "type":       log_type,
        "date":       ts.strftime("%Y-%m-%d"),
        "time":       ts.strftime("%H:%M:%S"),
        "percentage": round(pct, 1),
        "timestamp":  ts.isoformat(),
    }
    state_history.append(event)
    if len(state_history) > 500: state_history.pop(0)
    mongo_save_event(event)
    print(f"[LOG] {log_type} @ {pct:.1f}%  ({ts.strftime('%H:%M:%S')})")

    if log_type == "LOW":
        _pending_low = event
    elif log_type == "HIGH" and _pending_low:
        t0  = datetime.fromisoformat(_pending_low["timestamp"])
        t1  = datetime.fromisoformat(event["timestamp"])
        dur = round((t1 - t0).total_seconds() / 60.0, 1)
        cycle = {
            "date":         event["date"],
            "low_time":     _pending_low["time"],
            "high_time":    event["time"],
            "duration_min": dur,
            "low_pct":      _pending_low["percentage"],
            "high_pct":     event["percentage"],
        }
        fill_cycles.append(cycle)
        if len(fill_cycles) > 200: fill_cycles.pop(0)
        mongo_save_cycle(cycle)
        _pending_low = None
        print(f"[CYCLE] Fill cycle recorded: {dur} min")


# ═══════════════════════════════════════════════════════
#  EMAIL ALERTS
# ═══════════════════════════════════════════════════════
def send_email(alert_type: str, data: dict):
    now = time.time()
    if (alert_type in last_email_sent
            and now - last_email_sent[alert_type] < EMAIL_COOLDOWN):
        return
    last_email_sent[alert_type] = now
    subj = {
        "OVERFLOW": "🚨 OVERFLOW",
        "FULL":     "✅ Tank Full",
        "LOW":      "⚠️ LOW WATER",
        "TEST":     "🧪 Test Alert",
    }
    body = (
        f"<h2>💧 Smart Water Monitor</h2>"
        f"<p><b>Alert:</b> {alert_type}<br>"
        f"<b>Level:</b> {data.get('percentage', 0):.1f}% "
        f"({pct_to_litres(data.get('percentage', 0)):.2f} L / {TANK_MAX_LITERS} L)<br>"
        f"<b>Distance:</b> {data.get('distance', 0):.1f} cm<br>"
        f"<b>Time:</b> {datetime.now().strftime('%H:%M:%S')}</p>"
    )
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subj.get(alert_type, "Alert")
        msg["From"]    = EMAIL_FROM
        msg["To"]      = EMAIL_TO
        msg.attach(MIMEText(body, "html"))
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as s:
            s.login(EMAIL_FROM, EMAIL_PASSWORD)
            s.sendmail(EMAIL_FROM, EMAIL_TO, msg.as_string())
        print(f"[EMAIL] ✅ Sent: {alert_type}")
    except Exception as e:
        print(f"[EMAIL] ❌ Failed: {e}")

def check_email(data: dict):
    if data.get("status") in ("OVERFLOW", "FULL", "LOW"):
        threading.Thread(
            target=send_email, args=(data["status"], data), daemon=True
        ).start()


# ═══════════════════════════════════════════════════════
#  PROCESS A SINGLE READING
# ═══════════════════════════════════════════════════════
def process(raw: dict, source: str) -> dict:
    pct    = float(raw.get("percentage", 0))
    status = get_status(pct)
    ts     = datetime.now()

    _rbuf.append({"pct": pct, "ts": ts})
    if len(_rbuf) > _RBUF_MAX:
        _rbuf.pop(0)

    out = {
        **raw,
        "status":    status,
        "alert":     get_alert(status),
        "timestamp": ts.isoformat(),
        "arduino":   source,
         "pump":      raw.get("pump", "OFF"), 
    }
    log_event(status, pct, ts)
    check_email(out)
    return out


# ═══════════════════════════════════════════════════════
#  LIVE SERIAL READER
# ═══════════════════════════════════════════════════════
def serial_thread(loop: asyncio.AbstractEventLoop):
    global latest_data
    print(f"[SERIAL] Connecting to {SERIAL_PORT} @ {BAUD_RATE} baud…")

    while True:
        ser = None
        try:
            ser = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=SERIAL_TIMEOUT)
            latest_data["arduino"] = "ONLINE"
            print(f"[SERIAL] ✅ Connected — {SERIAL_PORT}")

            while True:
                if ser.in_waiting:
                    try:
                        line = ser.readline().decode("utf-8", errors="ignore").strip()
                    except Exception:
                        continue
                    if not line.startswith("{"):
                        continue
                    try:
                        raw = json.loads(line)
                    except json.JSONDecodeError:
                        print(f"[SERIAL] Bad JSON: {line[:60]}")
                        continue
                    required = {"distance", "percentage", "status", "buzzer"}
                    if not required.issubset(raw.keys()):
                        continue
                    if float(raw.get("distance", 0)) >= 990:
                        print("[SERIAL] ⚠ Sensor error reading skipped")
                        continue
                    processed = process(raw, "ONLINE")
                    latest_data = processed
                    asyncio.run_coroutine_threadsafe(
                        mgr.broadcast(processed), loop
                    ).result(timeout=1)
                time.sleep(0.05)

        except serial.SerialException as e:
            latest_data["arduino"] = "OFFLINE"
            print(f"[SERIAL] ❌ Disconnected — {e}")
            if ser:
                try: ser.close()
                except: pass
            print(f"[SERIAL] Retrying in {SERIAL_RETRY_SEC} s…")
            time.sleep(SERIAL_RETRY_SEC)

        except Exception as e:
            latest_data["arduino"] = "OFFLINE"
            print(f"[SERIAL] Unexpected error: {e}")
            if ser:
                try: ser.close()
                except: pass
            time.sleep(SERIAL_RETRY_SEC)


# ═══════════════════════════════════════════════════════
#  DEMO THREAD  ✅ ACTIVE — DEMO_MODE = True
# ═══════════════════════════════════════════════════════
def demo_thread(loop: asyncio.AbstractEventLoop):
    """
    Simulates a sine-wave tank level — no Arduino needed.
    Level oscillates full cycle every ~3 minutes so fill
    cycles and state history build up quickly for testing.
    """
    global latest_data
    print(f"[DEMO] ✅ DEMO mode active ({TANK_SENSOR_CM} cm / {TANK_MAX_LITERS} L)")
    t = 0
    while True:
        pct  = round(50 + 48 * math.sin(t * 0.06), 1)
        pct  = max(0, min(100, pct))
        dist = round((1 - pct / 100.0) * TANK_SENSOR_CM, 2)
        pump_state = "ON" if pct < thresholds["medium"] else "OFF"
        raw  = {"distance": dist, "percentage": pct, "status": "", "buzzer": "OFF", "pump": pump_state}
        e    = process(raw, "ONLINE (DEMO)")
        latest_data = e
        try:
            asyncio.run_coroutine_threadsafe(mgr.broadcast(e), loop).result(timeout=1)
        except:
            pass
        t += 1
        time.sleep(1.5)


# ═══════════════════════════════════════════════════════
#  STARTUP
# ═══════════════════════════════════════════════════════
@app.on_event("startup")
async def on_startup():
    loop = asyncio.get_event_loop()
    threading.Thread(target=_init_gemini, daemon=True).start()
    threading.Thread(target=_init_mongo,  daemon=True).start()

    fn = demo_thread if DEMO_MODE else serial_thread
    mode_label = "DEMO ✅" if DEMO_MODE else f"LIVE ({SERIAL_PORT})"
    threading.Thread(target=fn, args=(loop,), daemon=True).start()

    print("=" * 55)
    print(f"  Smart Water Monitor — v6")
    print(f"  Mode  : {mode_label}")
    print(f"  Tank  : {TANK_SENSOR_CM} cm sensor / {TANK_MAX_LITERS} L")
    print(f"  Baud  : {BAUD_RATE}")
    print(f"  Docs  : http://localhost:8000/docs")
    print("=" * 55)


# ═══════════════════════════════════════════════════════
#  WEBSOCKET
# ═══════════════════════════════════════════════════════
@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await mgr.connect(ws)

    all_events = state_history.copy()
    all_cycles = fill_cycles.copy()
    if _mongo_ok:
        db_events = mongo_get_events(200)
        db_cycles = mongo_get_cycles(100)
        ts_set = {e["timestamp"] for e in all_events}
        for e in db_events:
            if e.get("timestamp") not in ts_set: all_events.append(e)
        cy_set = {(c["date"], c["low_time"]) for c in all_cycles}
        for c in db_cycles:
            if (c.get("date"), c.get("low_time")) not in cy_set: all_cycles.append(c)

    await ws.send_json({
        "type":         "init",
        "current":      latest_data,
        "history":      sorted(all_events, key=lambda x: x.get("timestamp", ""))[-100:],
        "fill_cycles":  sorted(all_cycles, key=lambda x: x.get("date", ""))[-50:],
        "thresholds":   thresholds,
        "gemini_ok":    _gemini_ok,
        "gemini_model": GEMINI_MODEL,
        "mongo_ok":     _mongo_ok,
        "tank_config":  {"sensor_cm": TANK_SENSOR_CM, "max_litres": TANK_MAX_LITERS},
        "demo_mode":    DEMO_MODE,
    })

    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        mgr.disconnect(ws)


# ═══════════════════════════════════════════════════════
#  REST — CORE ENDPOINTS
# ═══════════════════════════════════════════════════════
@app.get("/")
def root():
    return {
        "status":    "online",
        "mode":      "DEMO ✅" if DEMO_MODE else f"LIVE ({SERIAL_PORT})",
        "gemini":    _gemini_ok,
        "mongo":     _mongo_ok,
        "docs":      "/docs",
        "tank_cm":   TANK_SENSOR_CM,
        "tank_L":    TANK_MAX_LITERS,
    }

@app.get("/api/status")
def get_status_ep():
    return latest_data

@app.get("/api/health")
def health():
    return {
        "api":            "ONLINE",
        "arduino":        latest_data["arduino"],
        "clients":        len(mgr.active),
        "state_logs":     len(state_history),
        "fill_cycles":    len(fill_cycles),
        "mode":           "DEMO" if DEMO_MODE else "SERIAL",
        "serial_port":    SERIAL_PORT,
        "demo_mode":      DEMO_MODE,
        "gemini_ok":      _gemini_ok,
        "gemini_model":   GEMINI_MODEL or "auto-detecting...",
        "mongo_ok":       _mongo_ok,
        "time":           datetime.now().isoformat(),
        "tank_sensor_cm": TANK_SENSOR_CM,
        "tank_max_L":     TANK_MAX_LITERS,
        "buffer_readings":len(_rbuf),
    }

@app.get("/api/history")
def get_history():
    events = state_history.copy()
    if _mongo_ok:
        db_e   = mongo_get_events(500)
        ts_set = {e["timestamp"] for e in events}
        for e in db_e:
            if e.get("timestamp") not in ts_set: events.append(e)
    return {
        "history": sorted(events, key=lambda x: x.get("timestamp", "")),
        "total":   len(events),
    }

@app.get("/api/fill-cycles")
def get_fill_cycles():
    cycles = fill_cycles.copy()
    if _mongo_ok:
        db_c   = mongo_get_cycles(200)
        ky_set = {(c["date"], c["low_time"]) for c in cycles}
        for c in db_c:
            if (c.get("date"), c.get("low_time")) not in ky_set: cycles.append(c)
    if not cycles:
        return {"cycles": [], "stats": None}
    durs = [c["duration_min"] for c in cycles]
    return {
        "cycles": sorted(cycles, key=lambda x: x.get("date", "")),
        "stats":  {
            "count":   len(cycles),
            "last":    cycles[-1],
            "avg_min": round(sum(durs) / len(durs), 1),
            "min_min": round(min(durs), 1),
            "max_min": round(max(durs), 1),
        },
    }

@app.get("/api/ports")
def list_ports():
    ports = [p.device for p in serial.tools.list_ports.comports()]
    return {
        "ports":   ports,
        "current": SERIAL_PORT,
        "hint":    "Change SERIAL_PORT in main.py to match your Arduino port",
    }

@app.get("/api/readings")
def get_readings():
    return get_history()

@app.get("/api/analytics/usage")
def usage_analytics():
    cycles = fill_cycles.copy()
    daily, weekly, monthly = defaultdict(float), defaultdict(float), defaultdict(float)
    for c in cycles:
        try:
            dt = datetime.strptime(c["date"], "%Y-%m-%d")
            daily[dt.strftime("%m-%d")]      += c["duration_min"]
            weekly[f"W{dt.strftime('%W')}"]  += c["duration_min"]
            monthly[dt.strftime("%b")]        += c["duration_min"]
        except:
            pass
    return {
        "daily":   [{"label": k, "minutes": round(v, 1)} for k, v in sorted(daily.items())[-7:]],
        "weekly":  [{"label": k, "minutes": round(v, 1)} for k, v in sorted(weekly.items())[-4:]],
        "monthly": [{"label": k, "minutes": round(v, 1)} for k, v in sorted(monthly.items())[-6:]],
    }

class ThreshBody(BaseModel):
    low: float; medium: float; high: float

@app.post("/api/settings/thresholds")
async def set_thresholds(b: ThreshBody):
    if not (0 <= b.low < b.medium < b.high <= 100):
        return {"error": "Must satisfy: 0 ≤ low < medium < high ≤ 100"}
    thresholds.update({"low": b.low, "medium": b.medium, "high": b.high})
    await mgr.broadcast({"__event__": "thresholds_updated", "thresholds": thresholds})
    return {"success": True, "thresholds": thresholds}

@app.get("/api/settings/thresholds")
def get_thresholds():
    return thresholds


# ═══════════════════════════════════════════════════════
#  REST — CONSUMPTION RATE & PREDICTION
# ═══════════════════════════════════════════════════════
@app.get("/api/consumption-rate")
def consumption_rate_ep():
    avgs = compute_usage_averages()
    pct  = float(latest_data.get("percentage", 0))
    rate = avgs["rate_lph"]
    return {
        "rate_lph":       rate,
        "display_string": f"Live Water Consumption Rate: {rate:.2f} L/hr",
        "daily_L":        avgs["daily_L"],
        "weekly_L":       avgs["weekly_L"],
        "monthly_L":      avgs["monthly_L"],
        "current_pct":    round(pct, 1),
        "current_litres": pct_to_litres(pct),
        "tank_max_L":     TANK_MAX_LITERS,
        "tank_sensor_cm": TANK_SENSOR_CM,
        "buffer_readings":len(_rbuf),
        "formula": {
            "step1":   "water_used_L = (pct_old - pct_new) / 100 × TANK_MAX_L",
            "step2":   "elapsed_hr   = elapsed_seconds / 3600",
            "step3":   "rate_lph     = water_used_L / elapsed_hr",
            "example": "850 ml in 1 hr → 850÷1000 = 0.85 L → rate = 0.85 L/hr",
        },
    }

@app.get("/api/prediction-timer")
def prediction_timer_ep():
    return compute_prediction_timer()

@app.get("/api/charts/pie-analytics")
def pie_analytics_ep(period: str = "daily"):
    usage  = usage_analytics()
    data   = usage.get(period, [])
    pct    = float(latest_data.get("percentage", 0))
    status = latest_data.get("status", "LOW")
    status_counts: dict = defaultdict(int)
    for e in state_history:
        status_counts[e.get("type", "?")] += 1
    return {
        "period":         period,
        "data":           data,
        "current_pct":    round(pct, 1),
        "current_status": status,
        "status_counts":  dict(status_counts),
        "all_usage":      usage,
    }


# ═══════════════════════════════════════════════════════
#  GEMINI AI ENDPOINTS
# ═══════════════════════════════════════════════════════
@app.post("/api/ai/predict")
async def ai_predict():
    events = state_history[-20:]; cycles = fill_cycles[-10:]
    if len(state_history) < 4:
        return {"error": (f"Need 4+ state events. Have {len(state_history)}. "
                          "Wait for LOW/HIGH transitions.")}
    timer    = compute_prediction_timer()
    avgs     = compute_usage_averages()
    evts_str = "\n".join([
        f"{e['date']} {e['time']} → {e['type']} @ {e['percentage']}%"
        for e in events
    ])
    cyc_str = ""
    if cycles:
        durs    = [c["duration_min"] for c in cycles]
        cyc_str = (f"\nFill Cycles: {len(cycles)} recorded. "
                   f"Avg={sum(durs)/len(durs):.1f} min  "
                   f"Last={cycles[-1]['duration_min']} min")
    prompt = f"""You are an IoT water tank monitoring AI.
Tank: {TANK_SENSOR_CM} cm sensor | {TANK_MAX_LITERS} L capacity
Current level: {latest_data['percentage']:.1f}% ({pct_to_litres(float(latest_data['percentage'])):.2f} L)
Consumption rate: {timer['rate_lph']} L/hr | Estimated empty in: {timer['label']}
Thresholds: LOW<{thresholds['low']}%  MEDIUM<{thresholds['medium']}%  HIGH≥{thresholds['high']}%
Recent state events:
{evts_str}{cyc_str}
Reply in EXACTLY this format (no other text):
⏳ EMPTY TIME: Tank will be empty in {timer['label']}
📊 PATTERN: [one sentence about usage pattern]
💡 ACTION: [one specific recommendation right now]
⚠️ RISK: [Low / Medium / High] — [one sentence reason]"""
    return {"prediction": call_gemini(prompt), "timer": timer, "events_used": len(events)}

@app.post("/api/ai/analytics")
async def ai_analytics():
    if len(state_history) < 4:
        return {"error": f"Need 4+ events. Have {len(state_history)}."}
    cycles = fill_cycles.copy(); avgs = compute_usage_averages(); stats = None
    if cycles:
        durs  = [c["duration_min"] for c in cycles]
        stats = {
            "avgFill":    round(sum(durs) / len(durs), 1),
            "minFill":    round(min(durs), 1),
            "maxFill":    round(max(durs), 1),
            "lastFill":   cycles[-1]["duration_min"],
            "totalCycles":len(cycles),
        }
    usage    = usage_analytics()
    dstr     = ", ".join([f"{d['label']}:{d['minutes']} min" for d in usage["daily"]]) or "none"
    cyc_info = "No cycles yet."
    if cycles:
        durs     = [c["duration_min"] for c in cycles]
        cyc_info = (f"Cycles:{len(cycles)} | Last:{cycles[-1]['duration_min']} min | "
                    f"Avg:{sum(durs)/len(durs):.1f} min | "
                    f"Fastest:{min(durs)} min | Slowest:{max(durs)} min")
    prompt = f"""Smart water tank analytics.
Tank: {TANK_SENSOR_CM} cm sensor | {TANK_MAX_LITERS} L capacity
Current: {latest_data['percentage']:.1f}% ({pct_to_litres(float(latest_data['percentage'])):.2f} L) | Status: {latest_data['status']}
Consumption: {avgs['rate_lph']} L/hr | Daily: {avgs['daily_L']} L | Weekly: {avgs['weekly_L']} L
{cyc_info}
Daily usage (fill minutes): {dstr}
## 📊 Consumption Analysis
[2 sentences about efficiency and patterns]
## 💧 Filling Duration Insights
[Statistics and interpretation]
## 🌆 AI Water Optimization Suggestions
1. 🕐 [TIME]: [action] — saves ~X%
2. 🕑 [TIME]: [action] — saves ~X%
3. 🕒 [TIME]: [action] — saves ~X%
## ⭐ Efficiency Score: [X]/10"""
    return {"analytics": call_gemini(prompt), "stats": stats, "usage": usage}

@app.post("/api/ai/optimize")
async def ai_optimize():
    cycles = fill_cycles[-5:]; usage = usage_analytics(); avgs = compute_usage_averages()
    prompt = f"""Smart-city water optimization AI.
Tank: {latest_data['percentage']:.1f}% ({latest_data['status']}) | {TANK_MAX_LITERS} L capacity
Consumption: {avgs['rate_lph']} L/hr | Daily avg: {avgs['daily_L']} L
Recent fill durations: {[c['duration_min'] for c in cycles]}
Daily usage: {usage['daily'][-3:]}
Give 5 time-specific water optimization tips:
🕐 [TIME PERIOD]: [SPECIFIC TIP] — Expected saving: ~X%
End with:
🏙️ SMART CITY INSIGHT: [one sentence about population-level impact]"""
    return {"suggestions": call_gemini(prompt)}

@app.post("/api/email/test")
async def test_email():
    try:
        send_email("TEST", latest_data)
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}

# ═══════════════════════════════════════════════════════
#  ML PREDICTION ENDPOINTS
# ═══════════════════════════════════════════════════════
@app.get("/api/ml/predict")
def ml_predict_ep():
    """Full ML prediction: Linear Regression + Holt forecast + anomaly + sustainability"""
    if not ML_OK:
        return {"error": "ml_engine.py not found. Place it in the backend folder."}
    result = run_ml_prediction(
        rbuf           = _rbuf,
        fill_cycles    = fill_cycles,
        thresholds     = thresholds,
        tank_max_L     = TANK_MAX_LITERS,
        tank_sensor_cm = TANK_SENSOR_CM,
    )
    return result

@app.get("/api/ml/forecast")
def ml_forecast_ep():
    """7-day daily usage forecast"""
    if not ML_OK:
        return {"error": "ml_engine.py not found"}
    avgs = compute_usage_averages()
    fc   = forecast_daily_usage(fill_cycles, avgs["rate_lph"], TANK_MAX_LITERS)
    return fc

@app.get("/api/ml/efficiency")
def ml_efficiency_ep():
    """Efficiency score + sustainability metrics"""
    if not ML_OK:
        return {"error": "ml_engine.py not found"}
    avgs = compute_usage_averages()
    eff  = compute_efficiency_score(fill_cycles, avgs["rate_lph"], TANK_MAX_LITERS)
    daily_L   = round(avgs["rate_lph"] * 24, 2)
    return {
        "efficiency":  eff,
        "sustainability": {
            "daily_L":    daily_L,
            "weekly_L":   round(daily_L * 7, 2),
            "monthly_L":  round(daily_L * 30, 2),
            "rate_lph":   avgs["rate_lph"],
            "carbon_saved_kg": round(max(0, (5.0 - avgs["rate_lph"]) * 24 * 0.001), 4),
        }
    }


# ═══════════════════════════════════════════════════════
#  GEMINI REPORT GENERATOR
# ═══════════════════════════════════════════════════════
@app.post("/api/ai/report/daily")
async def ai_daily_report():
    """Generate daily water usage report using Gemini"""
    avgs   = compute_usage_averages()
    cycles = fill_cycles[-10:]
    today  = datetime.now().strftime("%Y-%m-%d")
    today_cycles = [c for c in fill_cycles if c.get("date") == today]
    
    ml_data = {}
    if ML_OK and len(_rbuf) >= 5:
        ml_data = run_ml_prediction(_rbuf, fill_cycles, thresholds, TANK_MAX_LITERS, TANK_SENSOR_CM)
    
    trend = ml_data.get("trend", "Unknown")
    eff   = ml_data.get("efficiency", {}).get("score", "N/A")
    
    prompt = f"""You are a smart water management AI generating a daily report.

DATE: {today}
Tank: {TANK_SENSOR_CM}cm sensor | {TANK_MAX_LITERS}L capacity
Current level: {latest_data['percentage']:.1f}% | Status: {latest_data['status']}
Consumption rate: {avgs['rate_lph']} L/hr
Daily usage: {avgs['daily_L']} L | Weekly: {avgs['weekly_L']} L
Fill cycles today: {len(today_cycles)} | Total recorded: {len(fill_cycles)}
ML trend: {trend} | Efficiency score: {eff}/10
Thresholds: LOW<{thresholds['low']}% MEDIUM<{thresholds['medium']}% HIGH≥{thresholds['high']}%

Generate a professional daily water usage report with these EXACT sections:

📋 DAILY WATER USAGE REPORT — {today}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 USAGE SUMMARY
[2-3 sentences about today's consumption]

🔍 PATTERN ANALYSIS  
[2 sentences about usage patterns observed]

⚠️ ALERTS & ANOMALIES
[Any issues detected or 'No anomalies detected']

💡 RECOMMENDATIONS
1. [Specific action]
2. [Specific action]
3. [Specific action]

🌱 SUSTAINABILITY SCORE: {eff}/10
[1 sentence about environmental impact]
"""
    report = call_gemini(prompt)
    return {{
        "report":     report,
        "date":       today,
        "type":       "daily",
        "generated":  datetime.now().isoformat(),
        "stats": {{
            "rate_lph":     avgs["rate_lph"],
            "daily_L":      avgs["daily_L"],
            "cycles_today": len(today_cycles),
            "efficiency":   eff,
        }}
    }}

@app.post("/api/ai/report/weekly")
async def ai_weekly_report():
    """Generate weekly AI analysis report"""
    avgs   = compute_usage_averages()
    week_ago = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
    week_cycles = [c for c in fill_cycles if c.get("date","") >= week_ago]
    
    ml_data = {}
    if ML_OK and len(_rbuf) >= 5:
        ml_data = run_ml_prediction(_rbuf, fill_cycles, thresholds, TANK_MAX_LITERS, TANK_SENSOR_CM)
    
    fc_labels = fc_values = "N/A"
    if ML_OK:
        fc = forecast_daily_usage(fill_cycles, avgs["rate_lph"], TANK_MAX_LITERS)
        fc_labels = ", ".join(fc["labels"])
        fc_values = ", ".join(str(v) for v in fc["forecasts"])
    
    prompt = f"""You are an AI water analyst generating a weekly report.

WEEK ENDING: {datetime.now().strftime('%Y-%m-%d')}
Tank: {TANK_MAX_LITERS}L capacity
Weekly usage: {avgs['weekly_L']} L | Daily avg: {avgs['daily_L']} L
Fill cycles this week: {len(week_cycles)}
Next 7-day forecast labels: {fc_labels}
Next 7-day forecast values (L): {fc_values}
Efficiency score: {ml_data.get('efficiency',{{}}).get('score','N/A')}/10

Generate a professional weekly AI analysis report:

📈 WEEKLY AI ANALYSIS REPORT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 WEEK IN REVIEW
[3 sentences summarising this week]

📉 TREND ANALYSIS
[2 sentences about weekly trends]

🔮 NEXT WEEK FORECAST  
[Discuss the 7-day forecast data]

🌱 SUSTAINABILITY INSIGHTS
[Environmental impact, water conservation opportunities]

⭐ WEEKLY EFFICIENCY SCORE: {ml_data.get('efficiency',{{}}).get('score','N/A')}/10
[Overall assessment in 2 sentences]
"""
    report = call_gemini(prompt)
    return {{
        "report":    report,
        "type":      "weekly",
        "generated": datetime.now().isoformat(),
    }}

@app.post("/api/ai/analyst")
async def ai_water_analyst():
    """AI Water Analyst — deep reasoning about sensor + ML data"""
    avgs = compute_usage_averages()
    ml_data = {{}}
    if ML_OK and len(_rbuf) >= 5:
        ml_data = run_ml_prediction(_rbuf, fill_cycles, thresholds, TANK_MAX_LITERS, TANK_SENSOR_CM)
    
    recent_readings = [(r["pct"]) for r in _rbuf[-10:]]
    
    prompt = f"""You are an expert IoT water infrastructure analyst.

LIVE SENSOR DATA:
- Current level: {latest_data['percentage']:.1f}% ({pct_to_litres(float(latest_data['percentage'])):.2f}L)
- Distance: {latest_data.get('distance',0):.1f}cm | Status: {latest_data['status']}
- Last 10 readings: {recent_readings}

ML ANALYSIS:
- Trend: {ml_data.get('trend','Unknown')}
- Rate of change: {ml_data.get('rate_of_change',0):.3f} %/min
- Confidence: {ml_data.get('confidence_label','Unknown')} ({ml_data.get('confidence_pct',0)}%)
- Anomaly detected: {ml_data.get('anomaly_detected',False)}
- Predicted in 15min: {ml_data.get('predicted',{{}}).get('15min','—')}%
- Predicted in 60min: {ml_data.get('predicted',{{}}).get('60min','—')}%

SYSTEM CONTEXT:
- Fill cycles: {len(fill_cycles)} | Consumption: {avgs['rate_lph']} L/hr
- Thresholds: LOW<{thresholds['low']}% MEDIUM<{thresholds['medium']}% HIGH≥{thresholds['high']}%

Provide deep analysis:

🔬 SENSOR ANALYSIS
[2 sentences interpreting current readings in context]

📊 BEHAVIORAL PATTERN
[What the ML model reveals about usage behavior]

⚡ REAL-TIME INSIGHT
[Most important actionable insight right now]

🚨 RISK ASSESSMENT: [Low/Medium/High]
[Specific risk with reasoning]

🌊 WATER INTELLIGENCE SUMMARY
[1 paragraph tying everything together]
"""
    return {{
        "analysis":  call_gemini(prompt),
        "ml_data":   ml_data,
        "generated": datetime.now().isoformat(),
    }}