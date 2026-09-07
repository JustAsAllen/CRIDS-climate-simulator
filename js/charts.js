/* ============================================================================
   CRIDS — Chart.js theme + helpers
   ========================================================================== */

"use strict";

var CRIDS = window.CRIDS;
CRIDS.charts = {};

/* Global Chart.js defaults — dark scientific theme. */
Chart.defaults.color = "#93a5bd";
Chart.defaults.borderColor = "rgba(255,255,255,0.08)";
Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
Chart.defaults.font.size = 11;
Chart.defaults.plugins.legend.labels.boxWidth = 12;
Chart.defaults.plugins.legend.labels.usePointStyle = true;
Chart.defaults.plugins.legend.labels.pointStyle = "circle";
Chart.defaults.plugins.tooltip.backgroundColor = "rgba(8,17,32,0.95)";
Chart.defaults.plugins.tooltip.borderColor = "rgba(56,189,248,0.4)";
Chart.defaults.plugins.tooltip.borderWidth = 1;
Chart.defaults.plugins.tooltip.titleFont.family = "'Space Grotesk', sans-serif";
Chart.defaults.plugins.tooltip.padding = 10;
Chart.defaults.plugins.tooltip.cornerRadius = 10;

/* Registry of created charts for cleanup + snapshot export. */
CRIDS.charts.registry = [];

CRIDS.charts.palette = {
  blue: "#38bdf8", green: "#34d399", amber: "#f59e0b", red: "#f43f5e",
  purple: "#a78bfa", cyan: "#22d3ee", neutral: "#64748b", pink: "#fb7185",
  indigo: "#818cf8"
};

CRIDS.charts.seriesGradients = {};
CRIDS.charts.grad = function (ctx, c1, c2, vertical) {
  const g = ctx.createLinearGradient(0, 0, vertical ? 0 : ctx.canvas.width, vertical ? ctx.canvas.height : 0);
  g.addColorStop(0, c1);
  g.addColorStop(1, c2);
  return g;
};

/* For line/fill charts: gradient fill under a line. */
CRIDS.charts.fill = function (ctx, color) {
  const g = ctx.createLinearGradient(0, 0, 0, 220);
  g.addColorStop(0, color + "55");
  g.addColorStop(1, color + "00");
  return g;
};

/* Build a standard month-ish label from Date. */
CRIDS.charts.mLabel = function (t) {
  const d = new Date(t);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
};

CRIDS.charts.ymLabel = function (y, m) { return `${y}-${String(m).padStart(2, "0")}`; };

CRIDS.charts.register = function (chart) {
  CRIDS.charts.registry.push(chart);
  return chart;
};

/* Destroy all cached charts (call before re-render). */
CRIDS.charts.destroyAll = function () {
  CRIDS.charts.registry.forEach(c => { try { c.destroy(); } catch (e) {} });
  CRIDS.charts.registry = [];
};

/* Export a canvas as PNG (download). */
CRIDS.charts.exportCanvas = function (canvas, filename) {
  const link = document.createElement("a");
  link.download = filename || "chart.png";
  link.href = canvas.toDataURL("image/png");
  link.click();
};

CRIDS.charts.ticks = function (numeric, suffix) {
  return {
    callback: v => v.toLocaleString("en-IN") + (suffix || "")
  };
};

/* Default axis grid styling. */
CRIDS.charts.axes = function (opts) {
  const o = opts || {};
  return {
    x: {
      grid: { color: "rgba(255,255,255,0.05)" },
      ticks: { maxRotation: 45, minRotation: 0, maxTicksLimit: o.xticks || 12 },
      title: o.xtitle ? { display: true, text: o.xtitle, color: "#93a5bd" } : undefined
    },
    y: {
      grid: { color: "rgba(255,255,255,0.06)" },
      beginAtZero: o.zero !== false,
      title: o.ytitle ? { display: true, text: o.ytitle, color: "#93a5bd" } : undefined,
      ticks: o.yticks ? { callback: o.yticks } : undefined
    }
  };
};

/* ---------- Reusable chart builders ---------- */

CRIDS.charts.timeSeries = function (canvas, labels, datas, opts) {
  const ctx = canvas.getContext("2d");
  const ds = {
    type: "line",
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: opts.legend !== false },
        tooltip: {
          callbacks: opts.tooltip ? { label: opts.tooltip } : undefined
        },
        subtitle: opts.subtitle ? { display: true, text: opts.subtitle, color: "#64748b", font: { size: 10 } } : undefined
      },
      scales: opts.scales || CRIDS.charts.axes(opts.axis || {})
    },
    data: {
      labels,
      datasets: datas
    }
  };
  return CRIDS.charts.register(new Chart(ctx, ds));
};

CRIDS.charts.addScaleGradient = function (ctx, chart, color) {};

/* Luby-style helper: create dataset collection from series spec. */
CRIDS.charts.buildSeries = function (series, colors) {
  return series.map((s, i) => {
    const c = colors[i % colors.length];
    return {
      label: s.label,
      data: s.data,
      borderColor: s.borderColor || c,
      backgroundColor: s.backgroundColor !== undefined ? s.backgroundColor : CRIDS.charts.fill(ctxOf(s), c),
      fill: s.fill !== undefined ? s.fill : s.fill0 !== undefined ? s.fill0 : false,
      borderWidth: s.width || 2,
      pointRadius: s.points || 0,
      tension: 0.35,
      spanGaps: true,
      borderDash: s.dash,
      yAxisID: s.yAxisID
    };
  });
};

/* ctx of first found context — helper for gradient detection. */
function ctxOf(s) { return s.__ctx; }

CRIDS.charts.bar = function (canvas, labels, datasets, opts) {
  const ctx = canvas.getContext("2d");
  return CRIDS.charts.register(new Chart(ctx, {
    type: "bar",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: opts.legend !== false },
        tooltip: opts.tooltip
      },
      scales: opts.scales || CRIDS.charts.axes(opts.axis || {})
    }
  }));
};

CRIDS.charts.scatter = function (canvas, datasets, opts) {
  const ctx = canvas.getContext("2d");
  return CRIDS.charts.register(new Chart(ctx, {
    type: "scatter",
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: opts.legend !== false } },
      scales: opts.scales || CRIDS.charts.axes(opts.axis || {})
    }
  }));
};

/* Radar chart for comparisons. */
CRIDS.charts.radar = function (canvas, labels, datasets, opts) {
  const ctx = canvas.getContext("2d");
  return CRIDS.charts.register(new Chart(ctx, {
    type: "radar",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: opts.legend !== false } },
      scales: {
        r: {
          beginAtZero: true,
          min: 0, max: 1,
          ticks: { display: false, stepSize: 0.25 },
          grid: { color: "rgba(255,255,255,0.1)" },
          angleLines: { color: "rgba(255,255,255,0.1)" },
          pointLabels: { color: "#93a5bd", font: { size: 10 } }
        }
      }
    }
  }));
};

/* Doughnut chart. */
CRIDS.charts.doughnut = function (canvas, labels, data, colors, opts) {
  const ctx = canvas.getContext("2d");
  return CRIDS.charts.register(new Chart(ctx, {
    type: "doughnut",
    data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 1, borderColor: "rgba(8,17,32,0.6)" }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "62%",
      plugins: {
        legend: { position: opts.legendPos || "bottom" }
      }
    }
  }));
};

/* Horizontal stacked bars for extreme frequency. */
CRIDS.charts.hbar = function (canvas, labels, datasets, opts) {
  const ctx = canvas.getContext("2d");
  return CRIDS.charts.register(new Chart(ctx, {
    type: "bar",
    data: { labels, datasets },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: opts.legend !== false } },
      scales: {
        x: { stacked: true, grid: { color: "rgba(255,255,255,0.05)" } },
        y: { stacked: true, grid: { display: false } }
      }
    }
  }));
};