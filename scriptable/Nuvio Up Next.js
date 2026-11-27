// ============================================
// NUVIO UP NEXT: iPhone medium widget (Scriptable)
// Your latest show or movie from Nuvio: textless backdrop, official
// title logo, episode + time left, and a progress bar. When you've
// finished an episode it flips to "Up next" with the season's episode
// ticks, or a countdown if the next episode isn't out yet.
//
// SETUP (one time):
//  1. Paste into Scriptable, name it "Nuvio Up Next".
//  2. Tap ▶ to run it. Sign in with your Nuvio email + password.
//     Your password goes straight to Nuvio and is NOT saved. Only a
//     login pass is kept (in Scriptable's iCloud folder, so the Mac
//     widgets can use the same login later).
//  3. Pick your Nuvio profile.
//  4. Add a MEDIUM Scriptable widget → Script = Nuvio Up Next.
// Run it again any time for: preview, switch profile, sign out.
// Tap the widget = opens the title in Nuvio.
// ============================================

// Free TMDB key (themoviedb.org → Settings → API): logos, backdrops, episode names.
const TMDB_KEY = "";
const ACCENT = "#ff4b3e";

// Nuvio's official public API (nuvio.tv/docs). The publishable key is published there for third-party apps.
const NUVIO = "https://api.nuvio.tv";
const NUVIO_KEY = "sb_publishable_1Clq8rlTVACkdcZuqr6_AD__xUUC_EN";
const SESSION_FILE = "nuvio-session.json";   // shared by all Nuvio widgets
const CACHE_FILE = "nuvio-upnext-cache.json";
const SCRIPT_NAME = "Nuvio Up Next";

const W = 338, H = 158;                      // medium widget, points
const BG = "#0b0809";

// ---------- storage ----------
const local = FileManager.local();
let cloud = null;
try { cloud = FileManager.iCloud(); } catch (e) { cloud = null; }
const pathIn = (fm, name) => fm.joinPath(fm.documentsDirectory(), name);

// The login is kept in three places: Scriptable's Keychain (main copy on this device), a local
// file, and Scriptable's iCloud folder (so the Mac's Scriptable can use it). Reads take the NEWEST
// valid copy; a broken or empty copy is skipped instead of ending the search.
const KC_KEY = "nuvio-session";
const valid = (o) => (o && typeof o === "object" && o.refresh_token ? o : null);
const parse = (t) => { try { return valid(JSON.parse(t)); } catch (e) { return null; } };
async function readSession() {
  const found = [];
  try { if (Keychain.contains(KC_KEY)) found.push(parse(Keychain.get(KC_KEY))); } catch (e) {}
  for (const fm of [local, cloud]) {
    if (!fm) continue;
    try {
      const p = pathIn(fm, SESSION_FILE);
      if (!fm.fileExists(p)) continue;
      if (fm === cloud) { try { await fm.downloadFileFromiCloud(p); } catch (e) {} }
      found.push(parse(fm.readString(p)));
    } catch (e) {}
  }
  const ok = found.filter(Boolean).sort((a, b) => (b.saved_at || 0) - (a.saved_at || 0));
  return ok[0] || null;
}
function writeSession(s) {
  s.saved_at = Date.now();
  const txt = JSON.stringify(s); let ok = 0; const errs = [];
  try { Keychain.set(KC_KEY, txt); ok++; } catch (e) { errs.push("Keychain: " + (e.message || e)); }
  for (const fm of [local, cloud]) { if (!fm) continue; try { fm.writeString(pathIn(fm, SESSION_FILE), txt); ok++; } catch (e) { errs.push((fm === cloud ? "iCloud: " : "phone: ") + (e.message || e)); } }
  return { ok, errs };
}
function clearSession() {
  try { if (Keychain.contains(KC_KEY)) Keychain.remove(KC_KEY); } catch (e) {}
  for (const fm of [local, cloud]) { if (!fm) continue; try { const p = pathIn(fm, SESSION_FILE); if (fm.fileExists(p)) fm.remove(p); } catch (e) {} }
}
function readLocal(name) { try { const p = pathIn(local, name); return local.fileExists(p) ? JSON.parse(local.readString(p)) : null; } catch (e) { return null; } }
function writeLocal(name, obj) { try { local.writeString(pathIn(local, name), JSON.stringify(obj)); } catch (e) {} }

// ---------- Nuvio API ----------
async function nuvioReq(path, body, token, method = "POST") {
  const r = new Request(NUVIO + path);
  r.method = method;
  r.headers = Object.assign({ apikey: NUVIO_KEY, "Content-Type": "application/json" }, token ? { Authorization: "Bearer " + token } : {});
  if (body !== undefined) r.body = JSON.stringify(body);
  let j;
  try { j = await r.loadJSON(); } catch (e) { const err = new Error("No answer from Nuvio (" + path.replace(/\?.*$/, "").split("/").pop() + ")"); err.offline = true; throw err; }
  const code = r.response && r.response.statusCode;
  const what = path.replace(/^.*\/(rpc\/)?/, "").replace(/\?.*$/, "");
  if (code === 401 || (j && (j.error === "invalid_grant" || j.error_code === "refresh_token_not_found" || j.error_code === "refresh_token_already_used"))) {
    const err = new Error("auth"); err.auth = true; err.detail = `${what}: ${code} ${(j && (j.message || j.msg)) || ""}`; throw err;
  }
  if (code && code >= 400) { const err = new Error(`${what}: ${code} ${(j && (j.msg || j.message || j.error_description)) || ""}`.trim()); err.status = code; throw err; }
  return j;
}

async function signIn(email, password) {
  const j = await nuvioReq("/auth/v1/token?grant_type=password", { email, password });
  if (!j || !j.access_token) throw new Error((j && (j.error_description || j.msg)) || "Sign-in failed");
  return { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Date.now() + (j.expires_in || 3600) * 1000 };
}

// Access tokens last an hour. Refresh only when close to expiry, and always save the NEW refresh
// token: Nuvio rotates it on every refresh. Phone and Mac share one session file in iCloud.
async function liveSession() {
  const s = await readSession();
  if (!s || !s.refresh_token) { const e = new Error("auth"); e.auth = true; e.none = true; throw e; }
  if (s.access_token && s.expires_at - Date.now() > 5 * 60 * 1000) return s;
  let j;
  try { j = await nuvioReq("/auth/v1/token?grant_type=refresh_token", { refresh_token: s.refresh_token }); }
  catch (e) { if (e.status === 400) e.auth = true; throw e; }   // pass revoked/used → sign in again
  if (!j || !j.access_token) { const e = new Error("auth"); e.auth = true; throw e; }
  Object.assign(s, { access_token: j.access_token, refresh_token: j.refresh_token || s.refresh_token, expires_at: Date.now() + (j.expires_in || 3600) * 1000 });
  writeSession(s);
  return s;
}

// ---------- TMDB ----------
async function tmdb(path, ttlHours = 12) {
  if (!TMDB_KEY) return null;
  const cache = readLocal("nuvio-tmdb-cache.json") || {};
  const hit = cache[path];
  if (hit && Date.now() - hit.t < ttlHours * 3600e3) return hit.d;
  try {
    const sep = path.includes("?") ? "&" : "?";
    const d = await new Request(`https://api.themoviedb.org/3${path}${sep}api_key=${TMDB_KEY}`).loadJSON();
    if (d && !d.status_code) {
      cache[path] = { t: Date.now(), d };
      for (const k of Object.keys(cache)) if (Date.now() - cache[k].t > 7 * 86400e3) delete cache[k];
      writeLocal("nuvio-tmdb-cache.json", cache);
      return d;
    }
  } catch (e) {}
  return hit ? hit.d : null;
}
const tmdbImg = (size, p) => (p ? `https://image.tmdb.org/t/p/${size}${p}` : null);

// content_id is usually "tmdb:1396"; Stremio-style ids can be "tt0944947".
async function resolveTmdb(contentId, type) {
  const kind = type === "movie" ? "movie" : "tv";
  let m = String(contentId).match(/^tmdb:(\d+)/);
  if (m) return { kind, id: m[1] };
  m = String(contentId).match(/(tt\d+)/);
  if (m) {
    const f = await tmdb(`/find/${m[1]}?external_source=imdb_id`, 24 * 30);
    const r = f && (kind === "movie" ? f.movie_results : f.tv_results);
    if (r && r[0]) return { kind, id: String(r[0].id) };
  }
  return null;
}

function pickLogo(images) {
  const ls = (images && images.logos) || [];
  const en = ls.filter((l) => l.iso_639_1 === "en" && /\.png$/.test(l.file_path));
  const any = en.length ? en : ls.filter((l) => /\.png$/.test(l.file_path));
  any.sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0));
  return any[0] || null;
}
function pickBackdrop(images, fallback) {
  const bs = ((images && images.backdrops) || []).filter((b) => b.iso_639_1 == null);
  bs.sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0));
  return (bs[0] && bs[0].file_path) || fallback || null;
}

// ---------- pull + tidy Nuvio data ----------
const toMs = (v) => { if (v == null) return 0; if (typeof v === "string") { const n = Number(v); v = isNaN(n) ? Date.parse(v) : n; } return v > 0 && v < 1e12 ? v * 1000 : v || 0; };
const num = (v) => (v == null || v === "" ? null : Number(v));
async function pullData(s) {
  const pid = s.profile || 1;
  let progress = await nuvioReq("/rest/v1/rpc/sync_pull_watch_progress", { p_profile_id: pid, p_limit: 40 }, s.access_token);
  let history = await nuvioReq("/rest/v1/rpc/sync_pull_watched_items", { p_profile_id: pid, p_page: 1, p_page_size: 300 }, s.access_token);
  progress = (Array.isArray(progress) ? progress : []).map((p) => {
    let pos = Number(p.position) || 0, dur = Number(p.duration) || 0;
    if (dur > 0 && dur < 20000) { pos *= 1000; dur *= 1000; }        // seconds, not ms
    return Object.assign({}, p, { position: pos, duration: dur, season: num(p.season), episode: num(p.episode), last_watched: toMs(p.last_watched || p.updated_at) });
  });
  history = (Array.isArray(history) ? history : []).map((h) => Object.assign({}, h, { season: num(h.season), episode: num(h.episode), watched_at: toMs(h.watched_at || h.created_at) }));
  history.sort((a, b) => b.watched_at - a.watched_at);
  return { progress, history };
}

// ---------- build the card's data ----------
async function loadCard(s) {
  const pid = s.profile || 1;
  const { progress, history } = await pullData(s);

  // Pick the hero: newest progress row that's either unfinished, or a finished episode (→ "up next").
  // A finished movie is skipped in favour of the next thing, falling back to history.
  const done = (p) => p.duration > 0 && p.position / p.duration >= 0.9;
  const rows = progress.slice().sort((a, b) => b.last_watched - a.last_watched);
  let hero = rows.find((p) => !(p.content_type === "movie" && done(p)));
  if (!hero && history[0]) {
    const h = history[0];
    hero = { content_id: h.content_id, content_type: h.content_type, season: h.season, episode: h.episode, position: 1, duration: 1, last_watched: h.watched_at, title: h.title };
  }
  if (!hero) return null;

  const card = {
    type: hero.content_type === "movie" ? "movie" : "series",
    contentId: hero.content_id,
    title: hero.title || (history.find((h) => h.content_id === hero.content_id) || {}).title || "",
    season: hero.season, episode: hero.episode,
    position: hero.position, duration: hero.duration,
    when: hero.last_watched,
    finished: done(hero),
  };

  const ref = await resolveTmdb(hero.content_id, hero.content_type);
  if (ref) {
    card.tmdb = ref.id;
    const d = await tmdb(`/${ref.kind}/${ref.id}?append_to_response=images&include_image_language=en,null`);
    if (d) {
      card.title = d.name || d.title || card.title;
      card.year = (d.first_air_date || d.release_date || "").slice(0, 4);
      card.rating = d.vote_average ? Math.round(d.vote_average * 10) / 10 : null;
      card.genre = (d.genres && d.genres[0] && d.genres[0].name) || null;
      card.runtime = d.runtime || (d.episode_run_time && d.episode_run_time[0]) || null;
      const logo = pickLogo(d.images);
      card.logo = logo ? tmdbImg("w500", logo.file_path) : null;
      card.logoRatio = logo && logo.aspect_ratio ? logo.aspect_ratio : 3;
      card.backdrop = tmdbImg("w780", pickBackdrop(d.images, d.backdrop_path));
      card.seasons = d.number_of_seasons || null;
      card.nextAir = d.next_episode_to_air || null;
    }
    if (card.type === "series" && card.season != null) {
      // Where are we: this episode (resume) or the next one (up next)?
      let season = card.season, ep = card.episode;
      let sd = await tmdb(`/tv/${ref.id}/season/${season}`, 6);
      if (card.finished) {
        const eps = (sd && sd.episodes) || [];
        if (eps.length && ep >= eps[eps.length - 1].episode_number && card.seasons && season < card.seasons) {
          season += 1; ep = 1; sd = await tmdb(`/tv/${ref.id}/season/${season}`, 6);
        } else ep += 1;
      }
      card.showSeason = season; card.showEpisode = ep;
      const eps = (sd && sd.episodes) || [];
      card.seasonEpisodes = eps.length || null;
      const e = eps.find((x) => x.episode_number === ep);
      if (e) {
        card.epName = e.name;
        card.airDate = e.air_date || null;
        if (card.finished && e.still_path) card.backdrop = tmdbImg("w780", e.still_path) || card.backdrop;
      }
      // Episodes of this season already watched (history + finished progress), for the tick bar.
      const seen = new Set();
      for (const h of history) if (h.content_id === hero.content_id && h.season === season) seen.add(h.episode);
      for (const p of progress) if (p.content_id === hero.content_id && p.season === season && done(p)) seen.add(p.episode);
      card.seen = [...seen];
    }
  } else if (card.type === "series") {
    card.showSeason = card.season; card.showEpisode = card.finished ? card.episode + 1 : card.episode;
  }
  return card;
}

// ---------- drawing helpers ----------
const col = (hex, a = 1) => new Color(hex, a);
const estW = (t, fs, k = 0.56) => t.length * fs * k;
function fit(t, fs, maxW, k) { if (estW(t, fs, k) <= maxW) return t; let s = t; while (s.length > 1 && estW(s + "…", fs, k) > maxW) s = s.slice(0, -1); return s.trim() + "…"; }
function text(ctx, t, x, y, w, font, color, align = "left") {
  ctx.setFont(font); ctx.setTextColor(color);
  if (align === "right") ctx.setTextAlignedRight(); else if (align === "center") ctx.setTextAlignedCenter(); else ctx.setTextAlignedLeft();
  ctx.drawTextInRect(t, new Rect(x, y, w, 34));
}
function rrect(ctx, x, y, w, h, r, color) { const p = new Path(); p.addRoundedRect(new Rect(x, y, w, h), r, r); ctx.addPath(p); ctx.setFillColor(color); ctx.fillPath(); }
async function loadImage(url) { if (!url) return null; try { return await new Request(url).loadImage(); } catch (e) { return null; } }
function cover(ctx, img, x, y, w, h, focusY = 0.35) {
  const s = Math.max(w / img.size.width, h / img.size.height);
  const iw = img.size.width * s, ih = img.size.height * s;
  ctx.drawImageInRect(img, new Rect(x + (w - iw) / 2, y + (h - ih) * focusY, iw, ih));
}
function fade(ctx, x0, x1, fromA, toA, hex) {   // horizontal fade in 1pt strips (no overlap = no banding)
  for (let x = x0; x < x1; x++) {
    const t = (x - x0) / (x1 - x0); const a = fromA + (toA - fromA) * (t * t * (3 - 2 * t));
    ctx.setFillColor(col(hex, a)); ctx.fillRect(new Rect(x, 0, 1, H));
  }
}
function vfade(ctx, y0, y1, fromA, toA, hex, x0 = 0) {
  for (let y = y0; y < y1; y++) { const t = (y - y0) / (y1 - y0); ctx.setFillColor(col(hex, fromA + (toA - fromA) * t)); ctx.fillRect(new Rect(x0, y, W - x0, 1)); }
}
const mins = (ms) => Math.max(1, Math.round(ms / 60000));
function hm(m) { return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m` : `${m} min`; }
function ago(ms) {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 2) return "now"; if (m < 60) return m + "m ago";
  const h = Math.round(m / 60); if (h < 24) return h + "h ago";
  const d = Math.round(h / 24); return d === 1 ? "yesterday" : d + "d ago";
}
function daysUntil(dateStr) {
  if (!dateStr) return null;
  const t = new Date(dateStr + "T00:00:00").getTime(); const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((t - today.getTime()) / 86400e3);
}

// ---------- the card ----------
async function drawCard(c) {
  const ctx = new DrawContext();
  ctx.size = new Size(W, H); ctx.opaque = true; ctx.respectScreenScale = true;
  ctx.setFillColor(col(BG)); ctx.fillRect(new Rect(0, 0, W, H));

  // Backdrop: right ~70%, fading into the dark left column.
  const ART_X = 98;
  const bd = await loadImage(c.backdrop);
  if (bd) {
    cover(ctx, bd, ART_X, 0, W - ART_X, H, 0.3);
    ctx.setFillColor(col(BG)); ctx.fillRect(new Rect(0, 0, ART_X, H));   // no clipping in Scriptable: mask the spill
    fade(ctx, ART_X, ART_X + 150, 1, 0, BG);
    for (let y = 0; y < 34; y++) { ctx.setFillColor(col(BG, 0.55 * (1 - y / 34))); ctx.fillRect(new Rect(ART_X, y, W - ART_X, 1)); }
    vfade(ctx, Math.round(H * 0.45), H, 0, 0.85, BG, ART_X);
    ctx.setFillColor(col(BG, 0.12)); ctx.fillRect(new Rect(ART_X, 0, W - ART_X, H));
  }

  const X = 16, TW = 214;
  const upNext = c.type === "series" && c.finished;
  const d = upNext ? daysUntil(c.airDate) : null;
  const notOut = upNext && d != null && d > 0;

  // Kicker
  rrect(ctx, X, 17, 6, 6, 3, col(ACCENT));
  const kick = c.type === "movie" ? "CONTINUE · MOVIE" : notOut ? "NEW EPISODE SOON" : upNext ? "UP NEXT" : "CONTINUE WATCHING";
  text(ctx, kick, X + 11, 14, 160, Font.boldSystemFont(9), col("#ffffff", 0.72));
  text(ctx, ago(c.when), W - 16 - 80, 14, 80, Font.mediumSystemFont(9), col("#ffffff", 0.5), "right");

  // Title: official logo, else condensed title text.
  let y = 32;
  const logo = await loadImage(c.logo);
  if (logo) {
    const r = logo.size.width / logo.size.height;
    let lh = 42, lw = lh * r;
    if (lw > 170) { lw = 170; lh = lw / r; }
    ctx.drawImageInRect(logo, new Rect(X, y + (42 - lh) / 2, lw, lh));
    y += 50;
  } else {
    const t = (c.title || "Untitled").toUpperCase();
    const fs = estW(t, 28, 0.42) > 190 ? 22 : 28;
    text(ctx, fit(t, fs, 196, 0.42), X, y + (28 - fs), 220, new Font("Futura-CondensedExtraBold", fs), col("#ffffff"));
    y += 38;
  }

  // Sub-line: episode + name, or movie facts.
  let sub;
  if (c.type === "series") {
    const se = c.showSeason != null ? `S${c.showSeason} · E${c.showEpisode}` : "";
    sub = se + (c.epName ? `  ${c.epName}` : "");
  } else {
    const parts = [c.year, c.runtime ? hm(c.runtime) : null, c.rating ? `★ ${c.rating}` : null, c.genre].filter(Boolean);
    while (parts.length > 1 && estW(parts.join("  ·  "), 11, 0.55) > TW - 6) parts.pop();   // drop facts, don't cut words
    sub = parts.join("  ·  ");
  }
  text(ctx, fit(sub, 11, TW - 6, 0.55), X, y, TW + 20, Font.semiboldSystemFont(11), col("#ffffff", 0.88));

  // Bottom: progress bar (resume) or episode ticks (up next).
  const BY = H - 22, BW = 200;
  if (!upNext) {
    const pct = c.duration > 0 ? Math.min(1, c.position / c.duration) : 0;
    const left = c.duration > 0 ? mins(c.duration - c.position) : null;
    text(ctx, `${Math.round(pct * 100)}%`, X, BY - 17, 60, Font.heavySystemFont(11), col("#ffffff"));
    if (left) text(ctx, `${hm(left)} left`, X + BW - 100, BY - 16, 100, Font.mediumSystemFont(10), col("#ffffff", 0.6), "right");
    rrect(ctx, X, BY, BW, 4, 2, col("#ffffff", 0.18));
    if (pct > 0) rrect(ctx, X, BY, Math.max(4, BW * pct), 4, 2, col(ACCENT));
  } else {
    const n = c.seasonEpisodes && c.seasonEpisodes <= 30 ? c.seasonEpisodes : null;
    const label = notOut ? `E${c.showEpisode} in ${d} day${d === 1 ? "" : "s"}` : n ? `${(c.seen || []).length} of ${n} watched` : "Ready to watch";
    text(ctx, label, X, BY - 17, 150, Font.heavySystemFont(11), col("#ffffff"));
    if (n) text(ctx, `S${c.showSeason}`, X + BW - 60, BY - 16, 60, Font.mediumSystemFont(10), col("#ffffff", 0.6), "right");
    if (n) {
      const gap = n > 16 ? 2 : 3, tw = (BW - gap * (n - 1)) / n;
      const seen = new Set(c.seen || []);
      for (let i = 1; i <= n; i++) {
        const tx = X + (i - 1) * (tw + gap);
        const color = i === c.showEpisode ? col(ACCENT) : seen.has(i) ? col("#ffffff", 0.92) : col("#ffffff", 0.18);
        rrect(ctx, tx, BY - (i === c.showEpisode ? 2 : 0), tw, i === c.showEpisode ? 8 : 4, 1.5, color);
      }
    } else {
      rrect(ctx, X, BY, BW, 4, 2, col("#ffffff", 0.18));
    }
  }

  // Play button, bottom-right: says "tap me".
  const PB = 34, PX = W - 16 - PB, PY = H - 16 - PB;
  rrect(ctx, PX, PY, PB, PB, PB / 2, col("#ffffff", notOut ? 0.25 : 0.94));
  const tri = new Path();
  tri.move(new Point(PX + 13.5, PY + 10)); tri.addLine(new Point(PX + 13.5, PY + 24)); tri.addLine(new Point(PX + 25, PY + 17)); tri.closeSubpath();
  ctx.addPath(tri); ctx.setFillColor(col(notOut ? "#ffffff" : BG)); ctx.fillPath();

  return ctx.getImage();
}

function messageCard(title, body) {
  const ctx = new DrawContext();
  ctx.size = new Size(W, H); ctx.opaque = true; ctx.respectScreenScale = true;
  ctx.setFillColor(col(BG)); ctx.fillRect(new Rect(0, 0, W, H));
  rrect(ctx, 16, 21, 6, 6, 3, col(ACCENT));
  text(ctx, "NUVIO", 27, 18, 120, Font.boldSystemFont(9), col("#ffffff", 0.6));
  text(ctx, title, 16, 48, W - 32, Font.heavySystemFont(18), col("#ffffff"));
  const words = String(body).split(" "); const ls = [""];
  for (const wd of words) { const t = (ls[ls.length - 1] + " " + wd).trim(); if (estW(t, 11, 0.53) > W - 40 && ls[ls.length - 1]) ls.push(wd); else ls[ls.length - 1] = t; }
  ls.slice(0, 3).forEach((l, i) => text(ctx, l, 16, 80 + i * 15, W - 32, Font.mediumSystemFont(11), col("#ffffff", 0.6)));
  text(ctx, "Open the script → Check connection for details", 16, H - 30, W - 32, Font.mediumSystemFont(9), col("#ffffff", 0.35));
  return ctx.getImage();
}

const deepLink = (c) => {
  const t = c.type === "movie" ? "movie" : "series";
  if (c.tmdb) return `nuvio://tmdb/${t}/${c.tmdb}`;
  const id = String(c.contentId || "").replace(/^imdb:/, "");
  return id ? `nuvio://detail/${t}/${encodeURIComponent(id)}` : "nuvio://";
};

// ---------- widget ----------
async function buildWidget() {
  const w = new ListWidget();
  w.setPadding(0, 0, 0, 0);
  w.backgroundColor = col(BG);
  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
  let card = null, problem = null;
  try {
    const s = await liveSession();
    card = await loadCard(s);
    if (card) writeLocal(CACHE_FILE, card);
    else problem = ["Nothing yet", "Start something in Nuvio and it shows up here."];
  } catch (e) {
    if (e.auth) problem = [e.none ? "Sign in to Nuvio" : "Nuvio login expired", "Tap to open Scriptable and sign in."];
    else if (e.offline) { card = readLocal(CACHE_FILE); if (!card) problem = ["Can't reach Nuvio", String(e.message).slice(0, 120)]; }
    else problem = ["Nuvio problem", String(e.message || e).slice(0, 120)];
    if (e.auth) w.url = `scriptable:///run/${encodeURIComponent(SCRIPT_NAME)}`;
  }
  try {
    if (problem) w.backgroundImage = messageCard(problem[0], problem[1]);
    else { w.backgroundImage = await drawCard(card); w.url = deepLink(card); }
  } catch (e) {
    w.backgroundImage = messageCard("Widget error", String(e.message || e).slice(0, 120));
  }
  return w;
}

// ---------- in-app: connection check (shows no passwords or tokens) ----------
async function diagnose() {
  const lines = [];
  const step = async (name, fn) => { try { const r = await fn(); lines.push("✅ " + name + (r ? ": " + r : "")); return true; } catch (e) { lines.push("❌ " + name + ": " + (e.detail || e.message || e)); return false; } };
  const s0 = await readSession();
  lines.push(s0 ? `Session file found · profile ${s0.profile || 1} (${s0.profileName || "?"}) · iCloud ${cloud ? "on" : "off"}` : "❌ No saved session: sign in first");
  let s = null, data = null;
  if (s0) await step("Login pass", async () => { s = await liveSession(); return "valid for " + Math.round((s.expires_at - Date.now()) / 60000) + " min"; });
  if (s) await step("Profiles", async () => { const p = await nuvioReq("/rest/v1/rpc/sync_pull_profiles", undefined, s.access_token); return Array.isArray(p) ? p.map((x) => x.profile_index + "=" + x.name).join(", ") || "none" : JSON.stringify(p).slice(0, 80); });
  if (s) await step("Watch data", async () => { data = await pullData(s); return `${data.progress.length} in progress, ${data.history.length} watched`; });
  if (data && data.progress[0]) { const p = data.progress[0]; lines.push(`Latest: ${p.content_id} ${p.content_type} S${p.season}E${p.episode} ${Math.round(p.position / 60000)}/${Math.round(p.duration / 60000)} min · ${new Date(p.last_watched).toLocaleString()}`); }
  if (data && data.history[0]) { const h = data.history[0]; lines.push(`Last watched: ${h.title || h.content_id} S${h.season}E${h.episode}`); }
  if (s && data) await step("Card", async () => { const c = await loadCard(s); return c ? `${c.title} (${c.type}${c.tmdb ? ", TMDB " + c.tmdb : ", no TMDB match"})` : "nothing to show"; });
  lines.push("TMDB key: " + (TMDB_KEY ? "set" : "missing"));
  const a = new Alert(); a.title = "Connection check (v4)"; a.message = lines.join("\n\n"); a.addAction("Copy"); a.addCancelAction("Close");
  if ((await a.presentAlert()) === 0) Pasteboard.copy(lines.join("\n"));
}

// ---------- in-app: sign in / profile / sign out ----------
async function chooseProfile(s) {
  let profiles = await nuvioReq("/rest/v1/rpc/sync_pull_profiles", undefined, s.access_token);
  if (!Array.isArray(profiles)) profiles = [];
  if (profiles.length <= 1) { const p = profiles[0]; s.profile = p ? p.profile_index : 1; s.profileName = p ? p.name : "Main"; return; }
  const a = new Alert();
  a.title = "Which Nuvio profile?";
  profiles.sort((x, y) => x.profile_index - y.profile_index).forEach((p) => a.addAction(p.name || "Profile " + p.profile_index));
  a.addCancelAction("Cancel");
  const i = await a.presentSheet();
  const p = profiles[i >= 0 ? i : 0];
  s.profile = p.profile_index; s.profileName = p.name;
}

async function signInFlow() {
  const a = new Alert();
  a.title = "Sign in to Nuvio (v4)";
  a.message = "Your password goes straight to Nuvio and isn't saved. Only a login pass is kept, so the widgets stay signed in.";
  a.addTextField("Email");
  a.addSecureTextField("Password");
  a.addAction("Sign in");
  a.addCancelAction("Cancel");
  if ((await a.presentAlert()) === -1) return false;
  const email = a.textFieldValue(0).trim(), password = a.textFieldValue(1);
  const say = async (title, msg) => { const x = new Alert(); x.title = title; x.message = msg; x.addAction("OK"); await x.presentAlert(); };
  let s;
  try { s = await signIn(email, password); }
  catch (e) {
    const m = String(e.message || e);
    await say("Couldn't sign in", /invalid_credentials|Invalid login/i.test(m)
      ? "Nuvio says the email or password is wrong.\n\nIf you normally sign in to Nuvio with Google or Apple, this account has no password yet. Use the email + password login instead."
      : /not.confirmed/i.test(m) ? "Nuvio says this email isn't confirmed yet. Check your inbox for Nuvio's email." : m);
    return false;
  }
  // Save the login FIRST, so a later hiccup (profiles) never throws it away.
  s.profile = 1; s.profileName = "Main";
  const w1 = writeSession(s);
  if (!w1.ok) { await say("Signed in, but couldn't save the login", w1.errs.join("\n")); return false; }
  try { await chooseProfile(s); writeSession(s); }
  catch (e) { await say("Signed in ✓", "Couldn't load your Nuvio profiles, so using profile 1.\n\n" + (e.detail || e.message || e)); }
  if (!(await readSession())) { await say("Signed in, but the login didn't stick", "Saved it, but couldn't read it back. Send Claude a screenshot."); return false; }
  return true;
}

async function main() {
  if (config.runsInWidget) { Script.setWidget(await buildWidget()); Script.complete(); return; }
  let s = await readSession();
  if (!s) { if (!(await signInFlow())) return Script.complete(); await diagnose(); }
  else {
    const a = new Alert();
    a.title = "Nuvio Up Next (v4)";
    a.message = `Signed in · profile: ${s.profileName || s.profile || 1}`;
    a.addAction("Preview widget");
    a.addAction("Switch profile");
    a.addDestructiveAction("Sign out");
    a.addAction("Check connection");
    a.addCancelAction("Close");
    const i = await a.presentSheet();
    if (i === 3) { await diagnose(); return Script.complete(); }
    if (i === 1) { try { const live = await liveSession(); await chooseProfile(live); writeSession(live); } catch (e) {} }
    else if (i === 2) {
      try { const live = await liveSession(); await nuvioReq("/auth/v1/logout", {}, live.access_token); } catch (e) {}
      clearSession(); return Script.complete();
    } else if (i !== 0) return Script.complete();
  }
  const w = await buildWidget();
  await w.presentMedium();
  Script.complete();
}

try { await main(); }
catch (e) {
  if (config.runsInWidget) throw e;
  const x = new Alert(); x.title = "Nuvio Up Next error"; x.message = String((e && e.stack) || e).slice(0, 600); x.addAction("OK"); await x.presentAlert();
  Script.complete();
}
