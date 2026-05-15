#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

let winkNlpInstance = null;
async function getWinkNlp() {
  if (winkNlpInstance !== null) return winkNlpInstance;
  try {
    const winkNLP = (await import("wink-nlp")).default;
    const model = (await import("wink-eng-lite-web-model")).default;
    winkNlpInstance = winkNLP(model);
  } catch (error) {
    console.warn(`winkNLP unavailable, falling back to lexicon only: ${error.message}`);
    winkNlpInstance = false;
  }
  return winkNlpInstance;
}

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
  { id: "sam-freedman", name: "Sam Freedman — Comment is Freed", url: "https://news.google.com/rss/search?q=site:samf.substack.com+OR+%22Sam+Freedman%22+Starmer&hl=en-GB&gl=GB&ceid=GB:en" },
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
  "mandelson",
  "epstein",
  "mandelson files",
  "epstein files",
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
  "backs", "support", "defends", "rallies behind", "loyal",
  "endorses", "stands by", "unites behind", "show of support", "secures",
];

const NEGATIONS = new Set(["not", "no", "never", "without", "won't", "wont", "doesn't", "doesnt", "didn't", "didnt", "isn't", "isnt", "aren't", "arent", "denies", "rejects", "rules out", "stops"]);
const ENTITIES = {
  starmer: ["starmer", "keir starmer", "the pm", "prime minister"],
  streeting: ["streeting", "wes streeting"],
  burnham: ["burnham", "andy burnham"],
  rayner: ["rayner", "angela rayner"],
};

const REDDIT_SUBS = ["ukpolitics", "LabourUK"];
const WIKI_PAGES = [
  "Keir_Starmer", "Wes_Streeting", "Andy_Burnham", "Angela_Rayner",
  "Rachel_Reeves", "Yvette_Cooper", "Pat_McFadden", "Starmer_ministry",
];
const HTTP_THROTTLE_MS = 350;
const httpCachePath = "data/http-cache.json";
const alertStatePath = "data/alert-state.json";
let httpCache = {};
let lastFetchAt = 0;

async function main() {
  await loadHttpCache();
  const manual = await readManualOverrides();
  const generatedAt = new Date().toISOString();
  const sourceHealth = [];

  const labour = await collectLabourList(sourceHealth);
  const rssNews = await collectRssNews(sourceHealth);
  const bskyNews = await collectBluesky(sourceHealth, manual);
  const guardianNews = await collectGuardianApi(sourceHealth);
  const redditNews = []; // Reddit JSON 403s persistently from GH Actions IP ranges; collector disabled.
  const wikiEdits = await collectWikipediaEdits(sourceHealth);
  const ccNewsMeta = await collectCcNewsMeta(sourceHealth);
  const parliament = await collectParliamentState(sourceHealth);
  const gdeltNews =
    process.env.ENABLE_GDELT === "1" ? await collectGdeltNews(sourceHealth) : noteGdeltDisabled(sourceHealth);
  const markets = await collectPolymarket(sourceHealth);

  const news = mergeNews([...rssNews, ...gdeltNews, ...bskyNews, ...guardianNews, ...redditNews]);
  augmentExitsFromNews(labour, news);
  await mergePersistedCabinetExits(labour);
  const counts = buildCounts(labour, manual, parliament);
  const pressure = buildPressure(counts, labour);
  const resignations = buildResignations(labour, news);
  const factions = buildFactions({ counts, labour, news, markets, resignations, manual });
  const proxyGroups = buildProxyGroups(manual, labour);
  const priorHistory = await readPriorHistory();
  const escalation = buildEscalationSignals({ labour, news, counts });
  const pressureIndex = await buildPressureIndex({ counts, markets, manual, news, priorHistory, escalation });
  const highSignalNews = buildHighSignalNews(news, escalation);
  const history = await updateHistory({ generatedAt, counts, pressureIndex });
  await maybeFireAlerts({ pressureIndex, history, counts, manual });
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
    wikipediaEdits: wikiEdits,
    ccNewsCrawl: ccNewsMeta,
    baselines: await readBaselines(),
    parliament,
    escalation,
    highSignalNews,
    nextCatalysts: buildNextCatalysts({ counts, news, pressureIndex, escalation }),
    sources: sourceHealth.concat(manual.sourceNotes || []),
  };

  await writeFile(latestPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  await writePublicFeeds(output);
  await saveHttpCache();
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

  const tryFetch = async () => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 12000);
    try {
      return await fetch(url, {
        signal: ac.signal,
        headers: { "user-agent": "Starmer Watch data refresh (contact: dashboard owner)" },
      });
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    let response;
    try {
      response = await tryFetch();
    } catch (firstErr) {
      await new Promise((r) => setTimeout(r, 1500));
      response = await tryFetch();
    }
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
    source.ok = true;
    source.note = `Transient unavailable (GDELT upstream often flaky): ${error.message}. Will retry next run.`;
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

async function collectGuardianApi(sourceHealth) {
  const key = process.env.GUARDIAN_API_KEY;
  const source = {
    id: "guardian-open-platform",
    name: "Guardian Open Platform",
    url: "https://content.guardianapis.com/search",
    fetchedAt: new Date().toISOString(),
    ok: false,
    note: key ? "Querying Guardian content API" : "Set GUARDIAN_API_KEY (free signup at open-platform.theguardian.com) to enable.",
  };
  if (!key) {
    sourceHealth.push(source);
    return [];
  }

  try {
    const q = encodeURIComponent('("Keir Starmer" OR "Labour leadership" OR Streeting OR Burnham OR Rayner)');
    const url = `https://content.guardianapis.com/search?q=${q}&section=politics&order-by=newest&page-size=30&show-fields=trailText&api-key=${encodeURIComponent(key)}`;
    const json = await fetchJson(url);
    const results = json?.response?.results || [];
    const items = results.map((r) => ({
      title: cleanText(r.webTitle),
      url: r.webUrl,
      source: "Guardian (Open Platform)",
      publishedAt: parseDate(r.webPublicationDate),
      description: cleanText(r.fields?.trailText || ""),
      tags: tagText(`${r.webTitle} ${r.fields?.trailText || ""}`),
    }));
    source.ok = true;
    source.note = `Pulled ${items.length} Guardian politics items via Open Platform.`;
    sourceHealth.push(source);
    return items;
  } catch (error) {
    source.note = `Guardian API failed: ${error.message}`;
    sourceHealth.push(source);
    return [];
  }
}

async function collectReddit(sourceHealth) {
  const source = {
    id: "reddit-uk-politics",
    name: "Reddit UK politics",
    url: "https://www.reddit.com",
    fetchedAt: new Date().toISOString(),
    ok: false,
    note: "Querying r/ukpolitics, r/LabourUK, r/unitedkingdom",
  };
  const all = [];
  let okSubs = 0;
  for (const sub of REDDIT_SUBS) {
    try {
      const url = `https://www.reddit.com/r/${sub}/new.json?limit=25`;
      const json = await fetchJson(url, {
        "user-agent": "web:starmer-watch:1.0 (+https://github.com/asim48-ctrl/starmer-watch)",
      });
      const posts = json?.data?.children || [];
      okSubs += 1;
      for (const child of posts) {
        const p = child.data;
        if (!p || p.stickied) continue;
        const text = `${p.title || ""} ${p.selftext || ""}`;
        if (!isRelevantNews(text)) continue;
        all.push({
          title: cleanText(p.title || "").slice(0, 220),
          url: p.url_overridden_by_dest && /^https?:/.test(p.url_overridden_by_dest) ? p.url_overridden_by_dest : `https://www.reddit.com${p.permalink}`,
          source: `Reddit · r/${sub}`,
          publishedAt: p.created_utc ? new Date(p.created_utc * 1000).toISOString() : null,
          description: "",
          tags: tagText(text),
        });
      }
    } catch (error) {
      source.note = `r/${sub} failed: ${error.message}`;
    }
  }
  source.ok = okSubs > 0;
  if (okSubs > 0) source.note = `Pulled ${all.length} relevant posts across ${okSubs}/${REDDIT_SUBS.length} subs.`;
  sourceHealth.push(source);
  return all;
}

async function collectWikipediaEdits(sourceHealth) {
  const source = {
    id: "wikipedia-edits",
    name: "Wikipedia edits (Starmer-orbit)",
    url: "https://en.wikipedia.org/w/api.php",
    fetchedAt: new Date().toISOString(),
    ok: false,
    note: `Querying ${WIKI_PAGES.length} pages`,
  };
  const titles = WIKI_PAGES.join("|");
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=query&format=json&prop=revisions&titles=${encodeURIComponent(titles)}&rvprop=timestamp%7Ccomment%7Cuser%7Csize&rvlimit=5&formatversion=2`;
    const json = await fetchJson(url, {
      "user-agent": "StarmerWatch/1.0 (https://github.com/asim48-ctrl/starmer-watch)",
      "api-user-agent": "StarmerWatch/1.0 (https://github.com/asim48-ctrl/starmer-watch)",
    });
    const pages = json?.query?.pages || [];
    const edits = [];
    for (const page of pages) {
      for (const rev of page.revisions || []) {
        edits.push({
          page: page.title,
          user: rev.user,
          comment: cleanText(rev.comment || ""),
          size: rev.size,
          timestamp: rev.timestamp,
          url: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}?diff=prev`,
        });
      }
    }
    edits.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    source.ok = true;
    source.note = `Collected ${edits.length} recent revisions across ${pages.length} pages.`;
    sourceHealth.push(source);
    return edits.slice(0, 20);
  } catch (error) {
    source.note = `Wikipedia API failed: ${error.message}`;
    sourceHealth.push(source);
    return [];
  }
}

async function collectParliamentState(sourceHealth) {
  const source = {
    id: "parliament-members-api",
    name: "UK Parliament Members API",
    url: "https://members-api.parliament.uk/api/Parties/StateOfTheParties",
    fetchedAt: new Date().toISOString(),
    ok: false,
    note: "Querying State of the Parties for live PLP size",
  };
  const date = new Date().toISOString().slice(0, 10);
  const url = `https://members-api.parliament.uk/api/Parties/StateOfTheParties/1/${date}`;
  try {
    const json = await fetchJson(url, {
      "user-agent": "StarmerWatch/1.0 (https://github.com/asim48-ctrl/starmer-watch)",
    });
    const items = Array.isArray(json.items) ? json.items : [];
    const parties = items.map((item) => item.value).filter(Boolean);
    const labour = parties.find((p) => p?.party?.name === "Labour");
    const plpSize = labour?.total ?? null;
    if (!plpSize) {
      source.note = "API returned no Labour entry for today.";
      sourceHealth.push(source);
      return null;
    }
    source.ok = true;
    source.note = `PLP size ${plpSize}; 20% trigger = ${Math.ceil(plpSize * 0.2)}.`;
    sourceHealth.push(source);
    return {
      plpSize,
      threshold20pct: Math.ceil(plpSize * 0.2),
      partySplit: parties.map((p) => ({ name: p.party?.name, total: p.total })),
    };
  } catch (error) {
    source.note = `Members API failed: ${error.message}`;
    sourceHealth.push(source);
    return null;
  }
}

async function collectCcNewsMeta(sourceHealth) {
  const source = {
    id: "cc-news-meta",
    name: "Common Crawl CC-NEWS (metadata)",
    url: "https://data.commoncrawl.org",
    fetchedAt: new Date().toISOString(),
    ok: false,
    note: "Article ingest is too heavy for CI; tracking latest crawl pointer only.",
  };
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const url = `https://data.commoncrawl.org/crawl-data/CC-NEWS/${year}/${month}/warc.paths.gz`;
  try {
    const head = await fetch(url, { method: "HEAD" });
    if (!head.ok) {
      source.note = `No CC-NEWS warc paths yet for ${year}-${month} (HTTP ${head.status}).`;
      sourceHealth.push(source);
      return null;
    }
    source.ok = true;
    const size = head.headers.get("content-length");
    const lastModified = head.headers.get("last-modified");
    source.note = `Latest CC-NEWS warc.paths.gz available · ${size || "?"} bytes · ${lastModified || "unknown"}`;
    sourceHealth.push(source);
    return { period: `${year}-${month}`, pointer: url, sizeBytes: size ? Number(size) : null, lastModified };
  } catch (error) {
    source.note = `CC-NEWS metadata failed: ${error.message}`;
    sourceHealth.push(source);
    return null;
  }
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

function buildCounts(labour, manual, parliament) {
  const resignValue = labour.resignCalls ?? labour.resignationCalls.length;
  const supportValue = labour.supporters ?? 0;
  const livePlpSize = parliament?.plpSize;
  const liveThreshold = livePlpSize ? Math.ceil(livePlpSize * 0.2) : null;
  const threshold = liveThreshold ?? manual.contestThreshold ?? DEFAULT_MANUAL.contestThreshold;
  const ministerExits = labour.exits.filter((exit) => /minister|secretary|chancellor/i.test(exit.role)).length;

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
      note: livePlpSize
        ? `20% of current PLP (${livePlpSize}) per UK Parliament Members API.`
        : "Modeled 20 percent PLP trigger threshold (manual override; live PLP size unavailable).",
      source: livePlpSize ? "UK Parliament Members API" : "Manual",
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

function parseHorizonDate(question) {
  // Extract a date from market questions like "Starmer out by June 30, 2026?"
  const m = String(question || "").match(/by ([A-Z][a-z]+ \d{1,2},? \d{4})/);
  if (!m) return null;
  const d = new Date(m[1].replace(",", ""));
  return Number.isNaN(d.getTime()) ? null : d;
}

function starmerExitMarkets(markets) {
  return markets.filter((market) =>
    /Starmer.*(out|resign|cease|exit|depart)|resign.*Starmer|Starmer 2026/i.test(market.question),
  );
}

function topStarmerExitMarket(markets) {
  // Pick the shortest-dated market that is at least 14 days out. Markets within
  // a few days carry trivially near-zero YES even during a real crisis, which
  // understates pressure. Markets too far out price cumulative hazard rather
  // than current pressure. The 14-90 day band is the meaningful zone. Fall
  // back to the highest-YES market if no horizon parseable.
  const now = Date.now();
  const minMs = 14 * 86400 * 1000;
  const maxMs = 120 * 86400 * 1000;
  const filtered = starmerExitMarkets(markets);
  const dated = filtered
    .map((m) => ({ m, d: parseHorizonDate(m.question) }))
    .filter((x) => x.d)
    .map((x) => ({ ...x, age: x.d.getTime() - now }))
    .filter((x) => x.age >= minMs && x.age <= maxMs)
    .sort((a, b) => a.age - b.age);
  if (dated.length) return dated[0].m;
  return filtered.sort((a, b) => Number(b.yesPrice || 0) - Number(a.yesPrice || 0))[0];
}

function marketDeltasFromHistory(currentProb, history) {
  if (!Number.isFinite(currentProb) || !Array.isArray(history) || !history.length) return null;
  const now = Date.now();
  const find = (msAgo) => {
    let best = null;
    let bestDiff = Infinity;
    for (const h of history) {
      const t = new Date(h.t).getTime();
      if (!Number.isFinite(t)) continue;
      const target = now - msAgo;
      const diff = Math.abs(t - target);
      if (t <= now - msAgo * 0.5 && diff < bestDiff) {
        best = h;
        bestDiff = diff;
      }
    }
    return best;
  };
  const lastEntry = history.length >= 2 ? history[history.length - 2] : null;
  const oneHour = find(60 * 60 * 1000);
  const dayAgo = find(24 * 60 * 60 * 1000);
  const pp = (h) => {
    const prev = Number(h?.marketProb);
    if (!Number.isFinite(prev)) return null;
    return Math.round((currentProb - prev) * 1000) / 10;
  };
  return {
    sinceLast: pp(lastEntry),
    last1h: pp(oneHour),
    last24h: pp(dayAgo),
  };
}

function biggestMarketMover(markets, history) {
  const prev = history?.length >= 2 ? history[history.length - 2] : null;
  if (!prev) return null;
  const prevProb = Number(prev.marketProb);
  if (!Number.isFinite(prevProb)) return null;
  const exitMarkets = starmerExitMarkets(markets);
  let biggest = null;
  for (const m of exitMarkets) {
    const curr = Number(m.yesPrice);
    if (!Number.isFinite(curr)) continue;
    const deltaPp = Math.abs(curr * 100 - prevProb * 100);
    if (!biggest || deltaPp > biggest.deltaPp) {
      biggest = { market: m, deltaPp, curr, prev: prevProb };
    }
  }
  return biggest;
}

function tokenSentiment(text) {
  // Returns net sentiment for a piece of text, with negation handling.
  // Each lexicon hit is flipped if any negation appears in the preceding 3 tokens.
  const lower = String(text || "").toLowerCase();
  const tokens = lower.split(/[^a-z'\-]+/).filter(Boolean);
  const tokenStr = ` ${tokens.join(" ")} `;
  let neg = 0;
  let pos = 0;

  const tally = (term, polarity) => {
    if (!tokenStr.includes(` ${term} `) && !lower.includes(term)) return;
    const idx = tokens.findIndex((_, i) => tokens.slice(i, i + term.split(" ").length).join(" ") === term);
    if (idx === -1) {
      if (polarity > 0) pos += 1; else neg += 1;
      return;
    }
    const window = tokens.slice(Math.max(0, idx - 3), idx);
    const negated = window.some((tok) => NEGATIONS.has(tok));
    const sign = negated ? -polarity : polarity;
    if (sign > 0) pos += 1; else neg += 1;
  };

  for (const term of NEGATIVE_LEXICON) tally(term, -1);
  for (const term of POSITIVE_LEXICON) tally(term, +1);
  return { pos, neg };
}

const STOP_WORDS = new Set([
  "the", "a", "an", "of", "to", "in", "on", "at", "for", "with", "as", "is",
  "and", "or", "but", "by", "from", "that", "this", "his", "her", "he", "she",
  "it", "be", "are", "was", "were", "has", "have", "had", "will", "would",
  "after", "before", "over", "into", "new", "uk", "starmer", "labour",
]);

function titleTokens(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !STOP_WORDS.has(w));
}

function shingles(tokens, k = 3) {
  if (tokens.length < k) return new Set(tokens);
  const out = new Set();
  for (let i = 0; i <= tokens.length - k; i += 1) {
    out.add(tokens.slice(i, i + k).join(" "));
  }
  return out;
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const v of a) if (b.has(v)) inter += 1;
  return inter / (a.size + b.size - inter);
}

function dedupStories(items) {
  // 3-shingle Jaccard clustering. MinHash + LSH would be needed at >1k items; at
  // ~40 items per refresh a direct O(n^2) Jaccard scan is faster and clearer.
  const enriched = items.map((item) => ({ item, sh: shingles(titleTokens(item.title)) }));
  const clusters = [];
  for (const cand of enriched) {
    let placed = false;
    for (const cluster of clusters) {
      if (jaccard(cand.sh, cluster.sh) >= 0.5) {
        cluster.members.push(cand.item);
        if (new Date(cand.item.publishedAt || 0) < new Date(cluster.rep.publishedAt || 0)) {
          cluster.rep = cand.item;
        }
        placed = true;
        break;
      }
    }
    if (!placed) clusters.push({ sh: cand.sh, rep: cand.item, members: [cand.item] });
  }
  return clusters.map((c) => ({ ...c.rep, _cluster: c.members.length }));
}

async function scoreNewsSentiment(news) {
  const now = Date.now();
  const recent = dedupStories((news || []).filter((item) => {
    const t = new Date(item.publishedAt || 0).getTime();
    return Number.isFinite(t) && now - t <= 12 * 3600 * 1000;
  }));
  if (!recent.length) {
    return { normalised: null, raw: "no recent items", count: 0, avg: 0, perEntity: {}, scorer: "none" };
  }

  const wink = await getWinkNlp();
  const winkScore = (text) => {
    if (!wink) return null;
    try {
      const doc = wink.readDoc(text);
      const sents = doc.sentences();
      if (!sents.length()) return null;
      let s = 0;
      let n = 0;
      sents.each((sent) => {
        const v = sent.out(wink.its.sentiment);
        if (Number.isFinite(v)) { s += v; n += 1; }
      });
      return n ? -(s / n) : null; // wink positive = good news; we want negativity = bad-for-Starmer = positive
    } catch {
      return null;
    }
  };

  let net = 0;
  let scored = 0;
  const perEntity = {};
  for (const id of Object.keys(ENTITIES)) perEntity[id] = { net: 0, n: 0 };

  for (const item of recent) {
    const text = String(item.title || "");
    const lower = text.toLowerCase();
    const { pos, neg } = tokenSentiment(lower);
    const lex = pos + neg ? (neg - pos) / (pos + neg) : null;
    const w = winkScore(text);
    let score;
    if (lex != null && w != null) score = (lex + w) / 2; // ensemble
    else if (lex != null) score = lex;
    else if (w != null) score = w;
    else continue;

    net += score;
    scored += 1;
    for (const [id, aliases] of Object.entries(ENTITIES)) {
      if (aliases.some((alias) => lower.includes(alias))) {
        perEntity[id].net += score;
        perEntity[id].n += 1;
      }
    }
  }
  const avg = scored ? net / scored : 0;
  const intensity = Math.min(1, recent.length / 20);
  const negativity = Math.max(0, Math.min(1, (avg + 1) / 2));
  const normalised = intensity * negativity;
  const scorer = wink ? "ensemble (winkNLP + lexicon)" : "lexicon only";

  const perEntityOut = {};
  for (const [id, v] of Object.entries(perEntity)) {
    perEntityOut[id] = v.n
      ? { mentions: v.n, avg: Math.round((v.net / v.n) * 100) / 100 }
      : { mentions: 0, avg: 0 };
  }

  return {
    normalised,
    raw: `${recent.length} clusters (12h, 3-shingle Jaccard ≥0.5), ${scored} scored via ${scorer}, avg ${avg.toFixed(2)}`,
    count: recent.length,
    avg,
    perEntity: perEntityOut,
    scorer,
  };
}

const cabinetExitsPath = "data/cabinet-exits.json";

async function mergePersistedCabinetExits(labour) {
  // Cabinet resignations are durable facts — once detected they should stay
  // counted even after the trigger headline rolls off the news window. The
  // persisted list at data/cabinet-exits.json is append-only; this function
  // (a) merges any previously-detected entries into labour.exits, and
  // (b) writes any *new* news-derived exits back to the file so future
  // refreshes still see them.
  let persisted = [];
  try {
    const raw = await readFile(path.join(rootDir, cabinetExitsPath), "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) persisted = parsed;
  } catch {}

  const existingNames = new Set((labour.exits || []).map((e) => (e.name || "").toLowerCase()));
  const persistedNames = new Set(persisted.map((e) => (e.name || "").toLowerCase()));

  // Append any new news-derived exits (alignment "cabinet exit") to the file.
  for (const exit of labour.exits || []) {
    if (exit.alignment !== "cabinet exit") continue;
    const key = (exit.name || "").toLowerCase();
    if (persistedNames.has(key)) continue;
    persisted.push({
      name: exit.name,
      role: exit.role,
      detectedAt: new Date().toISOString(),
      source: exit.source || "News (auto-detected)",
      move: exit.move,
    });
    persistedNames.add(key);
  }

  // Merge back any persisted entries that aren't already in labour.exits.
  for (const entry of persisted) {
    const key = (entry.name || "").toLowerCase();
    if (existingNames.has(key)) continue;
    labour.exits.push({
      name: entry.name,
      role: entry.role,
      move: entry.move || `${entry.name} resigned as ${entry.role}.`,
      alignment: "cabinet exit",
      source: entry.source || "Persisted",
    });
    existingNames.add(key);
  }

  try {
    await writeFile(path.join(rootDir, cabinetExitsPath), `${JSON.stringify(persisted, null, 2)}\n`, "utf8");
  } catch {}
}

function augmentExitsFromNews(labour, news) {
  // The LabourList scrape only catches "X has resigned as Y minister" style
  // tracker entries. Cabinet-level resignations break first via news headlines.
  // This adds any news-derived senior exits into labour.exits so ministersOut
  // and downstream features reflect them within one refresh.
  if (!labour) return;
  const existing = new Set((labour.exits || []).map((e) => (e.name || "").toLowerCase()));
  const NAME = "([A-Z][A-Za-z'.-]+(?:\\s+[A-Z][A-Za-z'.-]+){1,2})";
  const cutoff = Date.now() - 72 * 3600 * 1000;
  const patterns = [
    new RegExp(`${NAME}\\s+resigns\\s+(?:from\\s+(?:the\\s+)?cabinet|as\\s+(?:[A-Z][a-z]+\\s+)*Secretary)`, "i"),
    new RegExp(`${NAME}\\s+quits\\s+(?:as\\s+)?(?:cabinet|[A-Z][a-z]+\\s+Secretary)`, "i"),
    new RegExp(`${NAME}\\s+resigns\\s+as\\s+([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)*\\s+Secretary)`, "i"),
  ];
  for (const item of news || []) {
    const t = new Date(item.publishedAt || 0).getTime();
    if (!Number.isFinite(t) || t < cutoff) continue;
    const title = String(item.title || "");
    for (const re of patterns) {
      const m = title.match(re);
      if (!m) continue;
      const name = m[1];
      if (!name) continue;
      const key = name.toLowerCase();
      if (existing.has(key)) break;
      const role = m[2] || "Cabinet minister";
      existing.add(key);
      labour.exits.push({
        name,
        role: /minister|secretary/i.test(role) ? role : `${role} minister`,
        move: `${name} resigned as ${role}.`,
        alignment: "cabinet exit",
        source: "News (auto-detected)",
      });
      break;
    }
  }
}

const CHALLENGE_KEYWORDS = [
  "leadership bid", "leadership challenge", "announces challenge",
  "challenges starmer", "running for leader", "candidacy", "throws hat",
  "stand against starmer", "launches challenge", "formal challenge",
];

const DELEGATION_KEYWORDS = [
  "1922 committee", "1922 chair", "plp officers", "plp chair",
  "letter to chairman", "letters reach", "no-confidence letters",
  "no confidence letters", "confidence threshold", "delegation to no 10",
  "delegation to downing street", "men in grey suits", "men in dark suits",
  "told to go", "told to quit", "asked to resign",
];

const SENIOR_RESIGNATION_KEYWORDS = [
  "cabinet minister resigns", "cabinet resignation", "secretary of state resigns",
  "secretary of state quits", "resigns from cabinet", "quits cabinet",
  "deputy prime minister resigns", "chancellor resigns", "home secretary resigns",
  "foreign secretary resigns", "health secretary resigns",
];

function matchesAny(text, list) {
  const lower = text.toLowerCase();
  return list.filter((k) => lower.includes(k));
}

function buildEscalationSignals({ labour, news, counts }) {
  const exits = (labour.exits || []).slice();
  const cutoff48 = Date.now() - 48 * 3600 * 1000;
  const cutoff72 = Date.now() - 72 * 3600 * 1000;

  const delegationHits = [];
  const seniorResignHits = [];
  for (const item of news || []) {
    const t = new Date(item.publishedAt || 0).getTime();
    if (!Number.isFinite(t)) continue;
    const title = String(item.title || "");
    if (t >= cutoff72) {
      const dh = matchesAny(title, DELEGATION_KEYWORDS);
      if (dh.length) delegationHits.push({ ...item, keywords: dh });
    }
    if (t >= cutoff48) {
      const sh = matchesAny(title, SENIOR_RESIGNATION_KEYWORDS);
      if (sh.length) seniorResignHits.push({ ...item, keywords: sh });
    }
  }

  // Paired senior resignations: ≥2 senior-keyword headlines or LabourList
  // exits with role mentioning Secretary/Minister within 48h of each other.
  const seniorExits = exits.filter((e) => /minister|secretary|chancellor/i.test(e.role || ""));
  const pairedSeniorInExits = seniorExits.length >= 2;
  const pairedSeniorInNews = seniorResignHits.length >= 2;
  const pairedSenior = pairedSeniorInExits || pairedSeniorInNews;

  // Estimate stage 1-6 along Truss/Johnson timeline.
  const pressure = counts.resignCalls.value || 0;
  const threshold = counts.threshold.value || 81;
  const ministers = counts.ministersOut.value || 0;
  let stage = 1;
  if (pressure >= threshold) stage = 2;
  if (ministers >= 1) stage = 3;
  if (pairedSenior) stage = 4;
  if (delegationHits.length) stage = 5;
  if (CHALLENGE_KEYWORDS.some((k) => (news || []).some((i) => String(i.title || "").toLowerCase().includes(k)))) stage = Math.max(stage, 5);
  // Stage 6 reserved for explicit "resigns/announces resignation" in headlines tagged to Starmer himself.
  if ((news || []).some((i) => /Starmer (?:resigns|to resign|announces resignation|announces he will step down)/i.test(String(i.title || "")))) stage = 6;

  return {
    stage,
    stageLabel: ["", "Below trigger", "Trigger crossed", "Cabinet exit", "Paired senior exits", "Delegation / formal challenge", "Resignation imminent"][stage] || "",
    pairedSenior,
    pairedSeniorInExits,
    pairedSeniorInNews,
    seniorExitCount: seniorExits.length,
    seniorResignHeadlineCount: seniorResignHits.length,
    delegationHits: delegationHits.slice(0, 5),
    seniorResignHits: seniorResignHits.slice(0, 5),
  };
}

function buildHighSignalNews(news, escalation) {
  // Items that match any of: challenge keywords, delegation keywords,
  // senior-resignation keywords, or explicit Starmer-exit headlines.
  // De-duped by URL, freshest first, capped at 12.
  const seen = new Set();
  const tag = (item, label) => ({ ...item, signalTag: label });
  const out = [];
  for (const item of (news || []).slice().sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0))) {
    const url = item.url;
    if (!url || seen.has(url)) continue;
    const title = String(item.title || "");
    if (CHALLENGE_KEYWORDS.some((k) => title.toLowerCase().includes(k))) {
      seen.add(url); out.push(tag(item, "Leadership-challenge language"));
    } else if (DELEGATION_KEYWORDS.some((k) => title.toLowerCase().includes(k))) {
      seen.add(url); out.push(tag(item, "Delegation / 1922-style"));
    } else if (SENIOR_RESIGNATION_KEYWORDS.some((k) => title.toLowerCase().includes(k))) {
      seen.add(url); out.push(tag(item, "Senior resignation"));
    } else if (/Starmer (?:resigns|to resign|announces resignation|step down)/i.test(title)) {
      seen.add(url); out.push(tag(item, "Starmer-exit headline"));
    }
    if (out.length >= 12) break;
  }
  return out;
}

function detectChallengeSignals(news) {
  const matches = [];
  const cutoff = Date.now() - 72 * 3600 * 1000;
  for (const item of news || []) {
    const t = new Date(item.publishedAt || 0).getTime();
    if (!Number.isFinite(t) || t < cutoff) continue;
    const text = String(item.title || "").toLowerCase();
    const hit = CHALLENGE_KEYWORDS.find((k) => text.includes(k));
    if (hit) matches.push({ keyword: hit, title: item.title, url: item.url, source: item.source, publishedAt: item.publishedAt });
  }
  return matches;
}

function buildNextCatalysts({ counts, news, pressureIndex, escalation }) {
  const pressure = counts.resignCalls.value || 0;
  const threshold = counts.threshold.value || 81;
  const ministers = counts.ministersOut.value || 0;
  const challengeHits = detectChallengeSignals(news);
  const marketProb = pressureIndex.marketProb;

  const watchpoints = [];
  if (escalation) {
    watchpoints.push({
      level: escalation.stage >= 4 ? "red" : escalation.stage >= 3 ? "high" : "info",
      label: `Escalation stage ${escalation.stage}/6 — ${escalation.stageLabel}`,
      detail: "Truss/Johnson timeline mapping. Stage 4+ corresponds to paired senior resignations; stage 5 is delegation/1922-style language; stage 6 is resignation imminent.",
    });
  }
  if (escalation?.pairedSenior) {
    watchpoints.push({
      level: "red",
      label: `Paired senior resignations detected (${escalation.seniorExitCount} cabinet/sec-of-state exits, ${escalation.seniorResignHeadlineCount} senior-resign headlines).`,
      detail: "Two senior departures within 48h is the Truss/Johnson cascade signal — within 24-48h of this pattern, both PMs were out.",
    });
  }
  if (escalation?.delegationHits?.length) {
    watchpoints.push({
      level: "red",
      label: `1922-style / delegation language in headlines (${escalation.delegationHits.length} hits 72h).`,
      detail: "Reports of letters to chairman, no-confidence letters, or party officers delegating to No 10 historically precede resignation by hours to days.",
      examples: escalation.delegationHits.slice(0, 3),
    });
  }
  if (pressure >= threshold) {
    watchpoints.push({
      level: "high",
      label: `Trigger threshold passed (${pressure}/${threshold} MPs).`,
      detail: "20% PLP rule has been met. Pressure now depends on cabinet stability and any formal challenger.",
    });
  } else {
    watchpoints.push({
      level: "info",
      label: `Below trigger (${pressure}/${threshold}).`,
      detail: `${threshold - pressure} more MPs needed to clear the 20% PLP rule.`,
    });
  }
  watchpoints.push({
    level: ministers >= 3 ? "high" : "info",
    label: `${ministers} ministerial exit${ministers === 1 ? "" : "s"} recorded.`,
    detail: ministers >= 3
      ? "Cabinet stability breaking. Watch for cascade — three or more exits historically precedes leader resignations."
      : "Watch for a named cabinet/minister-level resignation; that's the next material escalation.",
  });
  if (challengeHits.length) {
    watchpoints.push({
      level: "red",
      label: `Possible challenge signal in headlines (${challengeHits.length} hit${challengeHits.length === 1 ? "" : "s"} in 72h).`,
      detail: `Keyword matches: ${[...new Set(challengeHits.map((h) => h.keyword))].join(", ")}.`,
      examples: challengeHits.slice(0, 3),
    });
  } else {
    watchpoints.push({
      level: "info",
      label: "No formal leadership-challenge language detected in headlines (72h).",
      detail: "Keyword sweep for 'leadership bid', 'announces challenge', 'candidacy', etc.",
    });
  }
  if (Number.isFinite(marketProb) && marketProb >= 0.5) {
    watchpoints.push({
      level: "high",
      label: `Market consensus tilted toward exit (${Math.round(marketProb * 100)}%).`,
      detail: "Polymarket exit-prob crossing 50% historically tracks with material leadership erosion.",
    });
  }
  return watchpoints;
}

async function buildPressureIndex({ counts, markets, manual, news, priorHistory, escalation }) {
  const pressure = counts.resignCalls.value || 0;
  const support = counts.supporters.value || 0;
  const threshold = counts.threshold.value || 81;
  const ministers = counts.ministersOut.value || 0;
  const exitMarket = topStarmerExitMarket(markets);
  const marketProb = Number(exitMarket?.yesPrice);
  const marketProbNorm = Number.isFinite(marketProb) ? Math.max(0, Math.min(1, marketProb)) : null;
  const marketDeltas = marketDeltasFromHistory(marketProbNorm, priorHistory);
  const mover = biggestMarketMover(markets, priorHistory);

  const exitShare = Math.max(0, Math.min(1, pressure / (threshold * 1.5)));
  const supportLead = support - pressure;
  const supportDeficit = Math.max(0, Math.min(1, (40 - supportLead) / 40));
  let ministerMomentum = Math.max(0, Math.min(1, ministers / 5));
  let ministerBoost = 1;
  let ministerBoostReason = "";
  if (escalation?.pairedSenior) { ministerBoost = 1.5; ministerBoostReason = "×1.5 paired senior resignations"; }
  if (escalation?.delegationHits?.length) { ministerBoost = 2; ministerBoostReason = "×2 delegation / 1922-style language detected"; }
  ministerMomentum = Math.min(1, ministerMomentum * ministerBoost);

  const newsScore = await scoreNewsSentiment(news);
  const freshness = computeFreshness(priorHistory, { pressure, support, ministers, marketProb: marketProbNorm });
  const parts = [
    { id: "exitShare", label: "PLP exit-call share vs trigger", weight: INDEX_WEIGHTS.exitShare, normalised: exitShare, raw: `${pressure} MPs / saturates at ${Math.ceil(threshold * 1.5)} (1.5× trigger of ${threshold})`, lastChangedMinutes: freshness.pressure },
    { id: "supportDeficit", label: "Support deficit", weight: INDEX_WEIGHTS.supportDeficit, normalised: supportDeficit, raw: `lead ${supportLead}`, lastChangedMinutes: freshness.support },
    { id: "ministerMomentum", label: "Minister-exit momentum", weight: INDEX_WEIGHTS.ministerMomentum, normalised: ministerMomentum, raw: `${ministers} exits${ministerBoostReason ? ` · escalation boost ${ministerBoostReason}` : ""}`, lastChangedMinutes: freshness.ministers },
    {
      id: "marketExitProb",
      label: "Polymarket exit probability",
      weight: INDEX_WEIGHTS.marketExitProb,
      normalised: marketProbNorm,
      raw: exitMarket ? `${priceLabel(marketProb)} · ${exitMarket.question}` : "no market",
      lastChangedMinutes: freshness.marketProb,
    },
    {
      id: "newsSentiment",
      label: "News intensity × negativity",
      weight: INDEX_WEIGHTS.newsSentiment,
      normalised: newsScore.normalised,
      raw: newsScore.raw,
      lastChangedMinutes: 0,
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
    formula: "Weighted: 35% PLP exit-call share (saturates at 1.5× the contest trigger so MPs above 81 still register), 15% support deficit, 10% minister exits, 25% Polymarket exit probability, 15% news intensity × negativity over a 12h window (negation-aware lexicon ensembled with winkNLP). Each input is normalised to 0-1 before weighting; missing inputs are dropped and remaining weights re-scaled.",
    perEntitySentiment: newsScore.perEntity || {},
    components: parts,
    marketProb: marketProbNorm,
    featuredMarket: exitMarket ? {
      question: exitMarket.question,
      yesPrice: exitMarket.yesPrice,
      noPrice: exitMarket.noPrice,
      url: exitMarket.url,
      volume: exitMarket.volume,
      horizonDate: parseHorizonDate(exitMarket.question)?.toISOString() || null,
    } : null,
    marketDeltas,
    biggestMover: mover ? {
      question: mover.market.question,
      yesPrice: mover.market.yesPrice,
      url: mover.market.url,
      deltaPp: Math.round(mover.deltaPp * 10) / 10,
      direction: mover.curr > mover.prev ? "up" : "down",
    } : null,
  };
}

const SITE_URL = process.env.SITE_URL || "https://asim48-ctrl.github.io/starmer-watch";

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function writePublicFeeds(output) {
  const feedItems = [];
  const idx = output.pressureIndex;
  const headlineId = `pressure-${output.generatedAt}`;
  feedItems.push({
    id: headlineId,
    url: `${SITE_URL}/#overview`,
    title: `Pressure Index ${idx?.value ?? "?"}/100 (${idx?.band ?? "n/a"})`,
    summary: output.headline,
    publishedAt: output.generatedAt,
  });
  for (const item of (output.news || []).slice(0, 10)) {
    feedItems.push({
      id: item.url,
      url: item.url,
      title: `${item.source}: ${item.title}`,
      summary: item.title,
      publishedAt: item.publishedAt || output.generatedAt,
    });
  }

  const jsonFeed = {
    version: "https://jsonfeed.org/version/1.1",
    title: "Starmer Watch — Pressure Index",
    home_page_url: SITE_URL,
    feed_url: `${SITE_URL}/data/feed.json`,
    description: "Composite pressure index, top news, and market signals for Keir Starmer's leadership.",
    language: "en-GB",
    items: feedItems.map((it) => ({
      id: it.id,
      url: it.url,
      title: it.title,
      content_text: it.summary,
      date_published: it.publishedAt,
    })),
  };
  await writeFile(path.join(dataDir, "feed.json"), `${JSON.stringify(jsonFeed, null, 2)}\n`, "utf8");

  const rssItems = feedItems
    .map((it) => `    <item>
      <title>${escapeXml(it.title)}</title>
      <link>${escapeXml(it.url)}</link>
      <guid isPermaLink="false">${escapeXml(it.id)}</guid>
      <pubDate>${new Date(it.publishedAt || Date.now()).toUTCString()}</pubDate>
      <description>${escapeXml(it.summary)}</description>
    </item>`)
    .join("\n");
  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Starmer Watch — Pressure Index</title>
    <link>${escapeXml(SITE_URL)}</link>
    <atom:link href="${escapeXml(SITE_URL)}/data/feed.xml" rel="self" type="application/rss+xml"/>
    <description>Composite pressure index, top news, and market signals for Keir Starmer's leadership.</description>
    <language>en-GB</language>
    <lastBuildDate>${new Date(output.generatedAt).toUTCString()}</lastBuildDate>
${rssItems}
  </channel>
</rss>
`;
  await writeFile(path.join(dataDir, "feed.xml"), rss, "utf8");
}

async function readBaselines() {
  try {
    const raw = await readFile(path.join(rootDir, "data/baselines.json"), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function readAlertState() {
  try {
    const raw = await readFile(path.join(rootDir, alertStatePath), "utf8");
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

async function writeAlertState(state) {
  await writeFile(path.join(rootDir, alertStatePath), `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

async function postWebhook(url, payload) {
  if (!url) return false;
  try {
    const isSlack = url.includes("hooks.slack.com");
    const body = isSlack ? { text: payload.text } : { content: payload.text };
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": "StarmerWatch/1.0" },
      body: JSON.stringify(body),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function maybeFireAlerts({ pressureIndex, history, counts, manual }) {
  const cfg = manual.alerts || {};
  const discord = process.env.DISCORD_WEBHOOK_URL || cfg.discordWebhookUrl || "";
  const slack = process.env.SLACK_WEBHOOK_URL || cfg.slackWebhookUrl || "";
  if (!discord && !slack) return;

  const indexThreshold = Number(cfg.thresholds?.pressureIndex) || 75;
  const jumpThreshold = Number(cfg.thresholds?.marketProbJumpPp) || 5;
  const state = await readAlertState();
  const messages = [];

  const indexValue = pressureIndex.value;
  if (indexValue >= indexThreshold && (state.lastIndex || 0) < indexThreshold) {
    messages.push(`🚨 Pressure Index ${indexValue}/100 crossed ${indexThreshold} (band: ${pressureIndex.band}). ${counts.resignCalls.value} MPs calling exit vs ${counts.supporters.value} backing.`);
  }

  const currentProb = pressureIndex.marketProb;
  const lastProb = state.lastMarketProb;
  if (Number.isFinite(currentProb) && Number.isFinite(lastProb)) {
    const deltaPp = (currentProb - lastProb) * 100;
    if (Math.abs(deltaPp) >= jumpThreshold) {
      const arrow = deltaPp > 0 ? "▲" : "▼";
      messages.push(`${arrow} Polymarket Starmer-exit prob moved ${deltaPp.toFixed(1)}pp: ${(lastProb * 100).toFixed(1)}% → ${(currentProb * 100).toFixed(1)}%`);
    }
  }

  for (const text of messages) {
    if (discord) await postWebhook(discord, { text });
    if (slack) await postWebhook(slack, { text });
  }

  await writeAlertState({
    lastIndex: indexValue,
    lastMarketProb: Number.isFinite(currentProb) ? currentProb : state.lastMarketProb || null,
    lastAlertAt: messages.length ? new Date().toISOString() : state.lastAlertAt || null,
  });
}

function computeFreshness(history, current) {
  const fields = Object.keys(current);
  const out = {};
  for (const f of fields) out[f] = null;
  if (!Array.isArray(history) || history.length < 2) return out;
  const now = Date.now();
  for (const f of fields) {
    let lastChanged = null;
    for (let i = history.length - 1; i >= 0; i -= 1) {
      const v = history[i][f];
      const eq = (a, b) => {
        if (a == null || b == null) return a == b;
        if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < 1e-6;
        return a === b;
      };
      if (!eq(v, current[f])) {
        lastChanged = new Date(history[i].t).getTime();
        break;
      }
    }
    if (lastChanged != null) {
      out[f] = Math.round((now - lastChanged) / 60000);
    }
  }
  return out;
}

async function readPriorHistory() {
  try {
    const raw = await readFile(historyPath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
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
  const streetingExited = (labour.exits || []).some((e) => /Streeting/i.test(e.name || ""))
    || /Streeting\s+(?:resigns|quits|has\s+resigned|stood\s+down)/i.test(textCorpus);
  const streetingRole = streetingExited
    ? "Former Health Secretary — out of cabinet"
    : "Health Secretary and possible succession contender";

  const factions = [
    {
      id: "streeting",
      name: "Wes Streeting",
      role: streetingRole,
      pressureScore: scoreFromSignals([
        /Streeting/i.test(textCorpus),
        /meet Starmer|meeting Starmer/i.test(textCorpus),
        Boolean(healthExit),
        Boolean(pmMarket && /Wes Streeting/i.test(pmMarket.question)),
      ]),
      posture: streetingExited
        ? "Out of cabinet. Resignation reframes him as the live succession candidate — every public move now reads as positioning. Watch for an explicit leadership bid, a campaign team, and any allied MPs declaring."
        : "Operating as the live cabinet contender: visible enough to matter, cautious enough to avoid owning the first move.",
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
  if (lower.includes("mandelson") || lower.includes("epstein")) tags.push("Mandelson");
  if (!tags.length && lower.includes("starmer")) tags.push("Starmer");
  return tags;
}

function classifyExit(role) {
  if (/health/i.test(role)) return "health department";
  if (/PPS/i.test(role)) return "parliamentary aide";
  if (/minister/i.test(role)) return "ministerial exit";
  return "pressure signal";
}

async function throttle() {
  const since = Date.now() - lastFetchAt;
  if (since < HTTP_THROTTLE_MS) {
    await new Promise((r) => setTimeout(r, HTTP_THROTTLE_MS - since));
  }
  lastFetchAt = Date.now();
}

async function loadHttpCache() {
  httpCache = {};
}

async function saveHttpCache() {}

async function fetchWithCache(url, headersExtra = {}) {
  await throttle();
  const cached = httpCache[url];
  const headers = {
    "user-agent": "Mozilla/5.0 (compatible; StarmerWatch/1.0; +https://github.com/asim48-ctrl/starmer-watch)",
    accept: "text/html,application/rss+xml,application/xml,text/xml,application/json,*/*",
    ...headersExtra,
  };
  if (cached?.etag) headers["if-none-match"] = cached.etag;
  if (cached?.lastModified) headers["if-modified-since"] = cached.lastModified;

  const response = await fetch(url, { headers });
  if (response.status === 304 && cached?.body !== undefined) {
    return { body: cached.body, fromCache: true, status: 304 };
  }
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body = await response.text();
  const etag = response.headers.get("etag");
  const lastModified = response.headers.get("last-modified");
  if (etag || lastModified) {
    httpCache[url] = { etag, lastModified, body };
  } else {
    delete httpCache[url];
  }
  return { body, fromCache: false, status: response.status };
}

async function fetchText(url) {
  return (await fetchWithCache(url)).body;
}

async function fetchJson(url, headersExtra = {}) {
  const { body } = await fetchWithCache(url, { accept: "application/json", ...headersExtra });
  return JSON.parse(body);
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
