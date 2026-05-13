const fallbackData = {
  generatedAt: new Date().toISOString(),
  headline:
    "Data is loading. If the live JSON cannot be fetched, run scripts/refresh-data.mjs to regenerate the feed.",
  counts: {
    resignCalls: { value: 0, label: "MPs calling for exit", note: "Awaiting feed", source: "Pipeline" },
    supporters: { value: 0, label: "MPs backing Starmer", note: "Awaiting feed", source: "Pipeline" },
    threshold: { value: 81, label: "Contest threshold", note: "Manual rule setting", source: "Rules" },
    ministersOut: { value: 0, label: "Ministers out", note: "Awaiting feed", source: "News" },
  },
  pressure: {
    asOf: "Awaiting feed",
    thresholdDelta: 0,
    supportDelta: 0,
    note: "The dashboard is ready, but data/latest.json has not loaded yet.",
  },
  resignationCalls: [],
  supportBloc: [],
  factions: [],
  proxyGroups: [],
  resignations: [],
  markets: [],
  news: [],
  sources: [],
  history: [],
  pressureIndex: { value: 0, band: "contained", formula: "", components: [] },
};

let state = fallbackData;
let activeFactionFilter = "all";
let newsFilter = "";

const formatNumber = new Intl.NumberFormat("en-GB");
const percentFormat = new Intl.NumberFormat("en-GB", {
  style: "percent",
  maximumFractionDigits: 1,
});

function $(selector) {
  return document.querySelector(selector);
}

function create(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function createSvg(tag, attrs = {}) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { time: "--:--", date: "Unknown" };
  return {
    time: date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
    date: date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
  };
}

function formatCompactDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMoney(value) {
  const num = Number(value || 0);
  if (!Number.isFinite(num) || num <= 0) return "n/a";
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}m`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(0)}k`;
  return `$${num.toFixed(0)}`;
}

function priceLabel(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "n/a";
  return percentFormat.format(num);
}

function renderStatus(ok, message) {
  const dot = $("#status-dot");
  dot.classList.toggle("ok", ok);
  dot.classList.toggle("warn", !ok);
  $("#data-status").textContent = message;
}

function renderMasthead() {
  const generated = formatDate(state.generatedAt);
  $("#refreshed-time").textContent = generated.time;
  $("#refreshed-date").textContent = generated.date;
  const sources = state.sources || [];
  const online = sources.filter((source) => source.ok).length;
  $("#source-count").textContent = `${online} / ${sources.length} online`;
}

function renderKpis() {
  const container = $("#kpi-grid");
  const template = $("#kpi-template");
  const index = state.pressureIndex || { value: 0, band: "contained" };
  const marketProb = index.marketProb;
  const kpis = [
    {
      value: index.value,
      label: `Pressure Index (${index.band})`,
      note: "Composite 0-100. Hover the breakdown under the gauge for inputs.",
      tone: index.value >= 75 ? "red" : index.value >= 55 ? "red" : index.value >= 35 ? "dark" : "blue",
      icon: "◈",
    },
    { ...state.counts.resignCalls, label: "MPs calling for exit", tone: "red", icon: "♟" },
    { ...state.counts.supporters, label: "MPs backing Starmer", tone: "blue", icon: "⬟" },
    {
      value: Number.isFinite(marketProb) ? `${Math.round(marketProb * 100)}%` : "n/a",
      label: "Polymarket exit prob.",
      note: "Top Starmer-exit market YES price.",
      tone: "dark",
      icon: "⌁",
    },
    { ...state.counts.ministersOut, label: "Ministers out", tone: "red", icon: "↪" },
  ];

  container.replaceChildren();
  for (const item of kpis) {
    const clone = template.content.cloneNode(true);
    const card = clone.querySelector(".kpi-card");
    card.classList.add(item.tone);
    clone.querySelector(".kpi-icon").textContent = item.icon;
    clone.querySelector(".kpi-value").textContent =
      typeof item.value === "number" ? formatNumber.format(item.value) : String(item.value ?? "—");
    clone.querySelector(".kpi-label").textContent = item.label;
    clone.querySelector(".kpi-note").textContent = item.note || "";
    container.append(clone);
  }
}

function renderPressure() {
  const counts = state.counts;
  const pressure = counts.resignCalls?.value || 0;
  const support = counts.supporters?.value || 0;
  const threshold = counts.threshold?.value || 81;
  const index = state.pressureIndex || { value: 0, band: "contained", components: [], formula: "" };

  $("#pressure-title").textContent = `Pressure Index ${index.value}/100 · ${index.band.toUpperCase()}`;
  const gauge = $("#pressure-gauge");
  gauge.replaceChildren();
  gauge.append(
    buildIndexGauge(index),
    buildPressureSummary({ pressure, support, threshold }),
    buildIndexBreakdown(index),
  );
  renderTrendChart({ pressure, support, threshold });

  const infoDot = document.querySelector(".pressure-index .info-dot");
  const breakdown = gauge.querySelector(".index-breakdown");
  if (infoDot && breakdown) {
    breakdown.hidden = true;
    infoDot.style.cursor = "pointer";
    infoDot.setAttribute("role", "button");
    infoDot.setAttribute("aria-label", "Show index methodology");
    infoDot.onclick = () => {
      breakdown.hidden = !breakdown.hidden;
      infoDot.classList.toggle("active", !breakdown.hidden);
    };
  }
}

function buildIndexGauge(index) {
  const frame = create("div", "gauge-frame");
  const svg = createSvg("svg", {
    class: "gauge-svg",
    viewBox: "0 0 360 240",
    role: "img",
    "aria-label": `Pressure Index ${index.value} out of 100`,
  });
  const cx = 180;
  const cy = 178;
  const radius = 130;
  const value = Math.max(0, Math.min(100, Number(index.value) || 0));
  const valueAngle = 180 - (value / 100) * 180;

  svg.append(
    arcPath(cx, cy, radius, 180, 117, "gauge-arc green"),
    arcPath(cx, cy, radius, 117, 81, "gauge-arc amber"),
    arcPath(cx, cy, radius, 81, 45, "gauge-arc red"),
    arcPath(cx, cy, radius, 45, 0, "gauge-arc red"),
    arcPath(cx, cy, radius - 38, 180, 0, "gauge-arc inner"),
  );

  [["0", 180], ["35", 117], ["55", 81], ["75", 45], ["100", 0]].forEach(([label, deg]) => {
    const point = polarPoint(cx, cy, radius + 24, Number(deg));
    const text = createSvg("text", {
      x: point.x,
      y: point.y + 5,
      class: "gauge-tick",
      "text-anchor": Number(deg) === 180 ? "start" : Number(deg) === 0 ? "end" : "middle",
    });
    text.textContent = label;
    svg.append(text);
  });

  const needleEnd = polarPoint(cx, cy, 104, valueAngle);
  svg.append(
    createSvg("line", { x1: cx, y1: cy, x2: needleEnd.x, y2: needleEnd.y, class: "gauge-needle-line" }),
    createSvg("circle", { cx, cy, r: 9, class: "gauge-hub-dot" }),
  );

  const valueText = createSvg("text", { x: cx, y: 149, class: "gauge-value", "text-anchor": "middle" });
  valueText.textContent = String(value);
  const label = createSvg("text", { x: cx, y: 173, class: "gauge-caption", "text-anchor": "middle" });
  label.textContent = "PRESSURE INDEX / 100";
  const pill = createSvg("text", { x: cx, y: 210, class: "gauge-pill", "text-anchor": "middle" });
  pill.textContent = `▲ ${String(index.band || "contained").toUpperCase()}`;
  svg.append(valueText, label, pill);
  frame.append(svg);
  return frame;
}

function buildIndexBreakdown(index) {
  const wrap = create("div", "index-breakdown");
  wrap.append(create("h4", "", "How the index is built"));
  const list = create("div", "index-rows");
  for (const part of index.components || []) {
    const row = create("div", "index-row");
    const norm = part.normalised == null ? "—" : `${Math.round(part.normalised * 100)}%`;
    const contrib = part.normalised == null ? "skipped" : `+${part.contribution} pts`;
    row.append(
      create("span", "ix-label", part.label),
      create("span", "ix-weight", `weight ${part.weight}`),
      create("span", "ix-norm", norm),
      create("span", "ix-contrib", contrib),
      create("small", "ix-raw", part.raw || ""),
    );
    list.append(row);
  }
  wrap.append(list);
  wrap.append(create("p", "index-formula", index.formula || ""));
  return wrap;
}

function buildGauge({ pressure, threshold, maxGauge, angle, pressureState }) {
  const frame = create("div", "gauge-frame");
  const svg = createSvg("svg", {
    class: "gauge-svg",
    viewBox: "0 0 360 240",
    role: "img",
    "aria-label": `${pressure} MPs calling for exit against a threshold of ${threshold}`,
  });
  const cx = 180;
  const cy = 178;
  const radius = 130;
  const valueAngle = 180 - Math.min(1, pressure / maxGauge) * 180;
  const tickAngle = 180 - Math.min(1, threshold / maxGauge) * 180;

  svg.append(
    arcPath(cx, cy, radius, 180, 143, "gauge-arc green"),
    arcPath(cx, cy, radius, 143, tickAngle, "gauge-arc amber"),
    arcPath(cx, cy, radius, tickAngle, 0, "gauge-arc red"),
    arcPath(cx, cy, radius - 38, 180, 0, "gauge-arc inner"),
  );

  [
    ["0", 180],
    ["40", 145],
    [String(threshold), tickAngle],
    ["120", 38],
    [String(maxGauge), 0],
  ].forEach(([label, deg]) => {
    const point = polarPoint(cx, cy, radius + 24, Number(deg));
    const text = createSvg("text", {
      x: point.x,
      y: point.y + 5,
      class: "gauge-tick",
      "text-anchor": Number(deg) === 180 ? "start" : Number(deg) === 0 ? "end" : "middle",
    });
    text.textContent = label;
    svg.append(text);
  });

  const needleEnd = polarPoint(cx, cy, 104, valueAngle);
  svg.append(
    createSvg("line", {
      x1: cx,
      y1: cy,
      x2: needleEnd.x,
      y2: needleEnd.y,
      class: "gauge-needle-line",
    }),
    createSvg("circle", { cx, cy, r: 9, class: "gauge-hub-dot" }),
  );

  const value = createSvg("text", { x: cx, y: 149, class: "gauge-value", "text-anchor": "middle" });
  value.textContent = formatNumber.format(pressure);
  const label = createSvg("text", { x: cx, y: 173, class: "gauge-caption", "text-anchor": "middle" });
  label.textContent = "MPs calling for exit";
  const pill = createSvg("text", { x: cx, y: 210, class: "gauge-pill", "text-anchor": "middle" });
  pill.textContent = `▲ ${pressureState}`;
  svg.append(value, label, pill);
  frame.append(svg);
  return frame;
}

function arcPath(cx, cy, radius, startDeg, endDeg, className) {
  const start = polarPoint(cx, cy, radius, startDeg);
  const end = polarPoint(cx, cy, radius, endDeg);
  return createSvg("path", {
    d: `M ${start.x} ${start.y} A ${radius} ${radius} 0 0 1 ${end.x} ${end.y}`,
    class: className,
  });
}

function polarPoint(cx, cy, radius, deg) {
  const rad = (deg * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(rad),
    y: cy - radius * Math.sin(rad),
  };
}

function buildPressureSummary({ pressure, support, threshold }) {
  const summary = create("div", "pressure-summary");
  const delta = pressure - threshold;
  const supportDelta = support - pressure;
  const thresholdText =
    delta >= 0 ? `${delta} above threshold` : `${Math.abs(delta)} short of threshold`;
  const supportText =
    supportDelta >= 0 ? `${supportDelta} support cushion` : `${Math.abs(supportDelta)} pressure lead`;

  summary.append(
    metricPill("Exit calls", pressure, "red"),
    metricPill("Backing PM", support, "blue"),
    metricPill("Trigger", threshold, "dark"),
    create("p", "", `${thresholdText}. ${supportText}. Public declarations are not a formal challenge.`),
  );
  return summary;
}

function metricPill(label, value, tone) {
  const node = create("div", `metric-pill ${tone}`);
  node.append(create("span", "", label), create("strong", "", formatNumber.format(value)));
  return node;
}

function renderTrendChart({ pressure, support, threshold }) {
  const svg = $("#trend-chart");
  svg.replaceChildren();

  const width = 560;
  const height = 260;
  const pad = { left: 46, right: 40, top: 24, bottom: 38 };
  const history = Array.isArray(state.history) ? state.history.slice() : [];
  if (history.length < 2) {
    const note = createSvg("text", { x: width / 2, y: height / 2, class: "axis-label", "text-anchor": "middle" });
    note.textContent = history.length === 1 ? "Trend builds up after the next refresh." : "Trend builds up after a few refreshes.";
    svg.append(note);
    return;
  }

  const points = history.map((entry, i) => ({
    i,
    t: entry.t,
    pressure: Number(entry.pressure) || 0,
    support: Number(entry.support) || 0,
    threshold,
  }));

  const max = Math.max(
    threshold + 20,
    ...points.map((p) => Math.max(p.pressure, p.support)),
  );
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const x = (i) => pad.left + (i / Math.max(1, points.length - 1)) * plotW;
  const y = (value) => pad.top + (1 - value / max) * plotH;

  const ticks = [0, Math.round(max * 0.25), threshold, Math.round(max * 0.75), Math.round(max)];
  for (const tick of ticks) {
    svg.append(
      createSvg("line", {
        x1: pad.left, x2: width - pad.right, y1: y(tick), y2: y(tick),
        class: tick === threshold ? "grid-line threshold" : "grid-line",
      }),
    );
    const label = createSvg("text", { x: 10, y: y(tick) + 4, class: "axis-label" });
    label.textContent = String(tick);
    svg.append(label);
  }

  svg.append(
    buildPolyline(points.map((p) => p.support), x, y, "support-line"),
    buildPolyline(points.map(() => threshold), x, y, "threshold-line"),
    buildPolyline(points.map((p) => p.pressure), x, y, "pressure-line"),
  );

  const dateLabels = [0, Math.floor(points.length / 2), points.length - 1];
  for (const i of dateLabels) {
    const date = new Date(points[i].t);
    if (Number.isNaN(date.getTime())) continue;
    const text = createSvg("text", { x: x(i), y: height - 10, class: "axis-label x" });
    text.textContent = date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
    svg.append(text);
  }

  const last = points[points.length - 1];
  const supportLabel = createSvg("text", { x: width - 30, y: y(last.support) + 4, class: "chart-end support" });
  supportLabel.textContent = String(last.support);
  const pressureLabel = createSvg("text", { x: width - 30, y: y(last.pressure) + 4, class: "chart-end pressure" });
  pressureLabel.textContent = String(last.pressure);
  svg.append(supportLabel, pressureLabel);
}

function buildPolyline(values, x, y, className) {
  return createSvg("polyline", {
    points: values.map((value, index) => `${x(index)},${y(value)}`).join(" "),
    class: className,
  });
}

function renderMarkets() {
  const markets = state.markets || [];
  const starmerMarkets = markets.filter((market) => /Starmer out|resign/i.test(market.question));
  const featured = starmerMarkets[1] || starmerMarkets[0] || markets[0];
  const featuredNode = $("#featured-market");
  const list = $("#market-list");
  featuredNode.replaceChildren();
  list.replaceChildren();

  if (!featured) {
    featuredNode.append(create("div", "empty-state", "No active relevant Polymarket market returned yet."));
    return;
  }

  const yes = Number(featured.yesPrice || 0);
  const featuredCard = create("article", "featured-market");
  featuredCard.append(create("h3", "", featured.question));
  const oddsRow = create("div", "odds-row");
  oddsRow.append(
    create("strong", "", priceLabel(yes)),
    create("span", "", yes >= 0.5 ? "▲ high" : "▼ watch"),
  );
  featuredCard.append(oddsRow, renderMiniOddsChart(yes), create("p", "", `Volume ${formatMoney(featured.volume)} · Updated ${formatCompactDate(featured.updatedAt)}`));
  featuredNode.append(featuredCard);

  for (const market of markets.filter((item) => item !== featured).slice(0, 4)) {
    const row = create("article", "market-row");
    const link = create("a", "", market.question);
    link.href = market.url;
    link.target = "_blank";
    link.rel = "noreferrer";
    row.append(link, create("strong", "", priceLabel(market.yesPrice)));
    list.append(row);
  }
}

function renderMiniOddsChart(current) {
  const svg = createSvg("svg", { class: "mini-odds-chart", viewBox: "0 0 260 90", "aria-hidden": "true" });
  const points = [0.72, 0.58, 0.48, 0.42, 0.37, Math.max(0.03, current - 0.03), current];
  const x = (index) => 12 + (index / (points.length - 1)) * 232;
  const y = (value) => 8 + (1 - value) * 74;
  [0.25, 0.5, 0.75].forEach((tick) => {
    svg.append(createSvg("line", { x1: 8, x2: 252, y1: y(tick), y2: y(tick), class: "mini-grid" }));
  });
  svg.append(createSvg("polyline", {
    points: points.map((value, index) => `${x(index)},${y(value)}`).join(" "),
    class: "mini-line",
  }));
  return svg;
}

function renderFactions() {
  const container = $("#faction-grid");
  container.replaceChildren();
  const factions = (state.factions || []).filter(
    (faction) => activeFactionFilter === "all" || faction.id === activeFactionFilter,
  );

  if (!factions.length) {
    container.append(create("div", "empty-state", "No faction notes match this filter."));
    return;
  }

  for (const faction of factions.slice(0, activeFactionFilter === "all" ? 2 : 4)) {
    const card = create("article", `faction-card ${faction.id}`);
    const title = create("div", "faction-title");
    title.append(create("h3", "", faction.name), create("span", "", "ACTIVE"));
    card.append(title, create("p", "", faction.posture || "No posture summary available."));

    const score = Number(faction.pressureScore) || 0;
    const matrix = create("div", "matrix");
    matrix.append(
      matrixCell("Signal score", `${score}/9`),
      matrixCell("Live signals", String((faction.signals || []).filter((s) => s && !/No high-confidence/i.test(s)).length)),
    );
    card.append(matrix);

    if ((faction.signals || []).length) {
      const signalList = create("ul", "signal-list");
      for (const signal of faction.signals.slice(0, 3)) {
        signalList.append(create("li", "", signal));
      }
      card.append(signalList);
    }

    const move = create("div", "latest-move");
    move.textContent = faction.latestMove || "Watching";
    card.append(move);
    container.append(card);
  }
}

function matrixCell(label, value) {
  const cell = create("div", "matrix-cell");
  cell.append(create("span", "", label), create("strong", "", value));
  return cell;
}

function renderProxyBoard() {
  const groups = Array.isArray(state.proxyGroups) ? state.proxyGroups : [];
  const grid = $("#proxy-grid");
  grid.replaceChildren();

  const populated = groups.filter((g) => g.total > 0);
  if (!populated.length) {
    grid.append(
      create(
        "div",
        "empty-state",
        "No faction membership configured. Add MP names under factionMembership in data/manual-overrides.json to drive these tiles from real bloc data.",
      ),
    );
    return;
  }

  for (const group of populated) {
    const card = create("article", "proxy-card");
    const leanLabel = group.lean === "tilting against" ? "▼ Tilting against Starmer"
      : group.lean === "holding" ? "▲ Holding for Starmer"
      : "◌ Split";
    card.append(
      create("h4", "", group.name),
      create("p", "", `${group.calling}/${group.total} calling exit · ${group.backing} backing · ${group.undeclared} undeclared`),
      create("span", group.lean === "tilting against" ? "down" : group.lean === "holding" ? "up" : "", leanLabel),
    );
    if (group.note) card.append(create("small", "", group.note));
    grid.append(card);
  }
}

function renderResignations() {
  const container = $("#resignation-list");
  const items = state.resignations || [];
  container.replaceChildren();
  $("#resignation-count").textContent = `${items.length} tracked`;

  if (!items.length) {
    container.append(create("div", "empty-state", "No resignations or proxy exits detected yet."));
    return;
  }

  for (const item of items.slice(0, 5)) {
    const card = create("article", "resignation-item");
    card.append(create("strong", "", item.name), create("span", "", item.role || "Pressure signal"), create("small", "", item.source || ""));
    container.append(card);
  }
}

function renderNews() {
  const container = $("#news-list");
  const needle = newsFilter.trim().toLowerCase();
  const items = (state.news || []).filter((item) => {
    if (!needle) return true;
    return `${item.title} ${item.source} ${(item.tags || []).join(" ")}`.toLowerCase().includes(needle);
  });

  container.replaceChildren();
  if (!items.length) {
    container.append(create("div", "empty-state", "No source hits match the current filter."));
    return;
  }

  for (const item of items.slice(0, 7)) {
    const card = create("article", "news-item");
    const time = create("time", "", formatCompactDate(item.publishedAt));
    const source = create("span", "news-source", item.source.replace(" Politics RSS", "").replace(" RSS", ""));
    const link = create("a", "", item.title);
    link.href = item.url;
    link.target = "_blank";
    link.rel = "noreferrer";
    card.append(time, source, link);
    container.append(card);
  }
}

function renderPipeline() {
  const container = $("#pipeline-grid");
  container.replaceChildren();
  const sources = state.sources || [];
  if (!sources.length) {
    container.append(create("div", "empty-state", "Source health will appear after the refresh script runs."));
    return;
  }

  for (const source of sources) {
    const card = create("article", "source-card");
    card.append(
      create("strong", "", source.name),
      create("span", source.ok ? "source-status ok" : "source-status", source.ok ? "ok" : "check"),
      create("p", "", source.note || source.url || ""),
    );
    container.append(card);
  }
}

function renderAll() {
  renderMasthead();
  renderKpis();
  renderPressure();
  renderMarkets();
  renderFactions();
  renderProxyBoard();
  renderResignations();
  renderNews();
  renderPipeline();
}

async function loadData() {
  try {
    const response = await fetch("./data/latest.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state = await response.json();
    renderStatus(true, "All systems normal");
  } catch (error) {
    console.warn("Using fallback data", error);
    state = fallbackData;
    renderStatus(false, "Using fallback data");
  }

  renderAll();
}

document.querySelectorAll(".segmented-control button").forEach((button) => {
  button.addEventListener("click", () => {
    activeFactionFilter = button.dataset.filter;
    document.querySelectorAll(".segmented-control button").forEach((item) => {
      item.classList.toggle("active", item === button);
    });
    renderFactions();
  });
});

$("#news-filter").addEventListener("input", (event) => {
  newsFilter = event.target.value;
  renderNews();
});

loadData();
