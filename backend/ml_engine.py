"""
ml_engine.py — AI Water Intelligence Engine v2
================================================
Multi-Model System:
  Model A: Linear Regression (level prediction + empty time)
  Model B: Holt Double Exponential Smoothing (time-series forecast)
  Model C: Z-Score Anomaly Detection (leak/unusual drain detection)
  Fusion:  Model Agreement Layer → final AI decision + risk level
Pure Python — zero external dependencies.
"""

import math
from datetime import datetime, timedelta
from collections import defaultdict
from typing import List, Optional


# ══════════════════════════════════════════════════════════
#  MODEL A — LINEAR REGRESSION
# ══════════════════════════════════════════════════════════
def _linreg(xs, ys):
    n = len(xs)
    if n < 2:
        return 0.0, (ys[-1] if ys else 50.0), 0.0
    sx  = sum(xs); sy  = sum(ys)
    sxx = sum(x*x for x in xs)
    sxy = sum(x*y for x, y in zip(xs, ys))
    d   = n * sxx - sx * sx
    if abs(d) < 1e-9:
        return 0.0, sy / n, 0.0
    slope = (n * sxy - sx * sy) / d
    inter = (sy - slope * sx) / n
    ym    = sy / n
    ss_t  = sum((y - ym)**2 for y in ys)
    ss_r  = sum((y - (slope*x + inter))**2 for x, y in zip(xs, ys))
    r2    = max(0.0, min(1.0, 1 - ss_r / ss_t)) if ss_t > 1e-9 else 0.0
    return slope, inter, r2


# ══════════════════════════════════════════════════════════
#  MODEL B — HOLT DOUBLE EXPONENTIAL SMOOTHING
# ══════════════════════════════════════════════════════════
def _holt_forecast(values, horizon=10, alpha=0.4, beta=0.3):
    if len(values) < 2:
        return [values[-1] if values else 50.0] * horizon
    level = values[0]
    trend = values[1] - values[0]
    for v in values[1:]:
        pl    = level
        level = alpha * v + (1 - alpha) * (level + trend)
        trend = beta  * (level - pl)  + (1 - beta) * trend
    return [max(0.0, min(100.0, level + i * trend)) for i in range(1, horizon + 1)]


# ══════════════════════════════════════════════════════════
#  MODEL C — Z-SCORE ANOMALY DETECTION
# ══════════════════════════════════════════════════════════
def _zscore_anomaly(values, threshold=2.5):
    if len(values) < 5:
        return False, 0.0
    w    = values[-20:]
    mean = sum(w) / len(w)
    std  = math.sqrt(sum((v - mean)**2 for v in w) / len(w))
    if std < 0.01:
        return False, 0.0
    z = abs(values[-1] - mean) / std
    return z > threshold, round(z, 2)


# ══════════════════════════════════════════════════════════
#  MODEL FUSION LAYER — combines A + B + C into one decision
# ══════════════════════════════════════════════════════════
def _model_fusion(lr_slope, lr_r2, holt_next, is_anomaly,
                  current_pct, mins_to_low, thresholds):
    """
    Combines all model outputs into:
    - risk_level: SAFE / ATTENTION / CRITICAL
    - risk_score: 0-100
    - ai_decision: human-readable decision string
    - recommended_action: what user should do now
    - model_agreement: how aligned the models are (0-1)
    """
    low_t  = thresholds.get("low",    30)
    high_t = thresholds.get("high",   90)

    # ── Risk score calculation ────────────────────────────
    # Base: inverse of current level
    risk = max(0, (100 - current_pct))  # 0 = full, 100 = empty

    # Amplify if declining fast
    if lr_slope < -0.002:   risk = min(100, risk * 1.4)
    elif lr_slope < -0.0005: risk = min(100, risk * 1.2)

    # Anomaly bump
    if is_anomaly: risk = min(100, risk + 15)

    # Time-to-empty urgency
    if mins_to_low is not None:
        if mins_to_low < 5:    risk = min(100, risk + 30)
        elif mins_to_low < 15: risk = min(100, risk + 15)
        elif mins_to_low < 30: risk = min(100, risk + 8)

    # Holt agreement: if holt also shows decline, reinforce
    if holt_next and holt_next[0] < current_pct - 2:
        risk = min(100, risk + 5)

    risk = round(risk, 1)

    # ── Risk level ────────────────────────────────────────
    if risk >= 65 or current_pct <= low_t:
        risk_level  = "CRITICAL"
        risk_color  = "#ef4444"
        risk_emoji  = "🔴"
    elif risk >= 35 or current_pct <= (low_t + (high_t - low_t) * 0.3):
        risk_level  = "ATTENTION"
        risk_color  = "#f59e0b"
        risk_emoji  = "🟡"
    else:
        risk_level  = "SAFE"
        risk_color  = "#22c55e"
        risk_emoji  = "🟢"

    # ── AI Decision message ───────────────────────────────
    if is_anomaly and lr_slope < -0.001:
        decision = (f"⚠️ Anomalous drain detected! Water level dropping unusually fast "
                    f"({'~' + str(round(mins_to_low)) + ' min to LOW' if mins_to_low else 'level critical'}). "
                    f"Possible leak or abnormal usage.")
        action   = "Check pipes immediately and prepare to refill."
    elif lr_slope < -0.002:
        t_str = f"~{round(mins_to_low)} min" if mins_to_low else "soon"
        decision = (f"Water level decreasing rapidly at {abs(round(lr_slope*60*100,2))} %/min. "
                    f"Tank likely empty within {t_str}.")
        action   = "Start refilling now to avoid water shortage."
    elif lr_slope < -0.0005:
        t_str = f"in ~{round(mins_to_low)} min" if mins_to_low else "gradually"
        decision = f"Water level declining steadily. Will reach LOW threshold {t_str}."
        action   = "Monitor closely. Plan refill within the next hour."
    elif lr_slope > 0.0005:
        decision = "Water level is rising — tank filling in progress."
        action   = "No action needed. Monitor until FULL threshold."
    elif current_pct <= low_t:
        decision = "Tank at LOW level. Immediate attention required."
        action   = "Refill tank immediately."
    elif current_pct >= high_t:
        decision = "Tank is FULL or overflowing. Supply should be stopped."
        action   = "Stop water supply to prevent overflow."
    else:
        decision = f"Water level stable at {round(current_pct, 1)}%. Normal consumption pattern."
        action   = "No immediate action required. Continue monitoring."

    # ── Model agreement (0-1 scale) ───────────────────────
    # High agreement = LR and Holt both predict same direction
    lr_dir   = 1 if lr_slope > 0 else (-1 if lr_slope < -0.0001 else 0)
    holt_dir = 1 if (holt_next and holt_next[0] > current_pct) else -1
    agreement = 1.0 if lr_dir == holt_dir else 0.5
    # Boost if R² is high
    agreement = min(1.0, agreement * (0.5 + lr_r2 * 0.5))

    agree_label = "High" if agreement > 0.75 else "Medium" if agreement > 0.45 else "Low"

    return {
        "risk_score":       risk,
        "risk_level":       risk_level,
        "risk_color":       risk_color,
        "risk_emoji":       risk_emoji,
        "ai_decision":      decision,
        "recommended_action": action,
        "model_agreement":  round(agreement, 2),
        "model_agreement_label": agree_label,
    }


# ══════════════════════════════════════════════════════════
#  LEARNING PROGRESS
# ══════════════════════════════════════════════════════════
def _learning_progress(n_readings, n_cycles, data_window_min):
    """Returns learning stage 0-100 and a label."""
    score = 0
    score += min(40, n_readings / 2)         # up to 80 readings = 40pts
    score += min(30, n_cycles * 5)           # up to 6 cycles = 30pts
    score += min(30, data_window_min / 2)    # up to 60 min window = 30pts
    score = round(min(100, score), 1)

    label = (
        "🟢 Expert — high accuracy predictions"   if score >= 80 else
        "🟡 Learning — improving confidence"       if score >= 50 else
        "🔵 Warming up — collecting baseline data" if score >= 20 else
        "⚪ Initialising — need more data"
    )
    return score, label


# ══════════════════════════════════════════════════════════
#  EFFICIENCY SCORE
# ══════════════════════════════════════════════════════════
def compute_efficiency_score(fill_cycles, rate_lph, tank_max_L):
    score = 7.0
    if fill_cycles and len(fill_cycles) >= 2:
        durs = [c["duration_min"] for c in fill_cycles]
        mean = sum(durs) / len(durs)
        var  = sum((d - mean)**2 for d in durs) / len(durs)
        cv   = math.sqrt(var) / mean if mean > 0 else 0
        score -= min(3.0, cv * 5)
    if rate_lph > 0 and tank_max_L > 0:
        h = tank_max_L / rate_lph
        if h < 2:    score -= 2.0
        elif h < 4:  score -= 1.0
        elif h > 12: score += 1.0
    score = round(max(1.0, min(10.0, score)), 1)
    label = (
        "Excellent ⭐⭐⭐" if score >= 8.5 else
        "Good ⭐⭐"        if score >= 6.5 else
        "Fair ⭐"           if score >= 4.5 else
        "Poor — Review usage"
    )
    return {"score": score, "label": label, "max": 10}


# ══════════════════════════════════════════════════════════
#  7-DAY DAILY USAGE FORECAST
# ══════════════════════════════════════════════════════════
def forecast_daily_usage(fill_cycles, rate_lph, tank_max_L):
    daily_totals = defaultdict(float)
    for c in fill_cycles:
        d = c.get("date","")
        if d:
            daily_totals[d] += (c["duration_min"] / 60.0) * rate_lph
    dates  = sorted(daily_totals.keys())
    values = [daily_totals[d] for d in dates]
    if len(values) < 2:
        daily_est = rate_lph * 24
        values    = [daily_est] * 3
    forecasts = _holt_forecast(values, horizon=7, alpha=0.35, beta=0.2)
    today     = datetime.now()
    labels    = [(today + timedelta(days=i+1)).strftime("%a %d") for i in range(7)]
    return {
        "labels":    labels,
        "forecasts": [round(v, 2) for v in forecasts],
        "unit":      "litres",
        "method":    "Holt Double Exponential Smoothing",
    }


# ══════════════════════════════════════════════════════════
#  MAIN PIPELINE  (called by /api/ml/predict)
# ══════════════════════════════════════════════════════════
def run_ml_prediction(rbuf, fill_cycles, thresholds,
                      tank_max_L, tank_sensor_cm):
    if len(rbuf) < 5:
        return {
            "status":  "warming_up",
            "message": f"Collecting data… ({len(rbuf)}/5 readings)",
            "ready":   False,
        }

    # Prepare series
    t0  = rbuf[0]["ts"]
    xs  = [(r["ts"] - t0).total_seconds() for r in rbuf]
    ys  = [r["pct"] for r in rbuf]

    # ── Model A: Linear Regression ────────────────────────
    slope, intercept, r2 = _linreg(xs, ys)
    now_x   = xs[-1]
    current = ys[-1]

    def pred_at(m): return max(0.0, min(100.0, slope*(now_x+m*60)+intercept))

    low_t = thresholds.get("low", 30)
    if slope < -0.0001 and current > low_t:
        mins_to_low = max(0, (low_t - current) / slope / 60)
    else:
        mins_to_low = None

    # ── Model B: Holt Forecast ────────────────────────────
    holt_next = _holt_forecast([r["pct"] for r in rbuf[-30:]], horizon=10)

    # ── Model C: Anomaly Detection ────────────────────────
    is_anomaly, z_score = _zscore_anomaly(ys)

    # ── Rate of change ────────────────────────────────────
    if len(rbuf) >= 5:
        dt  = (rbuf[-1]["ts"] - rbuf[-5]["ts"]).total_seconds()
        dpct = rbuf[-1]["pct"] - rbuf[-5]["pct"]
    else:
        dt   = (rbuf[-1]["ts"] - rbuf[0]["ts"]).total_seconds()
        dpct = rbuf[-1]["pct"] - rbuf[0]["pct"]
    roc = round(dpct / dt * 60, 3) if dt > 0 else 0.0

    # ── Trend ─────────────────────────────────────────────
    if slope < -0.002:    trend = "📉 Rapidly Decreasing"
    elif slope < -0.0005: trend = "🔻 Decreasing"
    elif slope >  0.002:  trend = "📈 Rapidly Increasing"
    elif slope >  0.0005: trend = "🔺 Increasing"
    else:                 trend = "➡️ Stable"

    # ── Confidence ────────────────────────────────────────
    conf_pct   = round(r2 * 100, 1)
    conf_label = "High" if r2 > 0.75 else "Medium" if r2 > 0.45 else "Low"

    # ── Model Fusion ──────────────────────────────────────
    fusion = _model_fusion(slope, r2, holt_next, is_anomaly,
                           current, mins_to_low, thresholds)

    # ── Learning progress ─────────────────────────────────
    dw_min  = (rbuf[-1]["ts"] - rbuf[0]["ts"]).total_seconds() / 60
    lp_score, lp_label = _learning_progress(len(rbuf), len(fill_cycles), dw_min)

    # ── Sustainability ────────────────────────────────────
    rate_lph  = abs(slope) * 3600 / 100 * tank_max_L
    daily_L   = round(rate_lph * 24, 2)
    weekly_L  = round(daily_L * 7, 2)
    monthly_L = round(daily_L * 30, 2)
    saved     = round(max(0, (5.0 - rate_lph) * 24), 2)
    eff       = compute_efficiency_score(fill_cycles, rate_lph, tank_max_L)
    daily_fc  = forecast_daily_usage(fill_cycles, rate_lph, tank_max_L)

    return {
        "ready":              True,
        "status":             "ok",
        "timestamp":          datetime.now().isoformat(),

        # Current
        "current_pct":        round(current, 1),
        "trend":              trend,
        "rate_of_change":     roc,

        # Model A outputs
        "model_a": {
            "name":           "Linear Regression",
            "slope":          round(slope, 6),
            "r_squared":      round(r2, 3),
            "confidence_pct": conf_pct,
            "confidence_label": conf_label,
            "predicted": {
                "5min":  round(pred_at(5),  1),
                "15min": round(pred_at(15), 1),
                "30min": round(pred_at(30), 1),
                "60min": round(pred_at(60), 1),
            },
            "mins_to_low":    round(mins_to_low, 1) if mins_to_low else None,
            "mins_to_low_label": (
                f"{int(mins_to_low//60)}h {int(mins_to_low%60)}m"
                if mins_to_low and mins_to_low >= 60
                else f"{int(mins_to_low)}m" if mins_to_low else "—"
            ),
        },

        # Backward compat aliases
        "r_squared":          round(r2, 3),
        "confidence_pct":     conf_pct,
        "confidence_label":   conf_label,
        "predicted": {
            "5min":  round(pred_at(5),  1),
            "15min": round(pred_at(15), 1),
            "30min": round(pred_at(30), 1),
            "60min": round(pred_at(60), 1),
        },
        "mins_to_low":        round(mins_to_low, 1) if mins_to_low else None,
        "mins_to_low_label":  (
            f"{int(mins_to_low//60)}h {int(mins_to_low%60)}m"
            if mins_to_low and mins_to_low >= 60
            else f"{int(mins_to_low)}m" if mins_to_low else "—"
        ),

        # Model B outputs
        "model_b": {
            "name":           "Holt Time-Series",
            "forecast":       [round(v, 1) for v in holt_next],
            "next_value":     round(holt_next[0], 1) if holt_next else None,
        },
        "holt_forecast":      [round(v, 1) for v in holt_next],

        # Model C outputs
        "model_c": {
            "name":           "Z-Score Anomaly Detector",
            "anomaly":        is_anomaly,
            "z_score":        z_score,
            "status":         "⚠️ Anomaly" if is_anomaly else "✅ Normal",
        },
        "anomaly_detected":   is_anomaly,
        "z_score":            z_score,

        # Fusion
        "fusion":             fusion,

        # Learning
        "learning": {
            "progress":       lp_score,
            "label":          lp_label,
            "readings":       len(rbuf),
            "data_window_min": round(dw_min, 1),
            "fill_cycles":    len(fill_cycles),
        },

        # Backward compat
        "readings_used":      len(rbuf),
        "data_window_min":    round(dw_min, 1),

        # Efficiency + sustainability
        "efficiency":         eff,
        "sustainability": {
            "daily_L":        daily_L,
            "weekly_L":       weekly_L,
            "monthly_L":      monthly_L,
            "liters_saved_vs_baseline": saved,
            "carbon_saved_kg": round(saved * 0.001, 4),
            "efficiency_score": eff["score"],
            "efficiency_label": eff["label"],
        },

        # Forecast
        "daily_forecast":     daily_fc,
    }