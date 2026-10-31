#!/usr/bin/osascript -l JavaScript
// ============================================
// SIMKL RADAR — Mac core (JXA, ships with macOS, no installs)
// Shared by the Übersicht desktop widget and the SwiftBar menu bar plugin.
//
//   osascript -l JavaScript ~/.simkl-radar/simkl.js login    link your Simkl account (once)
//   osascript -l JavaScript ~/.simkl-radar/simkl.js data     print watch data as JSON
//   osascript -l JavaScript ~/.simkl-radar/simkl.js logout   forget the token
//
// Token + last good data live in ~/.simkl-radar/ (token is chmod 600).
// ============================================

const CLIENT_ID = "70a1d2b1c1b5c2ed32bd9bbd498b5cc8e00d2a0d0ddf0f29849472492b0889ce";
const API = "https://api.simkl.com";

// ---------- pure helpers (also unit-tested in Node) ----------
function nextLabel(ne, kind, watched) {
  if (kind === "movie") return null;
  if (typeof ne === "string" && ne) return ne.replace(/S0*(\d+)E0*(\d+)/i, "S$1E$2").toUpperCase();
  if (ne && ne.episode != null) return (ne.season != null ? "S" + ne.season + "E" : "E") + ne.episode;
  return watched != null ? "E" + (watched + 1) : null;
}

function normalize(lists) {
  const out = [];
  const add = (obj, kind, finished) => {
    for (const it of (obj && (obj.shows || obj.anime || obj.movies)) || []) {
      const s = it.show || it.anime || it.movie || {};
      const total = kind === "movie" ? null : (s.total_episodes_count || it.total_episodes_count || null);
      const watched = kind === "movie" ? null
        : (finished ? total : (it.watched_episodes_count != null ? it.watched_episodes_count : null));
      out.push({
        kind, finished,
        title: s.title || "Untitled",
        year: s.year || null,
        poster: s.poster || null,
        fanart: s.fanart || null,
        runtime: s.runtime || null,
        total, watched,
        next: finished ? null : nextLabel(it.next_to_watch || it.next_episode || null, kind, watched),
        last: it.last_watched_at || null,
        ids: s.ids || {},
      });
    }
  };
  add(lists.moviesDone, "movie", true);
  add(lists.showsWatching, "tv", false);
  add(lists.showsDone, "tv", true);
  add(lists.animeWatching, "anime", false);
  add(lists.animeDone, "anime", true);
  for (const it of Array.isArray(lists.playback) ? lists.playback : []) {   // movie paused mid-way
    const m = it.movie; if (!m) continue;
    const pct = it.progress != null ? it.progress : 0;
    out.push({ kind: "movie", finished: false, title: m.title || "Untitled", year: m.year || null,
      poster: m.poster || null, fanart: m.fanart || null, runtime: m.runtime || null,
      total: 100, watched: Math.round(pct), next: null, last: it.paused_at || null, ids: m.ids || {} });
  }
  const seen = {};
  return out
    .filter((x) => x.last)
    .sort((a, b) => Date.parse(b.last) - Date.parse(a.last))
    .filter((x) => { const k = x.kind + ":" + x.title.toLowerCase(); if (seen[k]) return false; seen[k] = true; return true; });
}

// ---------- macOS side ----------
function sh(cmd) { return Application.currentApplication().doShellScript(cmd); }
const q = (s) => "'" + String(s).replace(/'/g, "'\\''") + "'";
function home() { ObjC.import("Foundation"); return $.NSHomeDirectory().js; }
function readText(p) { try { return sh("cat " + q(p) + " 2>/dev/null"); } catch (e) { return ""; } }
function writeText(p, text, secret) {
  sh("mkdir -p " + q(p.replace(/\/[^/]+$/, "")) + " && printf %s " + q(text) + " > " + q(p) + (secret ? " && chmod 600 " + q(p) : ""));
}
function getJSON(url, token) {
  const hdr = "-H " + q("simkl-api-key: " + CLIENT_ID) + (token ? " -H " + q("Authorization: Bearer " + token) : "");
  const sep = url.indexOf("?") >= 0 ? "&" : "?";
  const body = sh("curl -sS -m 20 -H 'Content-Type: application/json' " + hdr + " " + q(url + sep + "_=" + Date.now()));
  return JSON.parse(body);
}

function login(dir) {
  const pin = getJSON(API + "/oauth/pin?client_id=" + CLIENT_ID + "&redirect=urn:ietf:wg:oauth:2.0:oob");
  const app = Application.currentApplication(); app.includeStandardAdditions = true;
  app.setTheClipboardTo(pin.user_code);
  console.log("Your Simkl code: " + pin.user_code + "  (copied to clipboard)");
  console.log("Paste it on the page that just opened and press CONNECT. Waiting…");
  sh("open " + q(pin.verification_url || "https://simkl.com/pin"));
  for (let i = 0; i < 120; i++) {                       // ~10 minutes
    delay(5);
    const r = getJSON(API + "/oauth/pin/" + pin.user_code + "?client_id=" + CLIENT_ID);
    if (r && r.access_token) { writeText(dir + "/token", r.access_token, true); return "Linked ✓  Widgets will fill in on their next refresh."; }
  }
  return "Timed out. Run login again.";
}

function data(dir) {
  const token = readText(dir + "/token").trim();
  if (!token) return JSON.stringify({ error: "not_linked" });
  try {
    const g = (path, fb) => { try { return getJSON(API + path, token); } catch (e) { return fb; } };
    const items = normalize({
      showsWatching: g("/sync/all-items/shows/watching?extended=full", {}),
      showsDone:     g("/sync/all-items/shows/completed?extended=full", {}),
      animeWatching: g("/sync/all-items/anime/watching?extended=full", {}),
      animeDone:     g("/sync/all-items/anime/completed?extended=full", {}),
      moviesDone:    g("/sync/all-items/movies/completed?extended=full", {}),
      playback:      g("/sync/playback/movies?extended=full", []),
    }).slice(0, 12);
    if (!items.length) throw new Error("empty");
    const json = JSON.stringify({ updated: new Date().toISOString(), items });
    writeText(dir + "/cache.json", json, false);
    return json;
  } catch (e) {                                          // offline / API hiccup → last good data
    const cached = readText(dir + "/cache.json");
    if (cached) { const c = JSON.parse(cached); c.stale = true; return JSON.stringify(c); }
    return JSON.stringify({ error: "fetch_failed" });
  }
}

function run(argv) {
  const dir = home() + "/.simkl-radar";
  const cmd = argv[0] || "data";
  if (cmd === "login") return login(dir);
  if (cmd === "logout") { sh("rm -f " + q(dir + "/token") + " " + q(dir + "/cache.json")); return "Logged out."; }
  return data(dir);
}

if (typeof module !== "undefined") module.exports = { normalize, nextLabel };
