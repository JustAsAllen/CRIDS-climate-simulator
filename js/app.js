/* ============================================================================
   CRIDS — Main application controller
   Handles: search, simulation pipeline, metrics, map, charts, comparison,
   optimization (frontend stub), correlation, transparency, report & export.
   ========================================================================== */

"use strict";

var CRIDS = window.CRIDS;
const $ = (id) => document.getElementById(id);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

CRIDS.state = {
  locA: { name: "Delhi", lat: 28.6139, lon: 77.2090, country: "India", state: "Delhi" },
  locB: { name: "Mumbai", lat: 19.0760, lon: 72.8777, country: "India", state: "Maharashtra" },
  startYear: 2000,
  endYear: 2023,
  horizon: 3,
  mode: "complete",
  results: null,
  map: null,
  deps: { locA: 1, locB: 2 }
};

/* ---------------------------------------------------------------- Utilities */
CRIDS.indian = (v) =>
  "₹" + Number(v).toLocaleString("en-IN", { maximumFractionDigits: v % 1 ? 1 : 0 });

CRIDS.toast = function (msg, type) {
  let t = $("toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "toast";
    t.style.cssText = "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);" +
      "z-index:4000;padding:12px 20px;border-radius:12px;font-family:'Space Grotesk';" +
      "font-size:0.85rem;backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.15);" +
      "box-shadow:0 12px 34px rgba(0,0,0,.4);transition:opacity .3s;";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.background = type === "err" ? "rgba(244,63,94,.16)" : "rgba(56,189,248,.14)";
  t.style.color = type === "err" ? "#fb7185" : "#e0f2fe";
  t.style.opacity = "1";
  clearTimeout(t._h);
  t._h = setTimeout(() => (t.style.opacity = "0"), 3400);
};

CRIDS.linearFit = function (xs, ys) {
  const n = xs.length, mX = xs.reduce((a, b) => a + b, 0) / n, mY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mX) * (ys[i] - mY); den += (xs[i] - mX) ** 2; }
  const slope = den ? num / den : 0;
  return { slope, intercept: mY - slope * mX };
};

CRIDS.percentile = function (arr, p) {
  const s = [...arr].sort((a, b) => a - b);
  const idx = (s.length - 1) * p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return s[lo] + (s[hi] - s[lo]) * (idx - lo);
};

/* ---------------------------------------------------------------- Background */
(function initBackground() {
  const host = $("bg-canvas");
  const cv = document.createElement("canvas");
  host.appendChild(cv);
  const ctx = cv.getContext("2d");
  let W, H, DPR;
  const PARTS = 70;

  const rand = (a, b) => a + Math.random() * (b - a);
  let parts = [];

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    cv.width = W * DPR; cv.height = H * DPR;
    cv.style.width = W + "px"; cv.style.height = H + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  function makeP(i) {
    return {
      x: rand(0, W), y: rand(0, H),
      r: rand(0.6, 2.1),
      vx: rand(-0.12, 0.05),
      vy: rand(-0.28, -0.05),
      tw: rand(0, Math.PI * 2),
      tws: rand(0.01, 0.028),
      hue: [203, 172, 160, 158][i % 4],
      drop: Math.random() < 0.14
    };
  }

  function step() {
    ctx.clearRect(0, 0, W, H);
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      p.x += p.vx; p.y += p.vy; p.tw += p.tws;
      if (p.y < -10) { parts[i] = makeP(i); parts[i].y = H + 10; continue; }
      if (p.x < -10) p.x = W + 10; if (p.x > W + 10) p.x = -10;
      const a = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(p.tw));
      ctx.beginPath();
      ctx.fillStyle = `hsla(${p.hue}, 90%, 72%, ${a})`;
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      if (p.drop) {
        ctx.strokeStyle = `hsla(${p.hue}, 88%, 74%, ${a * 0.5})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - 6, p.y + 14);
        ctx.stroke();
      }
    }
    requestAnimationFrame(step);
  }

  resize();
  parts = Array.from({ length: PARTS }, (_, i) => makeP(i));
  addEventListener("resize", resize);
  requestAnimationFrame(step);
})();

/* ---------------------------------------------------------------- Nav pills */
$$(".pill").forEach((b) =>
  b.addEventListener("click", () => {
    $$(".pill").forEach((x) => x.classList.toggle("active", x === b));
    const target = b.dataset.target;
    $$(".section-target").forEach((s) => s.classList.toggle("active", s.id === target));
    if (target === "map") setTimeout(() => { if (CRIDS.state.map) CRIDS.state.map.invalidateSize(); }, 60);
    window.scrollTo({ top: 0, behavior: "smooth" });
  })
);

/* ---------------------------------------------------------------- Search */
function attachSearch(inputId, resultsId, slot) {
  const input = $(inputId), results = $(resultsId);
  let timer = null, items = [];

  function render(list) {
    results.innerHTML = "";
    if (!list.length) {
      results.innerHTML = '<div class="sr-empty">No match — check spelling or try "Mumbai", "Jaipur"&#8230;</div>';
    }
    list.forEach((loc) => {
      const el = document.createElement("div");
      el.className = "sr-item";
      el.innerHTML = `<span>${loc.name}</span><span class="sr-coord">${loc.lat.toFixed(2)}, ${loc.lon.toFixed(2)} · ${loc.state || loc.country}</span>`;
      el.addEventListener("mousedown", (e) => {
        e.preventDefault();
        choose(loc);
      });
      results.appendChild(el);
    });
  }

  function choose(loc) {
    CRIDS.state[slot] = loc;
    input.value = loc.name;
    results.classList.remove("open");
    const meta = $(inputId === "locA-input" ? "locA-meta" : "locB-meta");
    meta.innerHTML =
      `<span class="ml">lat <b>${loc.lat.toFixed(4)}</b></span>` +
      `<span class="ml">lon <b>${loc.lon.toFixed(4)}</b></span>` +
      `<span class="ml">${loc.country}</span>` +
      (loc.state ? `<span class="ml">${loc.state}</span>` : "") +
      `<span class="ml">${loc.clim || "—"}</span>`;
    if (CRIDS.state.map) CRIDS.state.map.invalidateSize();
  }

  async function query(q) {
    // Try gazetteer first (offline-safe).
    const t = q.trim().toLowerCase();
    const local = CRIDS.gazetteer.filter((g) => g.name.toLowerCase().includes(t));
    if (local.length) { items = local; render(items); results.classList.add("open"); return; }

    try {
      const r = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=6&q=${encodeURIComponent(q)}`
      );
      const data = await r.json();
      items = data.map((d) => ({
        name: d.display_name.split(",")[0],
        lat: parseFloat(d.lat), lon: parseFloat(d.lon),
        country: d.display_name.split(",").pop().trim(),
        state: d.display_name.split(",")[1] ? d.display_name.split(",")[1].trim() : ""
      }));
      if (!items.length) throw new Error("empty");
    } catch (e) {
      items = [{ name: q, lat: 0, lon: 0, country: "not resolved", state: "offline gazetteer" }];
      results.innerHTML = '<div class="sr-empty">Geocoder unavailable — check connection to choose a real city.</div>';
    }
    render(items);
    results.classList.add("open");
  }

  input.addEventListener("input", () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (!q) { results.classList.remove("open"); return; }
    timer = setTimeout(() => query(q), 320);
  });
  input.addEventListener("blur", () => setTimeout(() => results.classList.remove("open"), 180));
  input.addEventListener("focus", () => { if (input.value.trim()) query(input.value.trim()); });
}

attachSearch("locA-input", "locA-results", "locA");
attachSearch("locB-input", "locB-results", "locB");

/* Swap button */
$("btn-swap").addEventListener("click", () => {
  const a = CRIDS.state.locA, b = CRIDS.state.locB;
  [CRIDS.state.locA, CRIDS.state.locB] = [b, a];
  $("locA-input").value = a.name; $("locB-input").value = b.name;
  $("locA-meta").innerHTML = ""; $("locB-meta").innerHTML = "";
  for (const [id, loc] of [["locA-input", CRIDS.state.locA], ["locB-input", CRIDS.state.locB]]) {
    const meta = $(id.replace("input", "meta"));
    meta.innerHTML =
      `<span class="ml">lat <b>${loc.lat.toFixed(4)}</b></span>` +
      `<span class="ml">lon <b>${loc.lon.toFixed(4)}</b></span>` +
      `<span class="ml">${loc.country}</span>` +
      (loc.state ? `<span class="ml">${loc.state}</span>` : "");
  }
  CRIDS.toast("Locations swapped");
});

/* ---------------------------------------------------------------- Parameters sync */
function readParams() {
  const s = CRIDS.state;
  const st = $("histStart").value || "2000-01-01";
  const en = $("histEnd").value || "2023-12-31";
  s.startYear = parseInt(st, 10);
  s.endYear = parseInt(en, 10);
  s.horizon = parseInt($("horizon").value, 10);
  s.mode = $("analysisMode").value;
  if (isNaN(s.startYear) || isNaN(s.endYear) || s.startYear > s.endYear) {
    CRIDS.toast("Invalid historical period.", "err");
    return false;
  }
  if (s.endYear - s.startYear < 5) {
    CRIDS.toast("Insufficient historical observations for reliable prediction (need ≥ 5 years).", "err");
    return false;
  }
  return true;
}

$("btn-reset-params").addEventListener("click", () => {
  $("histStart").value = "2000-01-01"; $("histEnd").value = "2023-12-31";
  $("horizon").value = "3"; $("analysisMode").value = "complete";
  $("par-rain").selectedIndex = 0; $("par-temp").selectedIndex = 0;
  $("par-ndvi").selectedIndex = 0; $("par-drought-th").value = "-1.0";
  $("par-extreme-th").value = "95"; $("par-model").value = "ensemble";
  $("par-budget").value = "2500"; $("par-monitor").value = "8";
  $("par-intervent").value = "120"; $("par-sites").value = "14";
  CRIDS.toast("Parameters reset to defaults");
});

/* ---------------------------------------------------------------- Loading overlay */
function animatePipeline(steps) {
  return new Promise((resolve) => {
    const list = $("loading-steps");
    list.innerHTML = steps.map((s) => `<li class="step-inactive">${s}</li>`).join("");
    const lis = $$("#loading-steps li");
    $("sim-loading").classList.remove("hidden");
    let i = 0;
    const tick = setInterval(() => {
      if (i > 0) lis[i - 1].classList.replace("step-active", "step-done");
      if (i < lis.length) lis[i].classList.add("step-active");
      i++;
      if (i > lis.length) {
        clearInterval(tick);
        setTimeout(() => { $("sim-loading").classList.add("hidden"); resolve(); }, 250);
      }
    }, 430);
  });
}

/* ---------------------------------------------------------------- Analysis computation */
function analyzeStation(station, forecast, opts) {
  const months = station.monthly;
  const annual = station.annual;
  const clim = CRIDS.climatology(station);
  const years = annual.map((a) => a.year);

  const fullRain = CRIDS.helper.mean(annual.map((a) => a.rain));          // mm / year
  const fullTemp = CRIDS.helper.mean(annual.map((a) => a.temp));
  const fullNdvi = CRIDS.helper.mean(annual.map((a) => a.ndvi));

  const recentN = Math.min(6, annual.length);
  const recent = annual.slice(-recentN);
  const recentRain = CRIDS.helper.mean(recent.map((a) => a.rain));
  const recentTemp = CRIDS.helper.mean(recent.map((a) => a.temp));
  const recentNdvi = CRIDS.helper.mean(recent.map((a) => a.ndvi));

  const rainAnomPct = ((recentRain - fullRain) / fullRain) * 100;
  const ndviAnom = recentNdvi - fullNdvi;
  const tempAnom = recentTemp - fullTemp;

  const fit = CRIDS.linearFit(years, annual.map((a) => a.rain));
  const trendMmYr = fit.slope;

  const predictedAvg = forecast.length ? CRIDS.helper.mean(forecast.map((f) => f.mean)) : 0;
  const predictedVsClimo = fullRain / 12 ? ((predictedAvg - fullRain / 12) / (fullRain / 12)) * 100 : 0;

  // SPI-based drought metrics
  const spiRecent12 = months.slice(-12).map((m) => m.spi);
  const spiRecent6 = months.slice(-6).map((m) => m.spi);
  const spiPenult = months.slice(-24, -12).map((m) => m.spi);
  const spiNow = CRIDS.helper.mean(spiRecent6);
  const spiBefore = CRIDS.helper.mean(spiPenult.slice(-12));

  const th = parseFloat($("par-drought-th").value) || -1.0;
  const baseDroughtFrac = months.filter((m) => m.spi <= th).length / months.length;

  let droughtClass;
  if (spiNow <= -2) droughtClass = "Extreme";
  else if (spiNow <= -1.5) droughtClass = "Severe";
  else if (spiNow <= -1.0) droughtClass = "Moderate";
  else if (spiNow <= -0.5) droughtClass = "Mild";
  else droughtClass = "Normal";

  const ndviDeficit = Math.max(0, -ndviAnom * 4);
  const droughtProb = Math.min(0.97, Math.max(0.04, baseDroughtFrac * 0.6 + (spiNow <= -2 ? 0.5 : spiNow <= -1 ? 0.28 : 0.08) + ndviDeficit * 0.12));
  const droughtTrend = spiNow < spiBefore - 0.25 ? "Increasing" : spiNow > spiBefore + 0.25 ? "Decreasing" : "Stable";

  // Extreme weather classification (threshold-based demo classifier)
  const pctLvl = parseInt($("par-extreme-th").value, 10) || 95;
  const p = pctLvl / 100;

  const recentMonths = months.slice(-6);
  const climoRainThisSeason = recentMonths.length ? CRIDS.helper.mean(recentMonths.map((m) => {
    const c = clim.find((x) => x.month === m.month);
    return c ? c.rain : m.rain;
  })) : 0;
  const recentRainAvg = CRIDS.helper.mean(recentMonths.map((m) => m.rain));
  const rainRatio = climoRainThisSeason ? recentRainAvg / climoRainThisSeason : 1;

  const climoTemp = CRIDS.helper.mean(clim.map((c) => c.temp));
  const recentTempAvg = CRIDS.helper.mean(recentMonths.map((m) => m.temp));
  const tempZ = climoTemp ? (recentTempAvg - climoTemp) / Math.max(1, CRIDS.helper.mean(clim.map((c) => Math.abs(c.temp)))) : 0;

  let extClass, extProb, contrib;
  if (droughtProb > 0.62) {
    extClass = "Drought"; extProb = Math.min(0.95, droughtProb + 0.08);
    contrib = ["SPI ≤ " + th.toFixed(1), "NDVI deficit", "rainfall anomaly " + rainAnomPct.toFixed(0) + "%"];
  } else if (rainRatio > 1.6 && recentRainAvg > 2.2 * (fullRain / 12)) {
    extClass = "Extreme Rainfall"; extProb = Math.min(0.94, 0.5 + (rainRatio - 1.2) * 0.25);
    contrib = ["rain ratio ×" + rainRatio.toFixed(2), "peak month exceedance", "high soil moisture signal"];
  } else if (rainRatio > 1.25 || recentCumulativeRainIsHigh(months, clim)) {
    extClass = "Flood-prone rainfall"; extProb = Math.min(0.9, 0.45 + (rainRatio - 1.1) * 0.3);
    contrib = ["cumulative rainfall excess", "antecedent soil saturation", "monsoon surge"];
  } else if (tempZ > 0.55) {
    extClass = "Extreme Heat"; extProb = Math.min(0.9, 0.5 + tempZ * 0.3);
    contrib = ["T2M anomaly +" + (tempZ * 1.6).toFixed(1) + "°C", "low heat dissipation"];
  } else {
    extClass = "Normal"; extProb = 0.55 + (1 - Math.abs(rainAnomPct) / 90) * 0.4;
    contrib = ["conditions within climatology", "no threshold exceedance"];
  }
  extProb = Math.min(0.97, +extProb.toFixed(2));

  const riskScore = Math.min(1, droughtProb * 0.55 + (1 - extProb) * 0 + (Math.min(1, Math.abs(rainAnomPct) / 80)) * 0.3 + (1 - recentNdvi) * 0.15);
  const riskLevel = riskScore > 0.66 ? "High" : riskScore > 0.4 ? "Moderate" : "Low";

  // Composite overall climate risk index 0-100
  const extremeRisk01 = extClass === "Normal" ? Math.min(0.5, (1 - extProb) * 0.4) : Math.max(0.4, extProb);
  const overall = Math.round(
    100 * (droughtProb * 0.35 + extremeRisk01 * 0.3 + (Math.min(1, Math.abs(rainAnomPct) / 80)) * 0.2 + Math.max(0, recentNdvi < 0.4 ? 1 - recentNdvi : 0) * 0.15)
  );

  return {
    station, forecast, clim, months, annual,
    fullRain, fullTemp, fullNdvi, recentRain, recentTemp, recentNdvi,
    rainAnomPct, ndviAnom, tempAnom, trendMmYr, predictedAvg, predictedVsClimo,
    spiNow, spiBefore, baseDroughtFrac, droughtClass, droughtProb,
    spiRecent12, spiRecent6, droughtTrend,
    extClass, extProb, riskLevel, riskScore, contrib,
    overall, climoRainThisSeason, recentRainAvg, rainRatio
  };
}

/* helper to detect high cumulative rainfall in wetter-than-average months */
function recentCumulativeRainIsHigh(months, clim) {
  const recent = months.slice(-3);
  let ratioSum = 0;
  for (const m of recent) {
    const c = clim.find((x) => x.month === m.month);
    ratioSum += c ? m.rain / Math.max(1, c.rain) : 1;
  }
  return ratioSum / recent.length > 1.35;
}

function extremeProbabilityRow(a, b) {
  const classes = CRIDS.EXTREME_CLASSES.map((c) => c.key);
  const weights = { "Normal": 0.5, "Extreme Heat": 0.2, "Extreme Rainfall": 0.15, "Drought": 0.1, "Flood-prone rainfall": 0.05 };
  function pack(res) {
    const probs = {};
    let wsum = 0;
    for (const k of classes) {
      let v = weights[k];
      if (k === res.extClass) v = res.extProb;
      else if (k === inverseOf(res.extClass)) v = Math.max(0.02, (1 - res.extProb) * weights[k]);
      probs[k] = v; wsum += v;
    }
    const out = {};
    for (const k of classes) out[k] = +(probs[k] / wsum).toFixed(3);
    return out;
  }
  return { A: pack(a), B: pack(b) };
}

function inverseOf(c) {
  const inv = { "Extreme Heat": "Normal", "Extreme Rainfall": "Extreme Heat", "Drought": "Flood-prone rainfall", "Flood-prone rainfall": "Drought", "Normal": "Extreme Heat" };
  return inv[c] || "Normal";
}

/* ---------------------------------------------------------------- Metric cards */
const METRIC_DEFS = [
  {
    key: "avgRain", title: "Average Rainfall", unit: "mm/yr",
    val: (r) => r.recentRain, hist: (r) => r.fullRain,
    change: (r) => ((r.recentRain - r.fullRain) / r.fullRain) * 100,
    explain: (r) => `Mean annual precipitation over the recent ${Math.min(6, r.annual.length)} years vs the full record (${r.annual.length} yrs).`
  },
  {
    key: "predRain", title: "Predicted Rainfall", unit: "mm/mo",
    val: (r) => r.predictedAvg, hist: (r) => r.fullRain / 12,
    change: (r) => r.predictedVsClimo,
    explain: (r) => `Ensemble forecast mean for the next ${CRIDS.state.horizon} month(s) vs the long-term monthly climatology.`
  },
  {
    key: "temp", title: "Temperature", unit: "°C",
    val: (r) => r.recentTemp, hist: (r) => r.fullTemp,
    change: (r) => r.tempAnom,
    explain: (r) => "Mean air temperature (T2M). Positive change indicates warming relative to the reference climate."
  },
  {
    key: "rainAnom", title: "Rainfall Anomaly", unit: "%",
    val: (r) => r.rainAnomPct, hist: () => 0, change: (r) => r.rainAnomPct,
    explain: (r) => "Percent deviation of recent precipitation from the reference climatology (2000–period mean)."
  },
  {
    key: "ndvi", title: "NDVI", unit: "",
    val: (r) => r.recentNdvi, hist: (r) => r.fullNdvi,
    change: (r) => (r.ndviAnom / Math.max(0.001, r.fullNdvi)) * 100,
    explain: (r) => "Normalized Difference Vegetation Index — satellite-derived measure of vegetation greenness & condition."
  },
  {
    key: "dSev", title: "Drought Severity", unit: "",
    val: (r) => r.droughtClass, hist: () => "—", change: () => 0, isCat: true,
    explain: (r) => `Class from recent SPI value (${r.spiNow.toFixed(2)}) using the configured threshold (≤ threshold).`
  },
  {
    key: "dProb", title: "Drought Probability", unit: "%",
    val: (r) => r.droughtProb * 100, hist: (r) => r.baseDroughtFrac * 100,
    change: (r) => (r.droughtProb - r.baseDroughtFrac) * 100,
    explain: (r) => "Model-estimated likelihood of drought conditions according to the SPI distribution and NDVI deficit."
  },
  {
    key: "extRisk", title: "Extreme Weather Risk", unit: "",
    val: (r) => r.riskLevel, hist: () => "—", change: () => 0, isCat: true,
    explain: (r) => `Classified as "${r.extClass}" (${Math.round(r.extProb * 100)}% probability) from climate thresholds.`
  },
  {
    key: "overall", title: "Overall Climate Risk", unit: "/100",
    val: (r) => r.overall, hist: () => 50, change: (r) => (r.overall - 50),
    explain: (r) => "Weighted composite of drought probability, extreme-event risk and rainfall anomaly (0 = benign, 100 = severe)."
  }
];

function renderMetrics(ra, rb) {
  const mk = (containerId, r, slot, meta) => {
    const host = $(containerId);
    host.innerHTML = "";
    METRIC_DEFS.forEach((d) => {
      const card = document.createElement("div");
      card.className = "metric-card";

      let val, change;
      if (d.isCat) {
        val = d.val(r);
      } else {
        val = d.val(r);
        change = d.change(r);
      }
      let trend = "";
      if (!d.isCat && !isNaN(change)) {
        const arrow = change > 2 ? "▲" : change < -2 ? "▼" : "➤";
        trend = `<div class="mc-change ${change > 2 ? "mc-up risk-low" : change < -2 ? "mc-down risk-high" : "mc-flat"}">${arrow} ${Math.abs(change).toFixed(1)}% ${d.unit && d.unit !== "%" ? "" : ""}</div>`;
      }

      let displayVal;
      if (d.isCat) {
        displayVal = `<span style="font-size:1.15rem;font-family:'Space Grotesk'">${val}</span>`;
        card.classList.add(val === "Extreme" || val === "Severe" || val === "High" ? "risk-high" : val === "Moderate" || ["Mild"].includes(val) ? "risk-med" : "risk-low");
      } else {
        const formatted = typeof val === "number" ? (Math.abs(val) >= 100 ? Math.round(val).toLocaleString("en-IN") : +val.toFixed(1)) : val;
        displayVal = `${formatted} <small>${d.unit}</small>`;
        if (!isNaN(val) && val > 0.7 * (d.hist(r) || 1) && d.title !== "NDVI") card.classList.add("risk-med");
      }

      const histTxt = d.isCat ? "—" : `Hist avg: ${typeof d.hist(r) === "number" ? (+d.hist(r).toFixed(1)).toLocaleString("en-IN") : d.hist(r)} ${d.unit}`;

      card.innerHTML =
        `<div class="mc-top"><span class="mc-title">${d.title}</span><span class="mc-trendflag">${d.isCat ? "" : chartArrowFor(r, d)}</span></div>` +
        `<div class="mc-value">${displayVal}</div>` +
        `<div class="mc-hist">${histTxt}</div>` +
        trend +
        `<div class="mc-explain">${d.explain(r)}</div>`;
      host.appendChild(card);
    });
  };

  mk("metric-A", ra, "locA", $("mA-title"));
  mk("metric-B", rb, "locB", $("mB-title"));

  $("mA-title").textContent = CRIDS.state.locA.name;
  $("mB-title").textContent = CRIDS.state.locB.name;
  $("banner-A-name").textContent = CRIDS.state.locA.name;
  $("banner-B-name").textContent = CRIDS.state.locB.name;
  $("banner-A-coord").textContent = `${ra.station.place.lat.toFixed(3)}, ${ra.station.place.lon.toFixed(3)}`;
  $("banner-B-coord").textContent = `${rb.station.place.lat.toFixed(3)}, ${rb.station.place.lon.toFixed(3)}`;

  // overall risk gauges
  const row = $("overall-risk-row");
  row.innerHTML = [
    mkGauge(ra, "A"),
    mkGauge(rb, "B")
  ].join("");
}

function chartArrowFor(r, d) {
  if (d.key === "dSev" || d.key === "extRisk") return "";
  const v = d.change(r);
  if (isNaN(v)) return "";
  if (v > 2) return "<span class=\"mc-up\">↗</span>";
  if (v < -2) return "<span class=\"mc-down\">↘</span>";
  return "<span class=\"mc-flat\">→</span>";
}

function mkGauge(r, slot) {
  const pct = Math.min(100, Math.max(0, r.overall));
  const color = pct > 66 ? "var(--danger)" : pct > 40 ? "var(--warn)" : "var(--accent2)";
  const label = r.riskLevel;
  return `
  <div class="risk-gauge glass-sub">
    <h4><span class="loc-chip chip-${slot.toLowerCase()}">${slot}</span> Overall Climate Risk — ${r.station.place.name}</h4>
    <div class="gauge-bar"><div class="gauge-fill" style="width:${pct}%;background:linear-gradient(90deg,${color},${color}cc)"></div></div>
    <div class="gauge-labels"><span>Low 0</span><span>${label} · ${pct}/100</span><span>100 Severe</span></div>
  </div>`;
}

/* ---------------------------------------------------------------- Leaflet map */
function initMap() {
  if (CRIDS.state.map) return;
  const map = L.map("leaflet-map", { zoomControl: true, attributionControl: false });
  L.control.attribution({ prefix: false }).addTo(map);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    subdomains: "abcd", maxZoom: 19,
    attribution: '&copy; OpenStreetMap &copy; CARTO'
  }).addTo(map);
  CRIDS.state.map = map;
  map.attributionControl.setPrefix(false);
}

function drawMarkers() {
  const map = CRIDS.state.map;
  map.eachLayer((l) => { if (l instanceof L.CircleMarker || (l.options && l.options._cr)) map.removeLayer(l); });
  if (map._crIcons) map._crIcons.forEach((ic) => map.removeLayer(ic));

  const res = CRIDS.state.results;
  if (!res) return;
  const [ra, rb] = [res.A, res.B];
  const icons = [];

  [["A", ra, "chip-a"], ["B", rb, "chip-b"]].forEach(([slot, r, chipCls]) => {
    const divIcon = L.divIcon({
      className: "cr-marker",
      html: `<div class="cr-marker-pin ${chipCls}">${slot}</div>`,
      iconSize: [30, 30], iconAnchor: [15, 15]
    });
    const m = L.marker([r.station.place.lat, r.station.place.lon], { icon: divIcon, _cr: true });
    m.bindPopup(`
      <b style="color:#38bdf8">${r.station.place.name} (${slot})</b><br/>
      <span style="color:#93a5bd">${r.station.place.lat.toFixed(3)}, ${r.station.place.lon.toFixed(3)}</span><br/>
      Rainfall: <b>${r.recentRain.toFixed(0)} mm/yr</b> (anom ${r.rainAnomPct.toFixed(1)}%)<br/>
      NDVI: <b>${r.recentNdvi.toFixed(2)}</b><br/>
      Drought: <b style="color:${droughtColor(r.droughtClass)}">${r.droughtClass}</b> (${(r.droughtProb * 100).toFixed(0)}%)<br/>
      Extreme class: <b>${r.extClass}</b><br/>
      Risk: <b>${r.riskLevel}</b> · Overall ${r.overall}/100
    `);
    m.addTo(map); icons.push(m);
  });
  map._crIcons = icons;

  const bounds = L.latLngBounds([[ra.station.place.lat, ra.station.place.lon], [rb.station.place.lat, rb.station.place.lon]]);
  if (bounds.isValid()) { map.fitBounds(bounds.pad(0.35)); } else { map.setView([20.5, 78.9], 4); }
}

/* interpolated field for map layers */
function interpolateGrid(ra, rb, field) {
  const [a, b] = [ra, rb];
  const va = valueFor(ra, field), vb = valueFor(rb, field);
  const pts = [];
  const steps = 14;
  const p1lat = a.station.place.lat, p1lon = a.station.place.lon;
  const p2lat = b.station.place.lat, p2lon = b.station.place.lon;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const lat = p1lat + (p2lat - p1lat) * t;
    const lon = p1lon + (p2lon - p1lon) * t;
    const v = va + (vb - va) * t;
    pts.push({ lat, lon, v: t, val: v });
    // perpendicular wiggle for visual richness
    const off = (i % 2 === 0 ? 1 : -1) * (0.08 + v * 0.25);
    pts.push({ lat: lat + off * Math.sign(p2lon - p1lon || 1) * 0.0, lon: lon, v: t, val: v });
    pts.push({ lat: lat + off * 0.4 * (p1lat === p2lat ? 1 : Math.sign(p2lat - p1lat || 1)), lon: lon + off * 0.4, v: t, val: v });
  }
  return { pts, va, vb };
}

function valueFor(r, field) {
  switch (field) {
    case "rainfall": return r.recentRain;
    case "ndvi": return r.recentNdvi;
    case "drought": return r.droughtProb;
    case "temperature": return r.recentTemp;
    case "extreme": return r.riskScore;
  }
  return 0;
}

function layerColor(field, t, va, vb) {
  // normalize t→0..1 value roughly
  let v = 0.5;
  switch (field) {
    case "rainfall": v = clamp((va + (vb - va) * t) / 2400, 0, 1); break;
    case "ndvi": v = clamp((va + (vb - va) * t) / 0.8, 0, 1); break;
    case "drought": v = clamp(va + (vb - va) * t, 0, 1); break;
    case "temperature": v = clamp((va + (vb - va) * t - 10) / 25, 0, 1); break;
    case "extreme": v = clamp(va + (vb - va) * t, 0, 1); break;
  }
  if (field === "ndvi") return hsl(120 - v * 120, 70, 40); // green→red
  if (field === "rainfall") return hsl(200 + (1 - v) * 40, 75, 45);
  if (field === "temperature") return hsl((1 - v) * 60, 80, 45); // cold blue→hot red
  return hsl((1 - v) * 40, 75, 48); // drought/extreme: green→red
}

function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
function hsl(h, s, l) { return `hsl(${h},${s}%,${l}%)`; }

function drawLayer(field) {
  const map = CRIDS.state.map;
  const res = CRIDS.state.results;
  map.eachLayer((l) => { if (l instanceof L.CircleMarker) map.removeLayer(l); });
  const grp = L.layerGroup().addTo(map);
  const { pts, va, vb } = interpolateGrid(res.A, res.B, field);
  pts.forEach((p) => {
    L.circleMarker([p.lat, p.lon], {
      radius: 5, color: "rgba(255,255,255,0.25)", weight: 0.4,
      fillColor: layerColor(field, p.v, va, vb),
      fillOpacity: 0.55
    }).addTo(grp);
  });
  map._crLayer = grp;
  renderLegend(field);
}

function renderLegend(field) {
  const el = $("mapLegend");
  const legend = {
    rainfall: [["<50", "#7dd3fc"], ["600", "#38bdf8"], ["1200", "#0ea5e9"], ["1800+ mm", "#0369a1"]],
    ndvi: [["0.1 sparse", "#ef4444"], ["0.4", "#f59e0b"], ["0.6", "#84cc16"], ["0.8 lush", "#22c55e"]],
    drought: [["low", "#22c55e"], ["mod.", "#f59e0b"], ["severe", "#ef4444"]],
    temperature: [["cool 15°", "#38bdf8"], ["~25°", "#f59e0b"], ["hot 38°+", "#ef4444"]],
    extreme: [["low risk", "#22c55e"], ["mod.", "#f59e0b"], ["high", "#ef4444"]],
  };
  const items = legend[field] || [];
  el.innerHTML = `<span class="lbl">${field}</span>` + items.map(([l, c]) =>
    `<span class="sw" style="background:${c}"></span><span>${l}</span>`).join("");
}

/* ---------------------------------------------------------------- Simulation */
$("btn-run").addEventListener("click", runSimulation);

async function runSimulation() {
  if (!readParams()) return;
  const { locA, locB, startYear, endYear, horizon } = CRIDS.state;

  if (!locA || !locB || locA.lat === 0 || locB.lat === 0) {
    CRIDS.toast("Please choose two valid locations.", "err");
    return;
  }

  await animatePipeline([
    "Ingesting meteorological dataset",
    "Preprocessing & gap-filling",
    (CRIDS.state.mode === "extreme" || CRIDS.state.mode === "complete") ? "Training extreme-weather classifier" : "Training rainfall ensemble model",
    "Computing NDVI & drought indices",
    "Classifying extreme weather",
    "Optimizing resource & cost allocation"
  ].slice(0, 6));

  const modes = CRIDS.state.mode;
  const want = (m) => modes === "complete" || modes === m;

  const stationA = CRIDS.generateStation(locA, startYear, endYear);
  const stationB = CRIDS.generateStation(locB, startYear, endYear);

  const lastA = stationA.monthly[stationA.monthly.length - 1];
  const lastB = stationB.monthly[stationB.monthly.length - 1];
  const forecastA = CRIDS.forecast(stationA, lastA.t.getUTCFullYear(), lastA.month, horizon);
  const forecastB = CRIDS.forecast(stationB, lastB.t.getUTCFullYear(), lastB.month, horizon);

  const analysisA = analyzeStation(stationA, forecastA, {});
  const analysisB = analyzeStation(stationB, forecastB, {});

  CRIDS.state.results = { A: analysisA, B: analysisB, stationA, stationB, forecastA, forecastB };

  const seq = $("sel-hint");
  if (seq) seq.textContent = "";

  renderMetrics(analysisA, analysisB);
  initMap();
  drawMarkers();
  setActiveLayer("rainfall");
  renderRainfallCharts();
  renderDroughtCharts();
  renderExtremeCharts();
  renderCompare();
  renderCorrelation();
  renderTransparency();
  runOptimization();

  activateSection("overview");
  setTimeout(() => {
    if (CRIDS.state.map) CRIDS.state.map.invalidateSize();
  }, 150);
  CRIDS.toast("Simulation complete — results are demonstration data only.");
}

function activateSection(id) {
  $$(".pill").forEach((x) => x.classList.toggle("active", x.dataset.target === id));
  $$(".section-target").forEach((s) => s.classList.toggle("active", s.id === id));
}

/* ---------------------------------------------------------------- Rainfall charts */
function rainSeries(ds, res, which) {
  const s = which === "A" ? res.A.station : res.B.station;
  const yrs = s.monthly;
  const from = new Date($("ts-from").value || (ds.startYear + "-01-01"));
  const to = new Date($("ts-to").value || (ds.endYear + "-12-31"));
  const filt = yrs.filter((m) => m.t >= from && m.t <= to);
  const labels = filt.map((m) => CRIDS.charts.ymLabel(m.year, m.month));
  return { labels, data: filt.map((m) => m.rain) };
}

function gridColors(n) {
  return Array.from({ length: n }, (_, i) => ["#38bdf8", "#34d399", "#a78bfa", "#f59e0b", "#fb7185", "#22d3ee"][i % 6]);
}

function renderRainfallCharts() {
  CRIDS.charts.destroyAll();
  const res = CRIDS.state.results;
  const ds = CRIDS.state;
  const rA = res.A, rB = res.B;

  // --- A. Historical time series (both locations, filtered) ---
  {
    const sA = rainSeries(ds, res, "A");
    const sB = rainSeries(ds, res, "B");
    CRIDS.charts.timeSeries($("chart-hist-series"), sA.labels, [
      { label: `${ds.locA.name}`, data: sA.data, borderColor: "#38bdf8", fill: true, backgroundColor: ctxF("chart-hist-series", "#38bdf8"), tension: 0.3 },
      { label: `${ds.locB.name}`, data: sB.data, borderColor: "#34d399", fill: true, backgroundColor: ctxF("chart-hist-series", "#34d399"), tension: 0.3 }
    ], { legend: true, scales: CRIDS.charts.axes({ ytitle: "Rainfall (mm/month)", zero: true, xticks: 12 }) });
  }

  // --- B. Historical vs Predicted (recent window + forecast w/ uncertainty band) ---
  {
    const winA = rA.months.slice(-36).map((m) => ({ label: CRIDS.charts.ymLabel(m.year, m.month), v: m.rain }));
    const fA = res.forecastA;
    const labels = winA.map((x) => x.label).concat(fA.map((f) => CRIDS.charts.ymLabel(f.year, f.month)));
    const histA = winA.map((x) => x.v);
    const predA = Array(winA.length).fill(null).concat(fA.map((f) => f.mean));
    const lowA = Array(winA.length).fill(null).concat(fA.map((f) => f.low));
    const highA = Array(winA.length).fill(null).concat(fA.map((f) => f.high));

    CRIDS.charts.timeSeries($("chart-hist-pred"), labels, [
      { label: "Historical (A)", data: histA, borderColor: "#38bdf8", pointRadius: 0, tension: 0.3 },
      { label: "Predicted (A)", data: predA, borderColor: "#38bdf8", borderDash: [6, 4], pointRadius: 3, spanGaps: false },
      { label: "Uncertainty band", data: highA, borderColor: "transparent", pointRadius: 0, backgroundColor: "rgba(56,189,248,0.18)", fill: "-1", spanGaps: false },
      { label: "Historical (B)", data: winA.map((_, i) => rB.months.slice(-36)[i].rain), borderColor: "#34d399", pointRadius: 0, tension: 0.3 },
      { label: "Predicted (B)", data: Array(winA.length).fill(null).concat(res.forecastB.map((f) => f.mean)), borderColor: "#34d399", borderDash: [6, 4], pointRadius: 3, spanGaps: false }
    ], {
      legend: true,
      scales: CRIDS.charts.axes({ ytitle: "Rainfall (mm/month)", zero: true, xticks: 14 })
    });
  }

  // --- C. Monthly climatology distribution ---
  {
    const climA = rA.clim, climB = rB.clim;
    const mm = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    CRIDS.charts.bar($("chart-monthly"), mm, [
      { label: ds.locA.name, data: climA.map((c) => +c.rain.toFixed(0)), backgroundColor: "rgba(56,189,248,0.65)", borderRadius: 4 },
      { label: ds.locB.name, data: climB.map((c) => +c.rain.toFixed(0)), backgroundColor: "rgba(52,211,153,0.65)", borderRadius: 4 }
    ], { scales: CRIDS.charts.axes({ ytitle: "Rainfall (mm/month)", zero: true, xticks: 12 }) });
  }

  // --- D. Rainfall anomaly ---
  {
    const anomA = rA.months.slice(-48).map((m) => {
      const c = rA.clim.find((x) => x.month === m.month);
      return { label: CRIDS.charts.ymLabel(m.year, m.month), v: c ? m.rain - c.rain : 0 };
    });
    const anomB = rB.months.slice(-48).map((m) => {
      const c = rB.clim.find((x) => x.month === m.month);
      return { label: CRIDS.charts.ymLabel(m.year, m.month), v: c ? m.rain - c.rain : 0 };
    });
    const allLabels = anomA.map((x) => x.label);
    CRIDS.charts.bar($("chart-anomaly"), allLabels, [
      { label: `${ds.locA.name}`, data: anomA.map((x) => x.v), backgroundColor: anomA.map((x) => x.v >= 0 ? "rgba(56,189,248,0.7)" : "rgba(239,68,68,0.7)"), borderRadius: 2 },
      { label: `${ds.locB.name}`, data: anomB.map((x) => x.v), backgroundColor: anomB.map((x) => x.v >= 0 ? "rgba(52,211,153,0.7)" : "rgba(239,68,68,0.6)"), borderRadius: 2 }
    ], { scales: CRIDS.charts.axes({ ytitle: "Anomaly (mm)", zero: true, xticks: 10 }) });
  }

  // --- E. Long-term trend ---
  {
    const annA = rA.annual.map((a) => a.year);
    const rainA = rA.annual.map((a) => a.rain);
    const fitA = CRIDS.linearFit(annA, rainA);
    const trendA = annA.map((y) => fitA.slope * y + fitA.intercept);

    const annB = rB.annual.map((a) => a.year);
    const rainB = rB.annual.map((a) => a.rain);
    const fitB = CRIDS.linearFit(annB, rainB);

    CRIDS.charts.timeSeries($("chart-trend"), annA, [
      { label: `${ds.locA.name} annual`, data: rainA, borderColor: "#38bdf8", backgroundColor: ctxF("chart-trend", "#38bdf8"), fill: true, pointRadius: 3, tension: 0.25 },
      { label: `${ds.locA.name} trend (${fitA.slope.toFixed(1)} mm/yr)`, data: trendA, borderColor: "#22d3ee", borderDash: [6, 4], pointRadius: 0 },
      { label: `${ds.locB.name} annual`, data: rainB, borderColor: "#34d399", backgroundColor: ctxF("chart-trend", "#34d399"), fill: true, pointRadius: 3, tension: 0.25 },
      { label: `${ds.locB.name} trend (${fitB.slope.toFixed(1)} mm/yr)`, data: annB.map((y) => fitB.slope * y + fitB.intercept), borderColor: "#a7f3d0", borderDash: [6, 4], pointRadius: 0 }
    ], { legend: true, scales: CRIDS.charts.axes({ ytitle: "Rainfall (mm/yr)", zero: true, xticks: 10 }) });
  }

  // model badges
  const m = CRIDS.state.mode;
  $("mi-model").textContent = m.includes("extreme") ? "RandomForest classifier" : "Ensemble (RF + GBDT + MLP 0.4/0.4/0.2)";
  $("mi-train").textContent = `${ds.startYear}–${ds.endYear - 4}`;
  $("mi-pred").textContent = `${ds.endYear + 1} + ${ds.horizon} mo`;
  $("mi-mae").textContent = "demo n/a";
  $("mi-rmse").textContent = "demo n/a";
  $("mi-r2").textContent = "demo n/a";
  $("tr-model").textContent = $("mi-model").textContent;
  $("tr-train").textContent = $("mi-train").textContent;
  $("tr-test").textContent = `${ds.endYear - 3}–${ds.endYear}`;
  $("tr-metrics").textContent = "MAE / RMSE / R² — populated when backend is connected";
}

function ctxF(canvasId, color) {
  const cv = $(canvasId);
  return cv ? CRIDS.charts.fill(cv.getContext("2d"), color) : color;
}

/* ---------------------------------------------------------------- Drought & NDVI charts */
function renderDroughtCharts() {
  const res = CRIDS.state.results;
  const ds = CRIDS.state;
  const rA = res.A, rB = res.B;
  const win = 72; // months

  // NDVI time series
  {
    const mk = (r) => r.months.slice(-win).map((m) => ({ l: CRIDS.charts.ymLabel(m.year, m.month), v: m.ndvi }));
    const nA = mk(rA), nB = mk(rB);
    const labels = nA.map((x) => x.l);
    CRIDS.charts.timeSeries($("chart-ndvi"), labels, [
      { label: ds.locA.name, data: nA.map((x) => x.v), borderColor: "#34d399", backgroundColor: ctxF("chart-ndvi", "#34d399"), fill: true, tension: 0.3 },
      { label: ds.locB.name, data: nB.map((x) => x.v), borderColor: "#a78bfa", backgroundColor: ctxF("chart-ndvi", "#a78bfa"), fill: true, tension: 0.3 }
    ], { legend: true, scales: CRIDS.charts.axes({ ytitle: "NDVI (0–1)", zero: true, xticks: 10 }) });
  }

  // NDVI anomaly
  {
    const mk = (r) => r.months.slice(-win).map((m) => {
      const c = r.clim.find((x) => x.month === m.month);
      return { l: CRIDS.charts.ymLabel(m.year, m.month), v: +(m.ndvi - c.ndvi).toFixed(3) };
    });
    const aA = mk(rA), aB = mk(rB);
    const labels = aA.map((x) => x.l);
    CRIDS.charts.bar($("chart-ndvi-anom"), labels, [
      { label: ds.locA.name, data: aA.map((x) => x.v), backgroundColor: aA.map((x) => x.v >= 0 ? "rgba(52,211,153,0.65)" : "rgba(244,63,94,0.65)") },
      { label: ds.locB.name, data: aB.map((x) => x.v), backgroundColor: aB.map((x) => x.v >= 0 ? "rgba(167,139,250,0.65)" : "rgba(251,113,133,0.65)") }
    ], { scales: CRIDS.charts.axes({ ytitle: "NDVI anomaly", zero: true, xticks: 10 }) });
  }

  // Rainfall vs NDVI scatter
  CRIDS.charts.scatter($("chart-rain-ndvi"), [
    { label: ds.locA.name, data: rA.months.slice(-240).map((m) => ({ x: m.rain, y: m.ndvi })), backgroundColor: "rgba(56,189,248,0.55)", pointRadius: 4 },
    { label: ds.locB.name, data: rB.months.slice(-240).map((m) => ({ x: m.rain, y: m.ndvi })), backgroundColor: "rgba(52,211,153,0.55)", pointRadius: 4 }
  ], { scales: CRIDS.charts.axes({ ytitle: "NDVI", zero: true, xtitle: "Rainfall (mm/month)", xticks: 10 }) });

  // Temperature vs NDVI scatter
  CRIDS.charts.scatter($("chart-temp-ndvi"), [
    { label: ds.locA.name, data: rA.months.slice(-240).map((m) => ({ x: m.temp, y: m.ndvi })), backgroundColor: "rgba(56,189,248,0.55)", pointRadius: 4 },
    { label: ds.locB.name, data: rB.months.slice(-240).map((m) => ({ x: m.temp, y: m.ndvi })), backgroundColor: "rgba(52,211,153,0.55)", pointRadius: 4 }
  ], { scales: CRIDS.charts.axes({ ytitle: "NDVI", zero: true, xtitle: "Temperature (°C)", xticks: 10 }) });

  // SPI time series
  {
    const mk = (r) => r.months.slice(-win).map((m) => ({ l: CRIDS.charts.ymLabel(m.year, m.month), v: m.spi }));
    const sA = mk(rA), sB = mk(rB);
    const labels = sA.map((x) => x.l);
    CRIDS.charts.timeSeries($("chart-spi"), labels, [
      { label: `${ds.locA.name} SPI`, data: sA.map((x) => x.v), borderColor: "#38bdf8", pointRadius: 0, tension: 0.3 },
      { label: `${ds.locB.name} SPI`, data: sB.map((x) => x.v), borderColor: "#f59e0b", pointRadius: 0, tension: 0.3 },
      { label: "Mild threshold (−0.5)", data: labels.map(() => -0.5), borderColor: "rgba(255,255,255,0.3)", borderDash: [4, 4], pointRadius: 0 },
      { label: "Moderate threshold (−1.0)", data: labels.map(() => -1), borderColor: "rgba(245,158,11,0.6)", borderDash: [4, 4], pointRadius: 0 }
    ], { legend: true, scales: CRIDS.charts.axes({ ytitle: "SPI (standardized)", zero: true, xticks: 10 }) });
  }

  // Drought probability forecast (next horizon months)
  {
    const mk = (r, f) => f.map((fm) => ({ l: CRIDS.charts.ymLabel(fm.year, fm.month), v: +probFromForecast(fm, r).toFixed(3) }));
    const pA = mk(rA, res.forecastA);
    const pB = mk(rB, res.forecastB);
    const labels = pA.map((x) => x.l);
    CRIDS.charts.timeSeries($("chart-drought-prob"), labels, [
      { label: ds.locA.name, data: pA.map((x) => x.v), borderColor: "#38bdf8", backgroundColor: ctxF("chart-drought-prob", "#38bdf8"), fill: true, tension: 0.3, pointRadius: 4 },
      { label: ds.locB.name, data: pB.map((x) => x.v), borderColor: "#34d399", backgroundColor: ctxF("chart-drought-prob", "#34d399"), fill: true, tension: 0.3, pointRadius: 4 }
    ], { legend: true, scales: CRIDS.charts.axes({ ytitle: "Drought probability", zero: true, xticks: 6 }) });
  }

  // drought status panels
  ["A", "B"].forEach((slot) => {
    const r = slot === "A" ? rA : rB;
    $("d" + slot + "-name").textContent = r.station.place.name;
    $("d" + slot + "-sev").textContent = r.droughtClass;
    $("d" + slot + "-prob").textContent = (r.droughtProb * 100).toFixed(0) + "%";
    $("d" + slot + "-trend").textContent = r.droughtTrend;
    drawGauge($("drought-gauge-" + slot), droughtColorVal(r.droughtClass), droughtColor(r.droughtClass));
  });
}

function probFromForecast(fm, r) {
  // probability drought given predicted rainfall below climatology
  const c = r.clim.find((x) => x.month === fm.month);
  const fRain = fm.mean;
  const below = c.rain ? (c.rain - fRain) / c.rain : 0; // 0..~
  return Math.min(0.96, Math.max(0.06, r.baseDroughtFrac + below * 0.6));
}

function droughtColor(cls) {
  return { "Normal": "#34d399", "Mild": "#84cc16", "Moderate": "#f59e0b", "Severe": "#f97316", "Extreme": "#ef4444" }[cls] || "#64748b";
}
function droughtColorVal(cls) {
  return CRIDS.severityIndex[cls] || 0;
}

function drawGauge(el, value01, color) {
  const r = 46, c = 2 * Math.PI * r;
  el.innerHTML =
    `<svg width="96" height="96" viewBox="0 0 96 96">` +
    `<circle cx="48" cy="48" r="${r}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="9"/>` +
    `<circle cx="48" cy="48" r="${r}" fill="none" stroke="${color}" stroke-width="9" stroke-linecap="round" ` +
    `stroke-dasharray="${(value01 * c).toFixed(1)} ${c.toFixed(1)}" style="transition:stroke-dasharray 1.2s ease"/></svg>` +
    `<div class="dg-center">${Math.round(value01 * 100)}%</div>`;
}

/* ---------------------------------------------------------------- Extreme weather */
function renderExtremeCharts() {
  const res = CRIDS.state.results;
  const ds = CRIDS.state;
  const rA = res.A, rB = res.B;

  ["A", "B"].forEach((slot) => {
    const r = slot === "A" ? rA : rB;
    $("e" + slot + "-name").textContent = r.station.place.name;
    $("e" + slot + "-class").textContent = r.extClass;
    $("e" + slot + "-class").className = "ext-class c-" + cssClass(r.extClass);
    $("e" + slot + "-prob").textContent = Math.round(r.extProb * 100) + "%";
    $("e" + slot + "-risk").textContent = r.riskLevel + " (" + Math.round(r.riskScore * 100) + ")";
    $("e" + slot + "-contrib").textContent = r.contrib.join(" · ");
  });

  // classification probabilities
  const probs = extremeProbabilityRow(rA, rB);
  const labels = CRIDS.EXTREME_CLASSES.map((c) => c.key);
  const colors = CRIDS.EXTREME_CLASSES.map((c) => c.color);
  CRIDS.charts.doughnut($("chart-ext-prob"), labels, probs.A, colors, { legendPos: "right" });

  // event frequency (month-count climatology from data)
  {
    const count = (r) => labels.map((k) => r.months.filter((m) => classifyMonth(m, r)).length / r.months.length * 100);
    // simpler: use computed classes distribution via thresholds on monthly data
    const freqA = labels.map((k) => freqFor(rA, k));
    const freqB = labels.map((k) => freqFor(rB, k));
    CRIDS.charts.bar($("chart-ext-freq"), labels, [
      { label: ds.locA.name, data: freqA.map((x) => +x.toFixed(2)), backgroundColor: colors.map((c) => c + "aa") },
      { label: ds.locB.name, data: freqB.map((x) => +x.toFixed(2)), backgroundColor: colors.map((c) => c + "55") }
    ], { legend: true, scales: CRIDS.charts.axes({ ytitle: "% of months", zero: true, xticks: 8 }) });
  }

  // historical extreme-event timeline (scatter bubbles)
  {
    const mk = (r) => r.months.slice(-120).filter((m) => classifyMonth(m, r)).map((m) => ({
      x: m.t, y: severityForMonth(m, r), r: 4, className: extClassForMonth(m, r)
    }));
    const evA = mk(rA), evB = mk(rB);
    const labels2 = ["events"];
    const datasets = [
      { label: ds.locA.name, data: evA, backgroundColor: evA.map((e) => eventColor(e.className)), pointRadius: 6 },
      { label: ds.locB.name, data: evB, backgroundColor: evB.map((e) => eventColor(e.className)), pointRadius: 6 }
    ];
    const ctx = $("chart-ext-timeline").getContext("2d");
    CRIDS.charts.register(new Chart(ctx, {
      type: "scatter",
      data: { datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { generateLabels: () => eventLegend() } } },
        scales: {
          x: { type: "time", grid: { color: "rgba(255,255,255,0.05)" }, title: { display: true, text: "Time (last 10 yrs)", color: "#93a5bd" } },
          y: { min: 0, max: 1, grid: { color: "rgba(255,255,255,0.06)" }, title: { display: true, text: "Severity", color: "#93a5bd" }, ticks: { callback: (v) => ["","Mild","Moderate","Severe","Extreme"][Math.round(v*4)] } }
        }
      }
    }));
  }
}

function classifyMonth(m, r) {
  const c = r.clim.find((x) => x.month === m.month);
  if (!c) return false;
  return (m.rain > c.rain * 2.2) || (m.spi <= -1.4) || (m.temp > c.temp + 3);
}
function severityForMonth(m, r) {
  const c = r.clim.find((x) => x.month === m.month) || { rain: 1, temp: 20, ndvi: 0.5 };
  return Math.min(0.98, Math.max(0.05, m.spi <= -1.4 ? (-m.spi) / 2.2 : Math.min(1, m.rain / (c.rain * 3))));
}
function extClassForMonth(m, r) {
  const c = r.clim.find((x) => x.month === m.month);
  if (!c) return "Normal";
  if (m.spi <= -1.4) return "Drought";
  if (m.rain > c.rain * 2.2) return "Extreme Rainfall";
  if (m.temp > c.temp + 3) return "Extreme Heat";
  return "Normal";
}
function eventColor(cls) {
  return { "Drought": "#f59e0b", "Extreme Rainfall": "#38bdf8", "Extreme Heat": "#fb7185", "Normal": "#64748b" }[cls];
}
function eventLegend() {
  return [
    { text: "Drought", fillStyle: "#f59e0b", strokeStyle: "#f59e0b" },
    { text: "Extreme Rainfall", fillStyle: "#38bdf8", strokeStyle: "#38bdf8" },
    { text: "Extreme Heat", fillStyle: "#fb7185", strokeStyle: "#fb7185" }
  ];
}
function freqFor(r, k) {
  const n = r.months.length;
  const c = r.months.filter((m) => extClassForMonth(m, r) === k).length;
  return (c / n) * 100;
}
function cssClass(name) {
  return name.replace(/\s+/g, "-").toLowerCase();
}

/* ---------------------------------------------------------------- Comparison */
function compareRows(ra, rb) {
  const mk = (key, label, va, vb, fmt, diffDesc) => ({ key, label, va, vb, fmt, diff: +vb.toFixed(2) - +va.toFixed(2), diffDesc });
  const rows = [
    mk("rain", "Average Rainfall (mm/yr)", ra.recentRain, rb.recentRain, (v) => v.toFixed(0)),
    mk("pred", "Predicted Rainfall (mm/mo)", ra.predictedAvg, rb.predictedAvg, (v) => v.toFixed(1)),
    mk("temp", "Temperature (°C)", ra.recentTemp, rb.recentTemp, (v) => v.toFixed(1)),
    mk("ndvi", "NDVI (0–1)", ra.recentNdvi, rb.recentNdvi, (v) => v.toFixed(2)),
    mk("ranom", "Rainfall Anomaly (%)", ra.rainAnomPct, rb.rainAnomPct, (v) => v.toFixed(1)),
    mk("nanom", "NDVI Anomaly (×10⁻²)", kryud(ra.ndviAnom), kryud(rb.ndviAnom), (v) => (v * 1).toFixed(1)),
    mk("dsev", "Drought Severity (index)", CRIDS.severityIndex[ra.droughtClass], CRIDS.severityIndex[rb.droughtClass], (v) => v.toFixed(2), "higher = worse"),
    mk("dprob", "Drought Probability (%)", ra.droughtProb * 100, rb.droughtProb * 100, (v) => v.toFixed(0)),
    mk("ext", "Extreme Weather Risk (%)", ra.riskScore * 100, rb.riskScore * 100, (v) => v.toFixed(0)),
    mk("trend", "Rainfall trend (mm/yr)", ra.trendMmYr, rb.trendMmYr, (v) => v.toFixed(1)),
    mk("cost", "Optimization Cost (₹ Cr)", estimatedCurrent(ra, rb).A, estimatedCurrent(ra, rb).B, (v) => v.toFixed(0))
  ];
  return rows;
}

function kryud(v) { return +(v * 100).toFixed(1); }

function estimatedCurrent(ra, rb) {
  const base = (r) => Math.round(300 + (1 - r.recentNdvi) * 700 + (1 - r.riskScore) * 0);
  const a = Math.round(120 + (1 - ra.recentNdvi) * 480 + ra.droughtProb * 500);
  const b = Math.round(120 + (1 - rb.recentNdvi) * 480 + rb.droughtProb * 500);
  return { A: a, B: b };
}

function renderCompare() {
  const res = CRIDS.state.results;
  const ds = CRIDS.state;
  const ra = res.A, rb = res.B;
  const rows = compareRows(ra, rb);

  const body = $("comp-table-body");
  body.innerHTML = rows.map((r) => {
    const d = r.diff;
    const diffTxt = Math.abs(d) < 0.05 ? "≈ equal" : (d > 0 ? "+" : "−") + Math.abs(d).toFixed(r.diffDesc ? 2 : 1) + (r.diffDesc ? " (" + r.diffDesc + ")" : "");
    return `<tr>
      <td class="metric-name">${r.label}</td>
      <td>${r.fmt(r.va)}</td>
      <td>${r.fmt(r.vb)}</td>
      <td style="color:${d === 0 ? "var(--muted)" : d > 0 ? "var(--accent2)" : "var(--danger)"}">${diffTxt}</td>
    </tr>`;
  }).join("");

  // Radar: normalized scores 0..1 where feasible
  const normalize = (va, vb, invert) => {
    if (!isFinite(va) || !isFinite(vb) || va === vb) return [0.5, 0.5];
    const hi = Math.max(va, vb), lo = Math.min(va, vb);
    let na = (va - lo) / (hi - lo || 1), nb = (vb - lo) / (hi - lo || 1);
    if (invert) { na = 1 - na; nb = 1 - nb; }
    return [na, nb];
  };

  const metrics = [
    { label: "Rainfall", va: ra.recentRain, vb: rb.recentRain },
    { label: "NDVI", va: ra.recentNdvi, vb: rb.recentNdvi, invert: true },
    { label: "Drought prob", va: ra.droughtProb, vb: rb.droughtProb },
    { label: "Extreme risk", va: ra.riskScore, vb: rb.riskScore },
    { label: "Rain anom", va: Math.abs(ra.rainAnomPct), vb: Math.abs(rb.rainAnomPct) },
    { label: "Temp", va: ra.recentTemp, vb: rb.recentTemp },
    { label: "NDVI anom", va: Math.abs(ra.ndviAnom), vb: Math.abs(rb.ndviAnom) },
    { label: "Overall risk", va: ra.overall, vb: rb.overall }
  ];
  const labels = metrics.map((m) => m.label);
  const aVals = metrics.map((m) => normalize(m.va, m.vb, m.invert)[0]);
  const bVals = metrics.map((m) => normalize(m.va, m.vb, m.invert)[1]);

  CRIDS.charts.radar($("chart-compare-radar"), labels, [
    { label: ds.locA.name, data: aVals, borderColor: "#38bdf8", backgroundColor: "rgba(56,189,248,0.15)", pointBackgroundColor: "#38bdf8", borderWidth: 2 },
    { label: ds.locB.name, data: bVals, borderColor: "#34d399", backgroundColor: "rgba(52,211,153,0.15)", pointBackgroundColor: "#34d399", borderWidth: 2 }
  ], {});

  // Bar comparison
  const abar = metrics.map((m) => +(m.va * (m.label === "Rain anom" || m.label === "NDVI anom" ? 1 : 1)).toFixed(2));
  CRIDS.charts.bar($("chart-compare-bar"), labels.map((l) => l), [
    { label: ds.locA.name, data: aVals.map((x) => +x.toFixed(3)), backgroundColor: "rgba(56,189,248,0.7)", borderRadius: 4 },
    { label: ds.locB.name, data: bVals.map((x) => +x.toFixed(3)), backgroundColor: "rgba(52,211,153,0.7)", borderRadius: 4 }
  ], { legend: true, scales: CRIDS.charts.axes({ ytitle: "normalized score (0–1)", zero: true, xticks: 6 }) });

  // Autosummary
  const out = $("autosummary");
  const parts = [];
  parts.push(`<div class="as-block"><b>${ds.locA.name} currently shows</b> average rainfall of <b>${ra.recentRain.toFixed(0)} mm/yr</b> (${ra.rainAnomPct >= 0 ? "+" : ""}${ra.rainAnomPct.toFixed(0)}% vs climatology), NDVI <b>${ra.recentNdvi.toFixed(2)}</b>, drought probability <b>${(ra.droughtProb * 100).toFixed(0)}%</b> and extreme-weather class <b>${ra.extClass}</b>. Overall climate risk index: <b>${ra.overall}/100</b>.</div>`);
  parts.push(`<div class="as-block"><b>${ds.locB.name} currently shows</b> average rainfall of <b>${rb.recentRain.toFixed(0)} mm/yr</b> (${rb.rainAnomPct >= 0 ? "+" : ""}${rb.rainAnomPct.toFixed(0)}% vs climatology), NDVI <b>${rb.recentNdvi.toFixed(2)}</b>, drought probability <b>${(rb.droughtProb * 100).toFixed(0)}%</b> and extreme-weather class <b>${rb.extClass}</b>. Overall climate risk index: <b>${rb.overall}/100</b>.</div>`);

  const rainDiff = Math.abs(ra.recentRain - rb.recentRain);
  const diffLine = ra.recentRain > rb.recentRain
    ? `<div class="as-block"><b>Major difference:</b> <b>${ds.locA.name}</b> receives ${rainDiff.toFixed(0)} mm/yr more rain than <b>${ds.locB.name}</b> (${ra.recentRain.toFixed(0)} vs ${rb.recentRain.toFixed(0)} mm/yr).</div>`
    : `<div class="as-block"><b>Major difference:</b> <b>${ds.locB.name}</b> receives ${rainDiff.toFixed(0)} mm/yr more rain than <b>${ds.locA.name}</b> (${rb.recentRain.toFixed(0)} vs ${ra.recentRain.toFixed(0)} mm/yr).</div>`;
  parts.push(diffLine);

  const higherDrought = ra.droughtProb > rb.droughtProb ? ds.locA.name : ds.locB.name;
  parts.push(`<div class="as-block"><b>Higher drought vulnerability:</b> ${higherDrought === ds.locA.name ? ds.locA.name + " (" + (ra.droughtProb * 100).toFixed(0) + "%) > " + ds.locB.name + " (" + (rb.droughtProb * 100).toFixed(0) + "%)" : ds.locB.name + " (" + (rb.droughtProb * 100).toFixed(0) + "%) > " + ds.locA.name + " (" + (ra.droughtProb * 100).toFixed(0) + "%)"}.</div>`);

  const higherExt = ra.riskScore > rb.riskScore ? ds.locA.name : ds.locB.name;
  parts.push(`<div class="as-block"><b>Higher extreme-weather risk:</b> ${higherExt} (${(Math.max(ra.riskScore, rb.riskScore) * 100).toFixed(0)}% vs ${(Math.min(ra.riskScore, rb.riskScore) * 100).toFixed(0)}%).</div>`);

  parts.push(`<div class="as-block muted" style="font-family:var(--font-mono);font-size:.75rem"><i>Narrative generated from calculated values only — demonstration data.</i></div>`);
  out.innerHTML = parts.join("");
}

/* ---------------------------------------------------------------- Correlation */
function renderCorrelation() {
  const res = CRIDS.state.results;
  const rA = res.A, rB = res.B;
  const monthsA = rA.months.slice(-240);
  const monthsB = rB.months.slice(-240);

  const corr = (xs, ys) => {
    const n = Math.min(xs.length, ys.length);
    if (n < 3) return 0;
    const mx = xs.slice(0, n).reduce((a, b) => a + b, 0) / n;
    const my = ys.slice(0, n).reduce((a, b) => a + b, 0) / n;
    let num = 0, dx = 0, dy = 0;
    for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); dx += (xs[i] - mx) ** 2; dy += (ys[i] - my) ** 2; }
    return dx && dy ? num / Math.sqrt(dx * dy) : 0;
  };

  const keys = ["Rainfall", "Temperature", "NDVI", "SPI", "Extreme (1/0)"];
  const matA = [], matB = [];

  const featsOf = (F) => ({
    "Rainfall": (m) => m.rain,
    "Temperature": (m) => m.temp,
    "NDVI": (m) => m.ndvi,
    "SPI": (m) => m.spi,
    "Extreme (1/0)": (m) => extClassForMonth(m, F) === "Normal" ? 0 : 1
  });
  const vA = featsOf(rA), vB = featsOf(rB);
  keys.forEach((k1, i) => {
    matA[i] = keys.map((k2, j) => i === j ? 1 : corr(monthsA.map(vA[k1]), monthsA.map(vA[k2])));
    matB[i] = keys.map((k2, j) => i === j ? 1 : corr(monthsB.map(vB[k1]), monthsB.map(vB[k2])));
  });

  drawCorrelationMatrix($("chart-corr-matrix"), keys, matA, matB);

  function scatter(canvas, xFn, yFn, xlabel, ylabel) {
    const dsA = monthsA.map((m) => ({ x: xFn(m), y: yFn(m) }));
    const dsB = monthsB.map((m) => ({ x: xFn(m), y: yFn(m) }));
    CRIDS.charts.scatter(canvas, [
      { label: CRIDS.state.locA.name, data: dsA, backgroundColor: "rgba(56,189,248,0.5)", pointRadius: 3 },
      { label: CRIDS.state.locB.name, data: dsB, backgroundColor: "rgba(52,211,153,0.5)", pointRadius: 3 }
    ], { scales: CRIDS.charts.axes({ ytitle: ylabel, zero: false, xtitle: xlabel, xticks: 8 }) });
  }
  scatter($("chart-scatter-rainnd"), (m) => m.rain, (m) => m.ndvi, "Rainfall (mm)", "NDVI");
  scatter($("chart-scatter-tempnd"), (m) => m.temp, (m) => m.ndvi, "Temperature (°C)", "NDVI");
}

function drawCorrelationMatrix(canvas, keys, matA, matB) {
  const cell = 44, pad = 8, headH = 60;
  const n = keys.length;
  const block = 34 + n * (cell + pad) + 14;
  const W = block * 2;
  const H = n * (cell + pad) + headH;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.width = "100%";
  canvas.style.height = Math.max(230, H) + "px";
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  const color = (v) =>
    v >= 0 ? `rgba(56,189,248,${0.12 + Math.abs(v) * 0.85})`
           : `rgba(244,63,94,${0.12 + Math.abs(v) * 0.85})`;

  function drawBlock(offX, mat, title) {
    ctx.font = "700 11px 'Inter', sans-serif";
    ctx.fillStyle = "#38bdf8";
    ctx.fillText(title, offX, 12);
    ctx.font = "10px 'JetBrains Mono', monospace";
    ctx.fillStyle = "#64748b";
    keys.forEach((k, i) => {
      ctx.fillText(k.slice(0, 9) + (k.length > 9 ? "…" : ""), offX - 6, headH + i * (cell + pad) + cell / 2 + 3, 44);
      ctx.save(); ctx.translate(offX + 16, headH + i * (cell + pad) + cell / 2 - 4); ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = "#93a5bd"; ctx.fillText(k.slice(0, 7) + (k.length > 7 ? "…" : ""), 0, 0, 40); ctx.restore();
    });
    for (let i = 0; i < keys.length; i++) {
      for (let j = 0; j < keys.length; j++) {
        const x = offX + 26 + j * (cell + pad);
        const y = headH + i * (cell + pad);
        const v = mat[i][j];
        ctx.fillStyle = color(v);
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(x, y, cell, cell, 6) : ctx.rect(x, y, cell, cell);
        ctx.fill();
        ctx.fillStyle = Math.abs(v) > 0.55 ? "#04101c" : "#dce9f6";
        ctx.font = i === j ? "700 11px 'JetBrains Mono'" : "10px 'JetBrains Mono'";
        ctx.textAlign = "center";
        ctx.fillText(v.toFixed(2), x + cell / 2, y + cell / 2 + 4, cell - 4);
        ctx.textAlign = "left";
      }
    }
  }

  drawBlock(0, matA, "Location A");
  drawBlock(block + 8, matB, "Location B");
  // scale bar hint
  ctx.font = "9px 'JetBrains Mono'"; ctx.fillStyle = "#64748b";
  ctx.fillText("−1 (inverse)         0          +1 (aligned)", W - 220, H - 4);
}

/* ---------------------------------------------------------------- Optimization (demo stub) */
$("btn-run-opt").addEventListener("click", runOptimization);
$("opt-budget").addEventListener("input", () => { if (CRIDS.state.results) runOptimization(); });

function runOptimization() {
  const res = CRIDS.state.results;
  if (!res) return;
  const { A, B } = res;

  const budget = +$("opt-budget").value || 2500;
  const monCost = +$("opt-monitor").value || 8;
  const intCost = +$("opt-intervent").value || 120;
  const sites = +$("opt-sites").value || 14;
  const loss = +$("opt-loss").value || 640;
  const target = +$("opt-target").value || 35;

  // risk weights per location  [0..1]
  const riskA = A.overall / 100;
  const riskB = B.overall / 100;
  const riskMid = 0.45;

  const locs = [
    { name: A.station.place.name, risk: riskA, region: A.station.place.state || "" },
    { name: B.station.place.name, risk: riskB, region: B.station.place.state || "" },
    { name: "Basin nodal point C", risk: riskMid },
    { name: "Basin nodal point D", risk: 0.5 - Math.abs(riskA - riskB) * 0.2 }
  ];

  // baseline (pre-optimization, non-targeted)
  const baseMonitoring = sites * monCost;
  const baseInterventions = (riskA + riskB) * intCost * 3;
  const baseLoss = loss * 0.85;         // 15% baseline risk reduction from ad-hoc spending
  const currentCost = baseMonitoring + baseInterventions + baseLoss;

  // greedy: allocate monitoring budget to highest risk until all covered; then interventions
  const sorted = [...locs].sort((x, y) => y.risk - x.risk);
  const alloc = [];
  let remain = budget;
  const achievedReduction = 0;
  const assignedMonitoring = [];
  for (const l of sorted) {
    const need = monCost * 2 * l.risk + 2;
    const assign = Math.min(need, remain);
    if (assign > 0) { assignedMonitoring.push({ name: l.name, risk: l.risk, spend: assign }); remain -= assign; }
  }
  const intBudget = remain * 0.55;
  const reserve = remain - intBudget;

  const interventionFrac = Math.min(1, target / 100 + (A.riskScore + B.riskScore) / 2 * 0.15);
  const monFrac = assignedMonitoring.length / sites;
  const achievedFrac = Math.min(0.9, monFrac * 0.35 + interventionFrac * 0.65);

  const optimizedCost = baseMonitoring * monFrac + baseInterventions * interventionFrac + loss * (1 - achievedFrac);
  const savings = currentCost - optimizedCost;
  const riskReduction = achievedFrac * 100;

  // UI
  $("op-current").textContent = CRIDS.indian(currentCost) + " Cr";
  $("op-optimized").textContent = CRIDS.indian(Math.max(0, optimizedCost)) + " Cr";
  $("op-savings").textContent = CRIDS.indian(Math.max(0, savings)) + " Cr (" + (Math.max(0, savings) / currentCost * 100).toFixed(0) + "%)";
  $("op-riskred").textContent = riskReduction.toFixed(0) + "%";

  const allocBox = $("op-alloc");
  const lines = assignedMonitoring.map((a) =>
    `<div class="alloc-line"><span>${a.name} (risk ${(a.risk * 100).toFixed(0)})</span><span>${CRIDS.indian(a.spend)} Cr</span></div>`).join("");
  allocBox.innerHTML =
    `<h4 style="font-family:'Space Grotesk';font-size:.85rem;margin-bottom:8px">Recommended allocation</h4>` +
    lines +
    `<div class="alloc-line"><span>Interventions reserve (${interventionFrac * 100}% uptake)</span><span>${CRIDS.indian(intBudget)} Cr</span></div>` +
    `<div class="alloc-line"><span>Unallocated reserve</span><span>${CRIDS.indian(Math.max(0, reserve))} Cr</span></div>` +
    `<p class="note" style="margin-top:8px">Demo heuristic for the frontend stub — connect your optimisation algorithm via <code>/optimization</code>. Assumptions: risk-weighted monitoring priority, linear intervention uptake, base losses = ₹${loss} Cr.</p>`;

  // chart before/after
  const ctx = $("chart-opt");
  if (CRIDS.charts.registry.some((c) => c.canvas === ctx)) { const c = CRIDS.charts.registry.find((ch) => ch.canvas === ctx); c.destroy(); }
  CRIDS.charts.bar(ctx, ["Current", "Optimized"], [
    { label: "Monitoring", data: [baseMonitoring, baseMonitoring * monFrac], backgroundColor: ["rgba(56,189,248,0.7)", "rgba(56,189,248,0.4)"] },
    { label: "Interventions", data: [baseInterventions, baseInterventions * interventionFrac], backgroundColor: ["rgba(167,139,250,0.7)", "rgba(167,139,250,0.4)"] },
    { label: "Expected loss", data: [baseLoss, loss * (1 - achievedFrac)], backgroundColor: ["rgba(244,63,94,0.7)", "rgba(244,63,94,0.4)"] }
  ], { stacked: false, legend: true, scales: CRIDS.charts.axes({ ytitle: "₹ Cr", zero: true, xticks: 6 }) });
}

/* ---------------------------------------------------------------- Transparency */
function renderTransparency() {
  const ds = CRIDS.state;
  $("tr-period").textContent = `${ds.startYear}-01-01 → ${ds.endYear}-12-31`;
  const n = $("tr-obs");
  if (ds.results) n.textContent = ds.results.stationA.monthly.length + " monthly / location";
  $("tr-model").textContent = $("mi-model").textContent;
}

/* ---------------------------------------------------------------- Export */
function toCSV(rows) {
  return rows.map((r) => r.map((v) => (typeof v === "string" && v.includes(",") ? '"' + v + '"' : v)).join(",")).join("\n");
}

function download(filename, content, type = "text/csv") {
  const blob = new Blob([content], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

$("btn-export-rainfall").addEventListener("click", () => {
  const res = CRIDS.state.results;
  if (!res) { CRIDS.toast("Run a simulation first.", "err"); return; }
  const st = res.stationA.monthly;
  const rows = [["Year-Month", "LocA_Rain(mm)", "LocB_Rain(mm)", "LocA_NDVI", "LocB_NDVI"]];
  res.stationA.monthly.forEach((m, i) => {
    rows.push([CRIDS.charts.ymLabel(m.year, m.month), m.rain, res.stationB.monthly[i].rain, m.ndvi, res.stationB.monthly[i].ndvi]);
  });
  download("crids-rainfall.csv", toCSV(rows));
});

$("btn-csv").addEventListener("click", () => $("btn-export-rainfall").click());
$("btn-csv-full").addEventListener("click", () => {
  const res = CRIDS.state.results;
  if (!res) { CRIDS.toast("Run a simulation first.", "err"); return; }
  const ra = res.A, rb = res.B;
  const rows = [["Metric", "LocationA", "LocationB"]];
  compareRows(ra, rb).forEach((r) => rows.push([r.label, r.fmt(r.va), r.fmt(r.vb)]));
  CRIDS.state.resultsFull = rows;
  download("crids-metrics.csv", toCSV(rows));
});

/* ---------------------------------------------------------------- Report */
$("btn-report").addEventListener("click", () => {
  const res = CRIDS.state.results;
  if (!res) { CRIDS.toast("Run a simulation first.", "err"); return; }
  buildReport();
});
$("btn-print").addEventListener("click", () => {
  const res = CRIDS.state.results;
  if (!res) { CRIDS.toast("Run a simulation first.", "err"); return; }
  buildReport(true);
});

function buildReport(print) {
  const res = CRIDS.state.results;
  const ds = CRIDS.state;
  const ra = res.A, rb = res.B;
  const m = ds.mode;
  const rows = compareRows(ra, rb);

  const chartsHTML = CRIDS.charts.registry
    .filter((c) => c.canvas.id && c.canvas.id.length)
    .map((c) => `<figure>
      <img style="max-width:340px;border-radius:10px;margin:6px" src="${c.toBase64Image()}" alt="${c.canvas.id}" lazyload="on"/>
      <figcaption style="font-size:.7rem;color:#64748b">${c.canvas.id.replace(/-/g, " ")}</figcaption>
    </figure>`).slice(0, 10).join("");

  const mrk = (name) => `
    <tr><td style="font-weight:600;padding:4px 10px">${name}</td></tr>`;

  const html = `
  <!DOCTYPE html><html><head><meta charset="utf-8"><title>CRIDS Report</title>
  <style>
    body{font-family:'Segoe UI',Arial,sans-serif;color:#1e293b;background:#fff;max-width:900px;margin:0 auto;padding:30px}
    h1{font-size:22px;border-bottom:3px solid #0ea5e9;padding-bottom:8px}
    h2{font-size:16px;color:#0369a1;margin-top:26px;border-bottom:1px solid #cbd5e1;padding-bottom:4px}
    table{border-collapse:collapse;width:100%;font-size:13px}
    th,td{border:1px solid #e2e8f0;padding:6px 9px;text-align:left}
    th{background:#f1f5f9}
    .tag{background:#b45309;color:#fff;display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px}
    .banner{border-left:4px solid #0ea5e9;padding:8px 12px;background:#f0f9ff;margin:10px 0}
    .figures{display:flex;flex-wrap:wrap}
    .muted{color:#64748b;font-size:12px}
  </style></head><body>
  <span class="tag">DEMONSTRATION DATA — not real measurements</span>
  <h1>Climate, Rainfall &amp; Drought Intelligence Simulator<br><span style="font-size:13px;color:#64748b;font-weight:400">Simulation Report · CRIDS v${CRIDS.VERSION} · ${new Date().toLocaleString()}</span></h1>

  <h2>1. Locations</h2>
  <table><tr><th></th><th>Location A</th><th>Location B</th></tr>
    <tr><td>Name</td><td>${ds.locA.name}</td><td>${ds.locB.name}</td></tr>
    <tr><td>Coordinates</td><td>${ds.locA.lat}, ${ds.locA.lon}</td><td>${ds.locB.lat}, ${ds.locB.lon}</td></tr>
    <tr><td>Region</td><td>${ds.locA.country} · ${ds.locA.state || "—"}</td><td>${ds.locB.country} · ${ds.locB.state || "—"}</td></tr></table>

  <h2>2. Simulation settings</h2>
  <p>Historical period: <b>${ds.startYear}–${ds.endYear}</b> · Prediction horizon: <b>${ds.horizon} month(s)</b> · Analysis mode: <b>${$("analysisMode").selectedOptions[0].text}</b></p>

  <h2>3. Dataset</h2>
  <div class="banner">Demonstration climatology (CRIDS Demo v0.1) — synthetic, seeded by location coordinates. Replace with project dataset via the backend service (<code>/historical-data</code>).</div>

  <h2>4. Rainfall analysis</h2>
  <table><tr><th>Indicator</th><th>Location A</th><th>Location B</th></tr>
    <tr><td>Avg rainfall</td><td>${ra.recentRain.toFixed(0)} mm/yr</td><td>${rb.recentRain.toFixed(0)} mm/yr</td></tr>
    <tr><td>Rain anomaly</td><td>${ra.rainAnomPct.toFixed(1)}%</td><td>${rb.rainAnomPct.toFixed(1)}%</td></tr>
    <tr><td>Predicted (${ds.horizon}mo)</td><td>${ra.predictedAvg.toFixed(1)} mm/mo</td><td>${rb.predictedAvg.toFixed(1)} mm/mo</td></tr>
    <tr><td>Trend</td><td>${ra.trendMmYr > 0 ? "+" : ""}${ra.trendMmYr.toFixed(1)} mm/yr</td><td>${rb.trendMmYr > 0 ? "+" : ""}${rb.trendMmYr.toFixed(1)} mm/yr</td></tr></table>

  <h2>5. Drought &amp; NDVI analysis</h2>
  <table><tr><th>Indicator</th><th>Location A</th><th>Location B</th></tr>
    <tr><td>NDVI</td><td>${ra.recentNdvi.toFixed(2)}</td><td>${rb.recentNdvi.toFixed(2)}</td></tr>
    <tr><td>NDVI anomaly</td><td>${(ra.ndviAnom * 100).toFixed(1)}×10⁻²</td><td>${(rb.ndviAnom * 100).toFixed(1)}×10⁻²</td></tr>
    <tr><td>Severity</td><td>${ra.droughtClass}</td><td>${rb.droughtClass}</td></tr>
    <tr><td>Probability</td><td>${(ra.droughtProb * 100).toFixed(0)}%</td><td>${(rb.droughtProb * 100).toFixed(0)}%</td></tr>
    <tr><td>Trend</td><td>${ra.droughtTrend}</td><td>${rb.droughtTrend}</td></tr></table>

  <h2>6. Extreme weather classification</h2>
  <table><tr><th>Indicator</th><th>Location A</th><th>Location B</th></tr>
    <tr><td>Predicted class</td><td>${ra.extClass}</td><td>${rb.extClass}</td></tr>
    <tr><td>Probability</td><td>${Math.round(ra.extProb * 100)}%</td><td>${Math.round(rb.extProb * 100)}%</td></tr>
    <tr><td>Risk level</td><td>${ra.riskLevel}</td><td>${rb.riskLevel}</td></tr>
    <tr><td>Contributors</td><td>${ra.contrib.join("; ")}</td><td>${rb.contrib.join("; ")}</td></tr></table>
    <p class="muted">Terminology uses "extreme rainfall conditions" — the demo classifier never asserts flood/disaster occurrence.</p>

  <h2>7. Location comparison</h2>
  <table><tr><th>Metric</th><th>A</th><th>B</th><th>Δ</th></tr>
  ${rows.map((r) => `<tr><td>${r.label}</td><td>${r.fmt(r.va)}</td><td>${r.fmt(r.vb)}</td><td>${(Math.abs(r.diff) < 0.05 ? "≈" : r.diff > 0 ? "+" + r.diff.toFixed(1) : r.diff.toFixed(1))}</td></tr>`).join("")}
  </table>
  <div class="banner">${$("autosummary").innerText.slice(0, 320)}&#8230;</div>

  <h2>8. Optimization results</h2>
  <table><tr><th>Indicator</th><th>Value</th></tr>
    <tr><td>Current cost</td><td>${$("op-current").textContent}</td></tr>
    <tr><td>Optimized cost</td><td>${$("op-optimized").textContent}</td></tr>
    <tr><td>Cost savings</td><td>${$("op-savings").textContent}</td></tr>
    <tr><td>Risk reduction</td><td>${$("op-riskred").textContent}</td></tr></table>
  <p class="muted">Frontend demo heuristic — replace with existing optimisation code via <code>/optimization</code>.</p>

  <h2>9. Model metrics &amp; assumptions</h2>
  <p>Rainfall model: <b>${$("mi-model").textContent}</b>. Training ${$("mi-train").textContent}; testing ${$("tr-test").textContent}. Metrics populated from backend when connected.</p>
  <ul class="muted">
    <li>All displayed values are synthetic demonstration data; never interpret as observations.</li>
    <li>Drought classification based on SPI thresholds and NDVI deficit.</li>
    <li>Extreme events are threshold-based, not model-inferred flooding.</li>
    <li>Correlation shown is not causal.</li>
  </ul>

  <h2>10. Chart thumbnails (demo)</h2>
  <div class="figures">${chartsHTML || "<p class='muted'>No charts captured.</p>"}</div>

  <h2>11. Limitations</h2>
  <ul class="muted">
    <li>No real backend connected — outputs are placeholders for your algorithms.</li>
    <li>Daily data aggregated by month; seasonal effects captured via climatology.</li>
    <li>Resolution limited to point stations; no gridded reanalysis yet.</li>
  </ul>
  <p class="muted" style="margin-top:24px">Generated by CRIDS v${CRIDS.VERSION} · B.Tech AIML academic project</p>
  </body></html>`;

  const out = $("report-output");
  out.innerHTML = html;
  out.classList.remove("hidden");
  if (print) {
    const w = window.open("", "_blank", "width=1000,height=800");
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
  }
}

/* ---------------------------------------------------------------- Means modal */
const MEANINGS = {
  overview: ["What does this mean?", "The overview condenses every computed indicator into one view. Each card shows the <b>recent value</b>, the <b>historical average</b>, a <b>percentage change</b> with trend arrow, and a plain-language explanation. The Overall Climate Risk gauge blends drought probability, extreme-event risk and rainfall anomaly into a 0–100 score for quick comparison."],
  map: ["What does this mean?", "Leaflet draws both stations on a satellite-style basemap. Switch layers to interpolate any indicator between Location A and Location B — the coloured field is a visual interpolation of the two point values, <em>not</em> gridded satellite data. Popups on markers list the full station summary."],
  rainfall: ["What does this mean?", "Rainfall is modelled as a monthly series. The <b>Historical vs Predicted</b> chart appends the model forecast to the last 36 months with a shaded uncertainty band. Anomaly charts show deviation from the reference climatology (positive may indicate wetter-than-normal conditions)."],
  drought: ["What does this mean?", "NDVI (Normalized Difference Vegetation Index) is a satellite vegetation index: high values indicate dense green vegetation, low values indicate stress or bare ground. SPI (Standardized Precipitation Index) summarises precipitation deficit in standard-deviation units — values below <code>-1.0</code> indicate moderate drought."],
  extreme: ["What does this mean?", "The classifier assigns each station the most probable class (Normal / Extreme Heat / Extreme Rainfall / Drought / Flood-prone rainfall) from climate thresholds in the data. Note the interface deliberately says <em>extreme rainfall conditions</em>, not floods — classification depends on the model's defined thresholds/features."],
  compare: ["What does this mean?", "The comparison dashboard normalises each metric between the two locations and visualises the relative difference. The radar chart makes the overall risk profile instantly readable. The textual summary is generated <em>only</em> from the calculated values on this page."],
  correlation: ["What does this mean?", "The correlation matrix shows Pearson correlations between climate variables (values from −1 to +1). A high correlation means the variables move together in this sample — it does <em>not</em> prove one causes the other."],
  optimization: ["What does this mean?", "This is a frontend stub that demonstrates the resource-allocation concept. It currently runs a transparent risk-weighted heuristic. Your existing optimisation / optimal-cost algorithm can replace it by posting to <code>/optimization</code> — see the API contract in the footer."]
};

$$(".js-means").forEach((btn) =>
  btn.addEventListener("click", () => openMeans(btn.dataset.mean)));

function openMeans(key) {
  const [title, body] = MEANINGS[key] || MEANINGS.overview;
  $("modal-title").textContent = title;
  $("modal-body").innerHTML = `<p>${body}</p>`;
  $("meaning-modal").classList.remove("hidden");
}
$("modal-close").addEventListener("click", () => $("meaning-modal").classList.add("hidden"));
$("meaning-modal").addEventListener("click", (e) => { if (e.target === $("meaning-modal")) $("meaning-modal").classList.add("hidden"); });

/* ---------------------------------------------------------------- Layer switching */
function setActiveLayer(layer) {
  $$(".layerbtn").forEach((b) => b.classList.toggle("active", b.dataset.layer === layer));
  if (CRIDS.state.results) drawLayer(layer);
}
$$(".layerbtn").forEach((b) =>
  b.addEventListener("click", () => setActiveLayer(b.dataset.layer)));

/* ---------------------------------------------------------------- TS filter */
$("btn-apply-filter").addEventListener("click", () => {
  if (CRIDS.state.results) renderRainfallCharts();
});

/* ---------------------------------------------------------------- Init */
(function init() {
  // seed default locations into inputs & meta
  const preset = (inputId, metaId, loc) => {
    $(inputId).value = loc.name;
    $(metaId).innerHTML =
      `<span class="ml">lat <b>${loc.lat.toFixed(4)}</b></span>` +
      `<span class="ml">lon <b>${loc.lon.toFixed(4)}</b></span>` +
      `<span class="ml">${loc.country}</span>` +
      `<span class="ml">${loc.state}</span>`;
  };
  preset("locA-input", "locA-meta", CRIDS.state.locA);
  preset("locB-input", "locB-meta", CRIDS.state.locB);

  const st = new Date($("histStart").value).getFullYear();
  const en = new Date($("histEnd").value).getFullYear();
  $("ts-from").value = $("histStart").value;
  $("ts-to").value = $("histEnd").value;

  // auto-run first simulation for instant impressiveness
  setTimeout(() => runSimulation(), 400);
})();