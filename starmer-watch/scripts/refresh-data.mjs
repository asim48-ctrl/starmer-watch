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
  const gdeltNews =
    process.env.ENABLE_GDELT === "1" ? await collectGdeltNews(sourceHealth) : noteGdeltDisabled(sourceHealth);
  const markets = await collectPolymarket(sourceHealth);

  const news = mergeNews([...rssNews, ...gdeltNews, ...bskyNews, ...guardianNews, ...redditNews]);
  const counts = buildCounts(labour, manual);
  const pressure = buildPressure(counts, labour);
  const resignations = buildResignations(labour, news);
  const factions = buildFactions({ counts, labour, news, markets, resignations, manual });
  const proxyGroups = buildProxyGroups(manual, labour);
  const pressureIndex = buildPressureIndex({ counts, markets, manual, news });
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
    sources: sourceHealth.concat(manual.sourceNotes || []),
  };

  await writeFile(latestPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
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

function storyKey(title) {
  const words = String(title || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !STOP_WORDS.has(w))
    .slice(0, 5);
  return words.join("-");
}

function dedupStories(items) {
  // Cluster by storyKey; keep the earliest item per cluster, track count of duplicates.
  const map = new Map();
  for (const item of items) {
    const key = storyKey(item.title) || normalizeUrl(item.url);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...item, _cluster: 1 });
    } else {
      existing._cluster += 1;
      if (new Date(item.publishedAt || 0) < new Date(existing.publishedAt || 0)) {
        const cluster = existing._cluster;
        map.set(key, { ...item, _cluster: cluster });
      }
    }
  }
  return Array.from(map.values());
}

function scoreNewsSentiment(news) {
  const now = Date.now();
  const recent = dedupStories((news || []).filter((item) => {
    const t = new Date(item.publishedAt || 0).getTime();
    return Number.isFinite(t) && now - t <= 48 * 3600 * 1000;
  }));
  if (!recent.length) {
    return { normalised: null, raw: "no recent items", count: 0, avg: 0, perEntity: {} };
  }

  let net = 0;
  let scored = 0;
  const perEntity = {};
  for (const id of Object.keys(ENTITIES)) perEntity[id] = { net: 0, n: 0 };

  for (const item of recent) {
    const text = String(item.title || "").toLowerCase();
    const { pos, neg } = tokenSentiment(text);
    if (pos + neg === 0) continue;
    const score = (neg - pos) / (pos + neg);
    net += score;
    scored += 1;
    for (const [id, aliases] of Object.entries(ENTITIES)) {
      if (aliases.some((alias) => text.includes(alias))) {
        perEntity[id].net += score;
        perEntity[id].n += 1;
      }
    }
  }
  const avg = scored ? net / scored : 0;
  const intensity = Math.min(1, recent.length / 20);
  const negativity = Math.max(0, Math.min(1, (avg + 1) / 2));
  const normalised = intensity * negativity;

  const perEntityOut = {};
  for (const [id, v] of Object.entries(perEntity)) {
    perEntityOut[id] = v.n
      ? { mentions: v.n, avg: Math.round((v.net / v.n) * 100) / 100 }
      : { mentions: 0, avg: 0 };
  }

  return {
    normalised,
    raw: `${recent.length} unique stories (48h, deduped across sources), ${scored} sentiment-scored, avg ${avg.toFixed(2)}`,
    count: recent.length,
    avg,
    perEntity: perEntityOut,
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
    formula: "Weighted: 35% PLP exit-call share, 15% support deficit, 10% minister exits, 25% Polymarket exit probability, 15% news intensity × negativity. Sentiment uses a negation-aware lexicon (terms preceded within 3 tokens by 'not'/'denies'/etc. are flipped). Each input is normalised to 0-1 before weighting; missing inputs are dropped and remaining weights re-scaled.",
    perEntitySentiment: newsScore.perEntity || {},
    components: parts,
    marketProb: marketProbNorm,
  };
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
