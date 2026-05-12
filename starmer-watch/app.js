const fallbackData = {
  generatedAt: new Date().toISOString(),
  headline:
    "Data is loading. If the live JSON cannot be fetched, run scripts/refresh-data.mjs to regenerate the feed.",
  counts: {
    resignCalls: { value: 0, label: "Calling for exit", note: "Awaiting feed", source: "Pipeline" },
    supporters: { value: 0, label: "Backing Starmer", note: "Awaiting feed", source: "Pipeline" },
    threshold: { value: 81, label: "Contest threshold", note: "Manual rule setting", source: "Rules" },
    ministersOut: { value: 0, label: "Ministerial exits", note: "Awaiting feed", source: "News" },
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
  resignations: [],
  markets: [],
  news: [],
  sources: [],
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

function formatDate(value) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatCompactDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
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
  const status = $("#data-status");
  dot.classList.toggle("ok", ok);
  dot.classList.toggle("warn", !ok);
  status.textContent = message;
}

function renderHero() {
  $("#dateline").textContent = `Updated ${formatDate(state.generatedAt)}`;
  $("#headline").textContent = state.headline || fallbackData.headline;
}

function renderKpis() {
  const container = $("#kpi-grid");
  const template = $("#kpi-template");
  container.replaceChildren();

  const cards = [
    state.counts.resignCalls,
    state.counts.supporters,
    state.counts.threshold,
    state.counts.ministersOut,
  ].filter(Boolean);

  for (const card of cards) {
    const clone = template.content.cloneNode(true);
    clone.querySelector(".kpi-label").textContent = card.label;
    clone.querySelector(".kpi-source").textContent = card.source || "Feed";
    clone.querySelector(".kpi-value").textContent = formatNumber.format(card.value || 0);
    clone.querySelector(".kpi-note").textContent = card.note || "";
    container.appendChild(clone);
  }
}

function renderPressure() {
  const counts = state.counts;
  const max = Math.max(
    counts.resignCalls?.value || 0,
    counts.supporters?.value || 0,
    counts.threshold?.value || 0,
    1,
  );
  const scale = Math.ceil(max * 1.14);
  const rows = [
    {
      label: "Calling for resignation or timetable",
      value: counts.resignCalls?.value || 0,
      className: "",
    },
    {
      label: "Public/support statement backing Starmer",
      value: counts.supporters?.value || 0,
      className: "support",
    },
    {
      label: "Estimated leadership contest threshold",
      value: counts.threshold?.value || 0,
      className: "threshold",
    },
  ];

  const meter = $("#pressure-meter");
  meter.replaceChildren();

  for (const row of rows) {
    const wrapper = create("div", "meter-block");
    const label = create("div", "meter-label");
    label.append(create("span", "", row.label), create("strong", "", formatNumber.format(row.value)));
    const track = create("div", "meter-track");
    const fill = create("div", `meter-fill ${row.className}`.trim());
    fill.style.setProperty("--width", `${Math.min(100, (row.value / scale) * 100)}%`);
    track.append(fill);
    if (row.label.startsWith("Calling")) {
      const pin = create("span", "threshold-pin");
      pin.style.setProperty(
        "--left",
        `${Math.min(100, ((counts.threshold?.value || 0) / scale) * 100)}%`,
      );
      track.append(pin);
    }
    wrapper.append(label, track);
    meter.append(wrapper);
  }

  $("#pressure-asof").textContent = state.pressure?.asOf || "Live feed";
  $("#threshold-note").textContent = state.pressure?.note || "";

  renderCompactList(
    $("#resign-mps"),
    state.resignationCalls?.slice(0, 10).map((item) => `${item.name} - ${item.constituency || "MP"}`),
    "No public resignation-call list found yet.",
  );

  renderCompactList(
    $("#supporters"),
    state.supportBloc?.slice(0, 8).map((item) => `${item.name} - ${item.note || "public support"}`),
    "Support names are not yet published in the parsed source; count is tracked from the statement.",
  );
}

function renderCompactList(container, items, emptyText) {
  container.replaceChildren();
  if (!items?.length) {
    container.append(create("li", "", emptyText));
    return;
  }
  for (const item of items) {
    container.append(create("li", "", item));
  }
}

function renderMarkets() {
  const container = $("#market-list");
  const markets = state.markets || [];
  container.replaceChildren();
  $("#market-count").textContent = `${markets.length} markets`;

  if (!markets.length) {
    container.append(
      create(
        "div",
        "empty-state",
        "No active relevant Polymarket market was returned by public search. The pipeline keeps checking Starmer, Labour leader, UK PM, and cabinet resignation queries.",
      ),
    );
    return;
  }

  for (const market of markets.slice(0, 8)) {
    const card = create("article", "market-card");
    const title = create("div", "market-title");
    const link = create("a", "", market.question);
    link.href = market.url;
    link.target = "_blank";
    link.rel = "noreferrer";
    const price = create("span", "market-price", priceLabel(market.yesPrice));
    title.append(link, price);

    const meta = create("div", "market-meta");
    meta.append(
      create("span", "", market.eventTitle || "Polymarket"),
      create("span", "", `Vol ${formatMoney(market.volume)}`),
      create("span", "", `Updated ${formatCompactDate(market.updatedAt)}`),
    );
    card.append(title, meta);
    container.append(card);
  }
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

  for (const faction of factions) {
    const card = create("article", "faction-card");
    card.dataset.faction = faction.id;

    const heading = create("div");
    heading.append(create("h3", "", faction.name), create("p", "faction-role", faction.role || ""));

    const score = create("div", "score-row");
    score.append(
      create("div", "score-box", String(faction.pressureScore ?? 0)),
      create("p", "", faction.posture || "No posture summary available."),
    );

    const chip = create("span", "signal-chip", faction.latestMove || "Watching");
    const list = create("ul", "signal-list");
    for (const signal of (faction.signals || []).slice(0, 5)) {
      list.append(create("li", "", signal));
    }

    card.append(heading, score, chip, list);
    container.append(card);
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

  for (const item of items.slice(0, 10)) {
    const card = create("article", "resignation-item");
    card.append(create("h3", "", item.name), create("p", "", item.move || item.role || ""));
    const row = create("div", "tag-row");
    for (const tag of [item.role, item.alignment, item.source].filter(Boolean).slice(0, 4)) {
      row.append(create("span", "tag", tag));
    }
    card.append(row);
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

  for (const item of items.slice(0, 14)) {
    const card = create("article", "news-item");
    const title = create("h3");
    const link = create("a", "", item.title);
    link.href = item.url;
    link.target = "_blank";
    link.rel = "noreferrer";
    title.append(link);
    card.append(title, create("p", "", `${item.source} - ${formatCompactDate(item.publishedAt)}`));
    const tagRow = create("div", "tag-row");
    for (const tag of (item.tags || []).slice(0, 5)) {
      tagRow.append(create("span", "tag", tag));
    }
    card.append(tagRow);
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
    const row = create("div", "source-row");
    row.append(
      create("h3", "", source.name),
      create("span", `source-status ${source.ok ? "ok" : ""}`, source.ok ? "ok" : "check"),
    );
    card.append(
      row,
      create("p", "", source.note || source.url || ""),
      create("p", "", `Fetched ${formatCompactDate(source.fetchedAt)}`),
    );
    container.append(card);
  }
}

function renderAll() {
  renderHero();
  renderKpis();
  renderPressure();
  renderMarkets();
  renderFactions();
  renderResignations();
  renderNews();
  renderPipeline();
}

async function loadData() {
  try {
    const response = await fetch("./data/latest.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state = await response.json();
    renderStatus(true, "Live JSON loaded");
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
