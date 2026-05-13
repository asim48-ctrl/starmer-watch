#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const rootDir = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const dataDir = path.join(rootDir, "data");
const latestPath = path.join(dataDir, "latest.json");
const manualPath = path.join(dataDir, "manual-overrides.json");
const historyPath = path.join(dataDir, "history.json");
const HISTORY_LIMIT = 240;

const LABOURLIST_URL =
  "https://labourlist.org/2026/05/labourlist-labour-mp-starmer-resignation-tracker/";

const RSS_FEEDS = [
  { id: "sky-politics", name: "Sky News Politics", url: "https://feeds.skynews.com/feeds/rss/politics.xml" },
  { id: "guardian-politics", name: "Guardian Politics", url: "https://news.google.com/rss/search?q=site:theguardian.com+(Starmer+OR+Labour+leadership)&hl=en-GB&gl=GB&ceid=GB:en" },
  { id: "bbc-politics", name: "BBC Politics", url: "https://feeds.bbci.co.uk/news/politics/rss.xml" },
  { id: "labourlist-feed", name: "LabourList", url: "https://labourlist.org/feed/" },
  { id: "ft-uk-politics", name: "FT UK Politics", url: "https://www.ft.com/uk-politics?format=rss" },
  { id: "telegraph-politics", name: "Telegraph Politics", url: "https://news.google.com/rss/search?q=site:telegraph.co.uk+(Starmer+OR+Labour+leadership)&hl=en-GB&gl=GB&ceid=GB:en" },
  { id: "times-redbox", name: "The Times Politics", url: "https://news.google.com/rss/search?q=site:thetimes.com+(Starmer+OR+Labour+leadership)&hl=en-GB&gl=GB&ceid=GB:en" },
  { id: "politico-uk", name: "Politico UK", url: "https://www.politico.eu/section/uk/feed/" },
  { id: "new-statesman-politics", name: "New Statesman Politics", url: "https://www.newstatesman.com/politics/feed" },
  { id: "spectator", name: "Spectator", url: "https://news.google.com/rss/search?q=site:spectator.co.uk+(Starmer+OR+Labour)&hl=en-GB&gl=GB&ceid=GB:en" },
  { id: "conservativehome", name: "ConservativeHome", url: "https://conservativehome.com/feed/" },
  { id: "tortoise", name: "Tortoise", url: "https://news.google.com/rss/search?q=site:tortoisemedia.com+(Starmer+OR+Labour)&hl=en-GB&gl=GB&ceid=GB:en" },
  { id: "reuters-uk", name: "Reuters UK", url: "https://news.google.com/rss/search?q=site:reuters.com+UK+(Starmer+OR+Labour+leadership)&hl=en-GB&gl=GB&ceid=GB:en" },
  { id: "bloomberg-uk", name: "Bloomberg UK", url: "https://news.google.com/rss/search?q=site:bloomberg.com+UK+(Starmer+OR+Labour)&hl=en-GB&gl=GB&ceid=GB:en" },
  { id: "mirror-politics", name: "Mirror Politics", url: "https://news.google.com/rss/search?q=site:mirror.co.uk+(Starmer+OR+Labour+leadership)&hl=en-GB&gl=GB&ceid=GB:en" },
  { id: "inews-politics", name: "i Politics", url: "https://inews.co.uk/category/news/politics/feed" },
  { id: "itv-politics", name: "ITV Politics", url: "https://news.google.com/rss/search?q=site:itv.com+politics+(Starmer+OR+Labour)&hl=en-GB&gl=GB&ceid=GB:en" },
  { id: "independent-uk-politics", name: "Independent UK Politics", url: "https://www.independent.co.uk/news/uk/politics/rss" },
  { id: "sam-freedman", name: "Sam Freedman — Comment is Freed", url: "https://samf.substack.com/feed" },
  { id: "ian-dunt", name: "Ian Dunt — Striking 13", url: "https://www.striking13.co.uk/feed" },
  { id: "politicshome", name: "PoliticsHome", url: "https://www.politicshome.com/feed" },
  { id: "byline-times", name: "Byline Times", url: "https://bylinetimes.com/feed/" },
  { id: "novara-media", name: "Novara Media", url: "https://novaramedia.com/feed/" },
];

const POLYMARKET_QUERIES = [
  "Starmer 2026",
  "Keir Starmer",
  "Starmer resign",
  "Starmer out",
  "Labour leader",
  "Next Labour leader",
  "UK Prime Minister 2026",
  "UK Cabinet Minister resigns",
  "Wes Streeting",
  "Angela Rayner",
  "Andy Burnham",
  "UK general election 2026",
];

const NEWS_KEYWORDS = [
  "starmer",
  "streeting",
  "burnham",
  "rayner",
  "labour leadership",
  "resign",
  "resignation",
  "leadership election",
  "minister",
  "cabinet",
];

const MARKET_KEYWORDS = [
  "starmer",
  "labour leadership",
  "labour leader",
  "prime minister",
  "uk cabinet",
  "cabinet minister",
  "wes streeting",
  "andy burnham",
  "angela rayner",
];

const DEFAULT_MANUAL = {
  contestThreshold: 81,
  plpSize: 403,
  supportBloc: [],
  sourceNotes: [],
  factionOverrides: {},
  factionMembership: {},
  headlineOverride: "",
};

const INDEX_WEIGHTS = {
  exitShare: 35,
  supportDeficit: 15,
  ministerMomentum: 10,
  marketExitProb: 25,
  newsSentiment: 15,
};

const NEGATIVE_LEXICON = [
  "resign", "quit", "ousted", "crisis", "blow", "humiliat", "mutiny", "rebellion",
  "challenge", "no confidence", "step down", "ditch", "topple", "trigger", "calls grow",
  "under pressure", "in turmoil", "embattled", "showdown", "ultimatum", "defies",
  "splinter", "revolt", "leadership bid", "collapse",
];
const POSITIVE_LEXICON = [
  "backs starmer", "support starmer", "defends", "rallies behind", "loyal",
  "endorses", "stands by", "unites behind", "show of support", "secures",
];

async function main() {
  const manual = await readManualOverrides();
  const generatedAt = new Date().toISOString();
  const sourceHealth = [];

  const labour = await collectLabourList(sourceHealth);
  const rssNews = await collectRssNews(sourceHealth);
  const bskyNews = await collectBluesky(sourceHealth, manual);
  const gdeltNews =
    process.env.ENABLE_GDELT === "1" ? await collectGdeltNews(sourceHealth) : noteGdeltDisabled(sourceHealth);
  const markets = await collectPolymarket(sourceHealth);

  const news = mergeNews([...rssNews, ...gdeltNews, ...bskyNews]);
  const counts = buildCounts(labour, manual);
  const pressure = buildPressure(counts, labour);
  const resignations = buildResignations(labour, news);
  const factions = buildFactions({ counts, labour, news, markets, resignations, manual });
  const proxyGroups = buildProxyGroups(manual, labour);
  const pressureIndex = buildPressureIndex({ counts, markets, manual, news });
  const history = await updateHistory({ generatedAt, counts, pressureIndex });
  const headline = manual.headlineOverride || buildHeadline(counts, markets, pressureIndex);

  const output = {
    generatedAt,
    headline,
    counts,
    pressure,
    pressureIndex,
    history,
    resignationCalls: labour.resignationCalls,
    supportBloc: manual.supportBloc || [],
    factions,
    proxyGroups,
    resignations,
    markets,
    news: news.map(({ description, ...item }) => item),
    sources: sourceHealth.concat(manual.sourceNotes || []),
  };

  await writeFile(latestPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(`Wrote ${path.relative(process.cwd(), latestPath)}`);
  console.log(
    `Counts: ${counts.resignCalls.value} calling exit, ${counts.supporters.value} supporting, ${markets.length} markets, ${news.length} news hits.`,
  );
}

async function readManualOverrides() {
  try {
    const raw = await readFile(manualPath, "utf8");
    return { ...DEFAULT_MANUAL, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_MANUAL;
  }
}

async function collectLabourList(sourceHealth) {
  const source = {
    id: "labourlist-tracker",
    name: "LabourList tracker",
    url: LABOURLIST_URL,
    fetchedAt: new Date().toISOString(),
    ok: false,
    note: "Tracker scrape pending",
  };

  try {
    const html = await fetchText(LABOURLIST_URL);
    const text = htmlToText(html);
    const lines = text
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);

    const resignMatch = text.match(/As of\s+([^,]+),\s+(\d+)\s+Labour MPs are now calling/i);
    const supportMatch = text.match(
      /with\s+(\d+)\s+Labour MPs signing a statement of support backing the PM/i,
    );

    const resignationCalls = extractMpList(lines);
    const exits = extractResignationMoves(lines);

    source.ok = Boolean(resignMatch || supportMatch || resignationCalls.length);
    source.note = source.ok
      ? `Parsed headline counts and ${resignationCalls.length} named public-call rows.`
      : "Fetched page but no known count pattern matched.";
    sourceHealth.push(source);

    return {
      rawText: text,
      asOf: resignMatch?.[1]?.trim() || "LabourList latest",
      resignCalls: numberOrNull(resignMatch?.[2]),
      supporters: numberOrNull(supportMatch?.[1]),
      resignationCalls,
      exits,
    };
  } catch (error) {
    source.note = `Fetch failed: ${error.message}`;
    sourceHealth.push(source);
    return {
      rawText: "",
      asOf: "LabourList unavailable",
      resignCalls: null,
      supporters: null,
      resignationCalls: [],
      exits: [],
    };
  }
}

function extractMpList(lines) {
  const start = lines.findIndex((line) =>
    /Full list of Labour MPs calling for Starmer/i.test(line),
  );
  if (start === -1) return [];

  const end = lines.findIndex(
    (line, index) => index > start && /Become a friend|SHARE:|SUBSCRIBE:/i.test(line),
  );
  const slice = lines.slice(start + 1, end === -1 ? undefined : end);
  const names = [];
  const seen = new Set();
  const nameLine = /^([A-Z][A-Za-z.' -]+?) \(([^)]+)\)$/;

  for (const line of slice) {
    const match = line.match(nameLine);
    if (!match) continue;
    const [, name, constituency] = match;
    if (seen.has(name)) continue;
    seen.add(name);
    names.push({ name, constituency });
  }

  return names;
}

function extractResignationMoves(lines) {
  const moves = [];

  for (const line of lines) {
    const ministerMatch = line.match(
      /^([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+)+)\s+(?:has\s+)?resigned as\s+(?:a |an )?([^.,]+?minister)\b/,
    );
    if (ministerMatch) {
      const name = cleanText(ministerMatch[1]);
      const role = cleanText(ministerMatch[2]);
      moves.push({
        name,
        role,
        move: `${name} resigned as ${role}.`,
        alignment: classifyExit(role),
        source: "LabourList",
      });
    }

    const ppsMatch = line.match(
      /^([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+)+).*?\bresigning as\s+(?:a |an )?(PPS)\b/,
    );
    if (ppsMatch) {
      const name = cleanText(ppsMatch[1]);
      const role = cleanText(ppsMatch[2]);
      moves.push({
        name,
        role,
        move: `${name} resigned as ${role}.`,
        alignment: classifyExit(role),
        source: "LabourList",
      });
    }
  }

  return dedupeBy(moves, (item) => `${item.name}:${item.role}`);
}

async function collectRssNews(sourceHealth) {
  const all = [];

  for (const feed of RSS_FEEDS) {
    const source = {
      id: feed.id,
      name: feed.name,
      url: feed.url,
      fetchedAt: new Date().toISOString(),
      ok: false,
      note: "RSS fetch pending",
    };

    try {
      const xml = await fetchText(feed.url);
      const items = parseRssItems(xml, feed.name)
        .filter((item) => isRelevantNews(`${item.title} ${item.description}`))
        .map((item) => ({ ...item, tags: tagText(`${item.title} ${item.description}`) }));
      all.push(...items);
      source.ok = true;
      source.note = `Parsed ${items.length} relevant items.`;
    } catch (error) {
      source.note = `RSS failed: ${error.message}`;
    }

    sourceHealth.push(source);
  }

  return all;
}

async function collectGdeltNews(sourceHealth) {
  const source = {
    id: "gdelt-doc-api",
    name: "GDELT document API",
    url: "https://api.gdeltproject.org/api/v2/doc/doc",
    fetchedAt: new Date().toISOString(),
    ok: false,
    note: "Optional discovery source",
  };

  const query = encodeURIComponent("Starmer (Streeting OR Burnham OR Rayner OR resign OR leadership)");
  const url = `${source.url}?query=${query}&mode=ArtList&format=json&maxrecords=20&sort=HybridRel&timespan=48h`;

  try {
    const response = await fetch(url, {
      headers: { "user-agent": "Starmer Watch data refresh (contact: dashboard owner)" },
    });
    source.fetchedAt = new Date().toISOString();
    if (!response.ok) {
      source.note = `Discovery skipped: HTTP ${response.status}.`;
      sourceHealth.push(source);
      return [];
    }
    const data = await response.json();
    const articles = Array.isArray(data.articles) ? data.articles : [];
    const items = articles
      .map((article) => ({
        title: cleanText(article.title),
        url: article.url,
        source: cleanText(article.sourceCountry ? `${article.domain} (${article.sourceCountry})` : article.domain),
        publishedAt: parseGdeltDate(article.seendate),
        description: "",
        tags: tagText(article.title || ""),
      }))
      .filter((item) => item.title && item.url && isRelevantNews(item.title));

    source.ok = true;
    source.note = `Discovered ${items.length} relevant links.`;
    sourceHealth.push(source);
    return items;
  } catch (error) {
    source.note = `Discovery failed: ${error.message}`;
    sourceHealth.push(source);
    return [];
  }
}

async function collectBluesky(sourceHealth, manual) {
  const handles = Array.isArray(manual.bskyHandles) ? manual.bskyHandles : [];
  const source = {
    id: "bluesky-lobby",
    name: "Bluesky lobby journalists",
    url: "https://public.api.bsky.app",
    fetchedAt: new Date().toISOString(),
    ok: false,
    note: handles.length ? `Querying ${handles.length} handles` : "No bskyHandles configured",
  };
  if (!handles.length) {
    sourceHealth.push(source);
    return [];
  }

  const all = [];
  let okHandles = 0;
  for (const handle of handles) {
    try {
      const url = `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(handle)}&limit=20&filter=posts_no_replies`;
      const json = await fetchJson(url);
      const feed = Array.isArray(json.feed) ? json.feed : [];
      okHandles += 1;
      for (const entry of feed) {
        const post = entry?.post;
        const record = post?.record;
        const text = String(record?.text || "").trim();
        if (!text) continue;
        if (!isRelevantNews(text)) continue;
        const rkey = post?.uri?.split("/").pop();
        const did = post?.author?.did;
        const webUrl = rkey && did ? `https://bsky.app/profile/${handle}/post/${rkey}` : `https://bsky.app/profile/${handle}`;
        all.push({
          title: text.length > 220 ? `${text.slice(0, 217)}...` : text,
          url: webUrl,
          source: `Bluesky · @${handle}`,
          publishedAt: parseDate(record?.createdAt),
          description: "",
          tags: tagText(text),
        });
      }
    } catch (error) {
      source.note = `${handle} failed: ${error.message}`;
    }
  }

  source.ok = okHandles > 0;
  source.note = okHandles > 0
    ? `Pulled ${all.length} relevant posts from ${okHandles}/${handles.length} handles.`
    : source.note;
  sourceHealth.push(source);
  return all;
}

function noteGdeltDisabled(sourceHealth) {
  sourceHealth.push({
    id: "gdelt-doc-api",
    name: "GDELT document API",
    url: "https://api.gdeltproject.org/api/v2/doc/doc",
    fetchedAt: new Date().toISOString(),
    ok: true,
    note: "Optional discovery is disabled by default. Set ENABLE_GDELT=1 to include it.",
  });
  return [];
}

async function collectPolymarket(sourceHealth) {
  const source = {
    id: "polymarket-public-search",
    name: "Polymarket public search",
    url: "https://gamma-api.polymarket.com/public-search",
    fetchedAt: new Date().toISOString(),
    ok: false,
    note: "Market fetch pending",
  };

  const markets = [];
  for (const query of POLYMARKET_QUERIES) {
    const url = `${source.url}?q=${encodeURIComponent(query)}&limit_per_type=20&events_status=active&search_profiles=false`;
    try {
      const json = await fetchJson(url);
      const events = Array.isArray(json.events) ? json.events : [];
      for (const event of events) {
        for (const market of event.markets || []) {
          if (!market.active || market.closed) continue;
          const haystack = `${event.title} ${market.question}`.toLowerCase();
          if (!MARKET_KEYWORDS.some((keyword) => haystack.includes(keyword))) continue;
          if (
            /Next UK Prime Minister/i.test(event.title || "") &&
            !/Streeting|Burnham|Rayner|Powell|Cooper|Reeves|Mahmood/i.test(market.question || "")
          ) {
            continue;
          }
          const parsed = parseMarket(event, market);
          if (parsed) markets.push(parsed);
        }
      }
    } catch (error) {
      source.note = `Market fetch failed for "${query}": ${error.message}`;
    }
  }

  const deduped = dedupeBy(markets, (market) => market.question).sort(
    (a, b) => Number(b.volume || 0) - Number(a.volume || 0),
  );

  source.ok = deduped.length > 0;
  source.note = source.ok
    ? `Parsed ${deduped.length} active relevant markets.`
    : source.note === "Market fetch pending"
      ? "No active relevant markets returned."
      : source.note;
  sourceHealth.push(source);
  return deduped.slice(0, 12);
}

function parseMarket(event, market) {
  const outcomes = parseJsonArray(market.outcomes);
  const prices = parseJsonArray(market.outcomePrices).map(Number);
  if (!outcomes.length || !prices.length) return null;
  const yesIndex = outcomes.findIndex((outcome) => /^yes$/i.test(outcome));
  const index = yesIndex >= 0 ? yesIndex : 0;
  const yesPrice = Number(prices[index]);

  return {
    eventTitle: event.title,
    question: market.question,
    yesPrice: Number.isFinite(yesPrice) ? yesPrice : null,
    noPrice: prices[index === 0 ? 1 : 0] ?? null,
    volume: Number(market.volumeNum || market.volume || event.volume || 0),
    liquidity: Number(market.liquidityClob || market.liquidity || event.liquidity || 0),
    updatedAt: market.updatedAt || event.updatedAt,
    url: event.slug
      ? `https://polymarket.com/event/${event.slug}`
      : `https://polymarket.com/market/${market.slug}`,
  };
}

function buildCounts(labour, manual) {
  const resignValue = labour.resignCalls ?? labour.resignationCalls.length;
  const supportValue = labour.supporters ?? 0;
  const threshold = manual.contestThreshold ?? DEFAULT_MANUAL.contestThreshold;
  const ministerExits = labour.exits.filter((exit) => /minister/i.test(exit.role)).length;

  return {
    resignCalls: {
      value: resignValue,
      label: "Calling for exit",
      note: "MPs calling for Starmer to resign or set a timetable.",
      source: "LabourList",
    },
    supporters: {
      value: supportValue,
      label: "Backing Starmer",
      note: "MPs reported signing a support statement backing the PM.",
      source: "LabourList",
    },
    threshold: {
      value: threshold,
      label: "Contest threshold",
      note: "Modeled 20 percent PLP trigger threshold. Keep this override current.",
      source: "Manual",
    },
    ministersOut: {
      value: ministerExits,
      label: "Ministers out",
      note: "Ministerial resignations found in tracker/news copy.",
      source: "News",
    },
  };
}

function buildPressure(counts, labour) {
  const pressure = counts.resignCalls.value;
  const support = counts.supporters.value;
  const threshold = counts.threshold.value;
  const thresholdDelta = pressure - threshold;
  const supportDelta = support - pressure;

  const thresholdText =
    thresholdDelta >= 0
      ? `${thresholdDelta} above the modeled contest threshold`
      : `${Math.abs(thresholdDelta)} short of the modeled contest threshold`;
  const supportText =
    supportDelta >= 0
      ? `the public support bloc is ${supportDelta} larger than the pressure bloc`
      : `the pressure bloc is ${Math.abs(supportDelta)} larger than the public support bloc`;

  return {
    asOf: labour.asOf,
    thresholdDelta,
    supportDelta,
    note: `${pressure} MPs are recorded as calling for an exit or timetable, ${thresholdText}; ${supportText}. A public count is not the same as a formal leadership challenge.`,
  };
}

function topStarmerExitMarket(markets) {
  return markets
    .filter((market) => /Starmer.*(out|resign|cease|exit|depart)|resign.*Starmer|Starmer 2026/i.test(market.question))
    .sort((a, b) => Number(b.yesPrice || 0) - Number(a.yesPrice || 0))[0];
}

function scoreNewsSentiment(news) {
  const now = Date.now();
  const recent = (news || []).filter((item) => {
    const t = new Date(item.publishedAt || 0).getTime();
    return Number.isFinite(t) && now - t <= 48 * 3600 * 1000;
  });
  if (!recent.length) return { normalised: null, raw: "no recent items", count: 0, avg: 0 };

  let net = 0;
  let scored = 0;
  for (const item of recent) {
    const text = String(item.title || "").toLowerCase();
    const neg = NEGATIVE_LEXICON.reduce((sum, term) => sum + (text.includes(term) ? 1 : 0), 0);
    const pos = POSITIVE_LEXICON.reduce((sum, term) => sum + (text.includes(term) ? 1 : 0), 0);
    if (neg + pos === 0) continue;
    net += (neg - pos) / (neg + pos);
    scored += 1;
  }
  const avg = scored ? net / scored : 0;
  const intensity = Math.min(1, recent.length / 20);
  const negativity = Math.max(0, Math.min(1, (avg + 1) / 2));
  const normalised = intensity * negativity;
  return {
    normalised,
    raw: `${recent.length} items (48h), ${scored} sentiment-scored, avg ${avg.toFixed(2)}`,
    count: recent.length,
    avg,
  };
}

function buildPressureIndex({ counts, markets, manual, news }) {
  const pressure = counts.resignCalls.value || 0;
  const support = counts.supporters.value || 0;
  const threshold = counts.threshold.value || 81;
  const ministers = counts.ministersOut.value || 0;
  const exitMarket = topStarmerExitMarket(markets);
  const marketProb = Number(exitMarket?.yesPrice);
  const marketProbNorm = Number.isFinite(marketProb) ? Math.max(0, Math.min(1, marketProb)) : null;

  const exitShare = Math.max(0, Math.min(1, pressure / threshold));
  const supportLead = support - pressure;
  const supportDeficit = Math.max(0, Math.min(1, (40 - supportLead) / 40));
  const ministerMomentum = Math.max(0, Math.min(1, ministers / 5));

  const newsScore = scoreNewsSentiment(news);
  const parts = [
    { id: "exitShare", label: "PLP exit-call share vs trigger", weight: INDEX_WEIGHTS.exitShare, normalised: exitShare, raw: `${pressure} / ${threshold}` },
    { id: "supportDeficit", label: "Support deficit", weight: INDEX_WEIGHTS.supportDeficit, normalised: supportDeficit, raw: `lead ${supportLead}` },
    { id: "ministerMomentum", label: "Minister-exit momentum", weight: INDEX_WEIGHTS.ministerMomentum, normalised: ministerMomentum, raw: `${ministers} exits` },
    {
      id: "marketExitProb",
      label: "Polymarket exit probability",
      weight: INDEX_WEIGHTS.marketExitProb,
      normalised: marketProbNorm,
      raw: exitMarket ? `${priceLabel(marketProb)} · ${exitMarket.question}` : "no market",
    },
    {
      id: "newsSentiment",
      label: "News intensity × negativity",
      weight: INDEX_WEIGHTS.newsSentiment,
      normalised: newsScore.normalised,
      raw: newsScore.raw,
    },
  ];

  let totalWeight = 0;
  let score = 0;
  for (const part of parts) {
    if (part.normalised == null) continue;
    score += part.normalised * part.weight;
    totalWeight += part.weight;
    part.contribution = Math.round(part.normalised * part.weight * 10) / 10;
  }
  const value = totalWeight ? Math.round((score / totalWeight) * 100) : 0;

  const band = value >= 75 ? "critical" : value >= 55 ? "elevated" : value >= 35 ? "building" : "contained";
  return {
    value,
    band,
    formula: "Weighted: 35% PLP exit-call share, 15% support deficit, 10% minister exits, 25% Polymarket exit probability, 15% news intensity × negativity. Each input is normalised to 0-1 before weighting; missing inputs are dropped and remaining weights re-scaled.",
    components: parts,
    marketProb: marketProbNorm,
  };
}

async function updateHistory({ generatedAt, counts, pressureIndex }) {
  let history = [];
  try {
    const raw = await readFile(historyPath, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) history = parsed;
  } catch {}

  const last = history[history.length - 1];
  const entry = {
    t: generatedAt,
    pressure: counts.resignCalls.value || 0,
    support: counts.supporters.value || 0,
    ministers: counts.ministersOut.value || 0,
    index: pressureIndex.value,
    marketProb: pressureIndex.marketProb,
  };

  const sameMinute = last && new Date(last.t).getUTCMinutes() === new Date(entry.t).getUTCMinutes() &&
    last.pressure === entry.pressure && last.support === entry.support && last.index === entry.index;
  if (!sameMinute) history.push(entry);
  if (history.length > HISTORY_LIMIT) history = history.slice(-HISTORY_LIMIT);

  await writeFile(historyPath, `${JSON.stringify(history, null, 2)}\n`, "utf8");
  return history;
}

function buildProxyGroups(manual, labour) {
  const membership = manual.factionMembership || {};
  const resignSet = new Set((labour.resignationCalls || []).map((mp) => mp.name));
  const supportSet = new Set((manual.supportBloc || []).map((entry) => (typeof entry === "string" ? entry : entry.name)));

  const groups = Object.entries(membership).map(([id, group]) => {
    const mps = Array.isArray(group.mps) ? group.mps : [];
    const calling = mps.filter((name) => resignSet.has(name));
    const backing = mps.filter((name) => supportSet.has(name));
    const undeclared = mps.length - calling.length - backing.length;
    const lean = calling.length > backing.length ? "tilting against" : backing.length > calling.length ? "holding" : "split";
    return {
      id,
      name: group.name || id,
      note: group.note || "",
      total: mps.length,
      calling: calling.length,
      backing: backing.length,
      undeclared: Math.max(0, undeclared),
      lean,
      callingNames: calling,
      backingNames: backing,
    };
  });

  return groups;
}

function buildHeadline(counts, markets, pressureIndex) {
  const pressure = counts.resignCalls.value;
  const threshold = counts.threshold.value;
  const exitMarket = topStarmerExitMarket(markets);
  const marketPhrase = exitMarket
    ? ` Polymarket's top Starmer-exit signal is ${priceLabel(exitMarket.yesPrice)}.`
    : "";
  const indexPhrase = pressureIndex ? ` Pressure Index ${pressureIndex.value}/100 (${pressureIndex.band}).` : "";

  if (pressure >= threshold) {
    return `Public pressure bloc is above the modeled ${threshold} MP trigger.${indexPhrase}${marketPhrase}`;
  }
  return `Pressure building but below the modeled ${threshold} MP trigger.${indexPhrase}${marketPhrase}`;
}

function priceLabel(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "n/a";
  return `${Math.round(num * 1000) / 10}%`;
}

function buildResignations(labour, news) {
  const newsSignals = news
    .filter((item) => /resign|minister/i.test(`${item.title} ${item.description || ""}`))
    .slice(0, 3)
    .map((item) => ({
      name: "News resignation signal",
      role: "Source headline",
      move: item.title,
      alignment: "source corroboration",
      source: item.source,
    }));

  return dedupeBy([...labour.exits, ...newsSignals], (item) => `${item.name}:${item.move}`).slice(0, 12);
}

function buildFactions({ counts, labour, news, markets, resignations, manual }) {
  const textCorpus = `${labour.rawText} ${news.map((item) => item.title).join(" ")}`;
  const streetingHit =
    news.find((item) => /Streeting.*meet Starmer|meet Starmer.*Streeting/i.test(item.title)) ||
    news.find((item) => /Streeting/i.test(item.title));
  const burnhamHit = news.find((item) => /Burnham/i.test(item.title));
  const leadershipMarket = markets.find((market) => /Labour leadership election scheduled/i.test(market.question));
  const pmMarket = markets.find((market) => /Wes Streeting|Angela Rayner|Prime Minister/i.test(market.question));
  const healthExit = resignations.find((item) => /health minister/i.test(item.role));

  const factions = [
    {
      id: "streeting",
      name: "Wes Streeting",
      role: "Health Secretary and possible succession contender",
      pressureScore: scoreFromSignals([
        /Streeting/i.test(textCorpus),
        /meet Starmer|meeting Starmer/i.test(textCorpus),
        Boolean(healthExit),
        Boolean(pmMarket && /Wes Streeting/i.test(pmMarket.question)),
      ]),
      posture:
        "Operating as the live cabinet contender: visible enough to matter, cautious enough to avoid owning the first move.",
      latestMove: streetingHit?.title || "Watch for cabinet meeting and health-department proxy signals",
      signals: compactSignals([
        streetingHit && `${streetingHit.source}: ${streetingHit.title}`,
        /meet Starmer|meeting Starmer/i.test(textCorpus) &&
          "Source copy flags a Streeting-Starmer meeting as a live waypoint.",
        healthExit &&
          `${healthExit.name} left a health role; treat this as a Streeting-orbit pressure signal, not proof of direction.`,
        pmMarket &&
          /Wes Streeting/i.test(pmMarket.question) &&
          `Polymarket has Streeting in the next-PM market at ${priceLabel(pmMarket.yesPrice)}.`,
      ]),
    },
    {
      id: "burnham",
      name: "Andy Burnham",
      role: "Greater Manchester mayor and external Labour alternative",
      pressureScore: scoreFromSignals([
        /Burnham/i.test(textCorpus),
        /cabinet/i.test(burnhamHit?.title || ""),
        /blocked Andy Burnham|include giving Andy Burnham/i.test(textCorpus),
        Boolean(leadershipMarket),
      ]),
      posture:
        "External route pressure: his leverage is membership and PLP appetite, but any path still depends on parliamentary access or a mediated role.",
      latestMove: burnhamHit?.title || "Watch for cabinet-entry, by-election, or unity-team language",
      signals: compactSignals([
        burnhamHit && `${burnhamHit.source}: ${burnhamHit.title}`,
        /blocked Andy Burnham/i.test(textCorpus) &&
          "LabourList quotes an MP saying Burnham should not be blocked again if a route opens.",
        /include giving Andy Burnham/i.test(textCorpus) &&
          "Parsed source text says any transition should include giving Burnham a path into the conversation.",
        leadershipMarket &&
          `Leadership-election scheduling market sits at ${priceLabel(leadershipMarket.yesPrice)}.`,
      ]),
    },
    {
      id: "starmer",
      name: "Keir Starmer",
      role: "Prime Minister defending the leadership",
      pressureScore: scoreFromSignals([
        counts.supporters.value > counts.resignCalls.value,
        /remained defiant|defies calls/i.test(textCorpus),
        counts.supporters.value > 0,
      ]),
      posture:
        "Defence is built on public loyalty numbers, cabinet discipline, and making challengers show their hand.",
      latestMove: `${counts.supporters.value} MPs reported on the support statement`,
      signals: compactSignals([
        `${counts.supporters.value} MPs are reported backing the PM versus ${counts.resignCalls.value} calling for an exit or timetable.`,
        /remained defiant|defies calls/i.test(textCorpus) &&
          "Parsed source copy characterises Starmer as defiant in the face of resignation demands.",
        "The dashboard separates public declarations from a formal internal trigger.",
      ]),
    },
    {
      id: "rayner",
      name: "Angela Rayner",
      role: "Deputy PM and continuity or unity option",
      pressureScore: scoreFromSignals([
        /Rayner/i.test(textCorpus),
        Boolean(markets.find((market) => /Angela Rayner/i.test(market.question))),
      ]),
      posture:
        "Visible in market pricing and succession chatter, but less central to the current Streeting-Burnham pressure lane.",
      latestMove: "Track as a control signal against Streeting and Burnham",
      signals: compactSignals([
        markets.find((market) => /Angela Rayner/i.test(market.question)) &&
          `Polymarket prices Rayner in the next-PM market.`,
        /Rayner/i.test(textCorpus) && "Newsflow includes Rayner succession references.",
      ]),
    },
  ];

  return factions.map((faction) => ({
    ...faction,
    ...(manual.factionOverrides?.[faction.id] || {}),
  }));
}

function scoreFromSignals(signals) {
  return Math.min(9, 2 + signals.filter(Boolean).length * 2);
}

function compactSignals(signals) {
  const filtered = signals.filter(Boolean);
  return filtered.length ? filtered : ["No high-confidence move detected in the current parsed feed."];
}

function parseRssItems(xml, fallbackSource) {
  const itemBlocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) || [];
  return itemBlocks.map((block) => {
    const title = extractXmlTag(block, "title");
    const link = extractXmlTag(block, "link");
    const pubDate = extractXmlTag(block, "pubDate") || extractXmlTag(block, "dc:date");
    const description = extractXmlTag(block, "description");
    const source = extractXmlTag(block, "source") || fallbackSource;

    return {
      title: cleanText(title),
      url: cleanText(link),
      source: cleanText(source),
      publishedAt: parseDate(pubDate),
      description: cleanText(description),
      tags: [],
    };
  });
}

function extractXmlTag(block, tag) {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = block.match(new RegExp(`<${escaped}[^>]*>([\\s\\S]*?)<\\/${escaped}>`, "i"));
  return decodeXml(match?.[1] || "");
}

function mergeNews(items) {
  return dedupeBy(
    items
      .filter((item) => item.title && item.url)
      .sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0)),
    (item) => normalizeUrl(item.url),
  ).slice(0, 40);
}

function isRelevantNews(text) {
  const lower = String(text || "").toLowerCase();
  return NEWS_KEYWORDS.some((keyword) => lower.includes(keyword));
}

function tagText(text) {
  const lower = String(text || "").toLowerCase();
  const tags = [];
  if (lower.includes("streeting")) tags.push("Streeting");
  if (lower.includes("burnham")) tags.push("Burnham");
  if (lower.includes("rayner")) tags.push("Rayner");
  if (lower.includes("resign")) tags.push("Resignation");
  if (lower.includes("minister") || lower.includes("cabinet")) tags.push("Cabinet");
  if (lower.includes("leadership")) tags.push("Leadership");
  if (!tags.length && lower.includes("starmer")) tags.push("Starmer");
  return tags;
}

function classifyExit(role) {
  if (/health/i.test(role)) return "health department";
  if (/PPS/i.test(role)) return "parliamentary aide";
  if (/minister/i.test(role)) return "ministerial exit";
  return "pressure signal";
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (compatible; StarmerWatch/1.0; +https://example.com/starmer-watch)",
      accept: "text/html,application/rss+xml,application/xml,text/xml,*/*",
    },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "StarmerWatch/1.0",
      accept: "application/json",
    },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function htmlToText(html) {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, "\n")
      .replace(/<style[\s\S]*?<\/style>/gi, "\n")
      .replace(/<[^>]+>/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n{3,}/g, "\n\n"),
  );
}

function decodeXml(value) {
  return decodeEntities(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;|&#8220;|&#8221;/g, '"')
    .replace(/&#8217;|&#039;|&apos;/g, "'")
    .replace(/&#8216;/g, "'")
    .replace(/&#8211;|&#8212;/g, "-")
    .replace(/&#8230;/g, "...");
}

function cleanText(value) {
  return decodeXml(value).replace(/\s+/g, " ").trim();
}

function parseDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseGdeltDate(value) {
  if (!value || !/^\d{14}$/.test(value)) return parseDate(value);
  const iso = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(8, 10)}:${value.slice(10, 12)}:${value.slice(12, 14)}Z`;
  return parseDate(iso);
}

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return url;
  }
}

function dedupeBy(items, keyFn) {
  const seen = new Set();
  const output = [];
  for (const item of items) {
    const key = keyFn(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
