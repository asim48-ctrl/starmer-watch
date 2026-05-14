#!/usr/bin/env node
// Hourly heartbeat: validate the live dashboard, auto-trigger the refresh
// workflow if data is stale, open a GitHub Issue if anything is broken.

const SITE_URL = process.env.SITE_URL || "https://asim48-ctrl.github.io/starmer-watch";
const REPO = process.env.GITHUB_REPOSITORY || "asim48-ctrl/starmer-watch";
const STATE_HOURS_STALE = Number(process.env.STALE_HOURS) || 1; // open issue if data >1h old
const FAIL_RATIO_THRESHOLD = 0.2;

const issues = [];

function note(message) {
  console.log(`heartbeat: ${message}`);
}

async function fetchJson(url) {
  const r = await fetch(url, { headers: { "user-agent": "StarmerWatchHeartbeat/1.0" } });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return r.json();
}

async function postIssue(title, body) {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) {
    note("No GH_TOKEN — would have opened issue: " + title);
    return;
  }
  const r = await fetch(`https://api.github.com/repos/${REPO}/issues`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "content-type": "application/json",
      "user-agent": "StarmerWatchHeartbeat/1.0",
    },
    body: JSON.stringify({ title, body, labels: ["heartbeat", "auto"] }),
  });
  note(`issue API ${r.status}`);
}

async function dispatchRefresh() {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) { note("No GH_TOKEN — skipping dispatch"); return; }
  const r = await fetch(
    `https://api.github.com/repos/${REPO}/actions/workflows/starmer-watch-refresh.yml/dispatches`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
        "content-type": "application/json",
        "user-agent": "StarmerWatchHeartbeat/1.0",
      },
      body: JSON.stringify({ ref: "main" }),
    },
  );
  note(`dispatch refresh ${r.status}`);
}

async function main() {
  let data;
  try {
    data = await fetchJson(`${SITE_URL}/data/latest.json`);
  } catch (error) {
    issues.push({ title: "Heartbeat: live latest.json unreachable", body: `Could not fetch \`${SITE_URL}/data/latest.json\`: ${error.message}` });
    for (const it of issues) await postIssue(it.title, it.body);
    process.exitCode = 1;
    return;
  }

  const generatedAt = new Date(data.generatedAt).getTime();
  const ageMin = Math.round((Date.now() - generatedAt) / 60000);
  note(`generatedAt ${data.generatedAt} (${ageMin}m ago)`);

  if (ageMin > STATE_HOURS_STALE * 60) {
    note(`Data is ${ageMin}m old — triggering refresh dispatch.`);
    await dispatchRefresh();
    issues.push({
      title: `Heartbeat: data stale (${ageMin}m old)`,
      body: `latest.json generatedAt is **${data.generatedAt}** (~${ageMin} minutes ago). Heartbeat triggered a manual refresh dispatch. If this issue keeps reappearing, the GH Actions refresh workflow is failing — check Actions tab.`,
    });
  }

  const sources = Array.isArray(data.sources) ? data.sources : [];
  const failed = sources.filter((s) => !s.ok);
  const failRatio = sources.length ? failed.length / sources.length : 0;
  note(`sources ${sources.length - failed.length}/${sources.length} ok (fail ratio ${failRatio.toFixed(2)})`);
  if (failRatio > FAIL_RATIO_THRESHOLD && failed.length >= 3) {
    issues.push({
      title: `Heartbeat: ${failed.length} sources failing (${Math.round(failRatio * 100)}%)`,
      body: `Failed sources:\n\n${failed.map((s) => `- **${s.name}** — ${s.note}`).join("\n")}\n\nCheck rate limits or upstream URL changes.`,
    });
  }

  const stage = data.escalation?.stage;
  if (stage >= 5) {
    issues.push({
      title: `Heartbeat: escalation stage ${stage} (${data.escalation.stageLabel})`,
      body: `Pressure Index ${data.pressureIndex?.value}/100. Stage ${stage}: ${data.escalation.stageLabel}.\n\nHigh-signal news:\n\n${(data.highSignalNews || []).slice(0, 5).map((n) => `- [${n.signalTag}] ${n.title}`).join("\n") || "(none)"}\n\nFlagging for human review — this is high-information territory.`,
    });
  }

  const markets = data.markets || [];
  if (markets.length < 5) {
    issues.push({
      title: `Heartbeat: only ${markets.length} Polymarket markets returned`,
      body: "Expected ≥5 markets. Polymarket schema or query may have changed. Check collectPolymarket in refresh-data.mjs.",
    });
  }

  for (const it of issues) await postIssue(it.title, it.body);

  const status = `Heartbeat status: data ${ageMin}m old · sources ${sources.length - failed.length}/${sources.length} · escalation stage ${stage ?? "?"} · ${issues.length} issue${issues.length === 1 ? "" : "s"} raised`;
  console.log(status);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
