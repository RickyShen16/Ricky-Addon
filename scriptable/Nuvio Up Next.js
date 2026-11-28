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
// "split"   = big backdrop + official logo on the left, 3-title Up Next list on the right
// "classic" = the old Simkl Radar look: round poster + ring, title, bar, Up Next list
// "hero"    = one title, full backdrop (no list)
// "slash"   = diagonal red cut through the backdrop; Up Next steps down the diagonal
// "ticket"  = cinema ticket: backdrop body + torn stub with % and 3 mini posters
// "shelf"   = logo + big % on top, a row of posters (current one highlighted) along the bottom
const LAYOUT = "slash";
// Extra large (Mac desktop / iPad): "reel" | "shatter" | "radar"
const XL_LAYOUT = "shatter";
const FAMILY = config.runsInWidget ? config.widgetFamily : (Device.isPhone() ? "medium" : "extraLarge");
const IS_XL = FAMILY === "extraLarge" || FAMILY === "large";
const IS_LOCK = String(FAMILY).startsWith("accessory");
// Lock screen rectangle: "ticks" (one tick per episode) | "barcode" (matches the home + Mac widgets)
const LOCK_STYLE = "ticks";

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
async function imdbRating(tt, type) {
  const cache = readLocal("nuvio-imdb-cache.json") || {}, hit = cache[tt];
  if (hit && Date.now() - hit.t < 24 * 3600e3) return hit.v;
  try {
    const j = await new Request(`https://v3-cinemeta.strem.io/meta/${type}/${tt}.json`).loadJSON();
    const v = j && j.meta && parseFloat(j.meta.imdbRating);
    cache[tt] = { t: Date.now(), v: v > 0 ? v : null }; writeLocal("nuvio-imdb-cache.json", cache);
    return v > 0 ? v : null;
  } catch (e) { return hit ? hit.v : null; }
}
const ratingText = (c) => (c.rating ? `${c.ratingSrc || "TMDB"} ${c.rating}` : null);
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

  // Hero = the newest thing you touched, finished or not (progress + history in one timeline).
  // A finished movie shows as "Just watched"; a finished episode flips to "Up next".
  const done = (p) => p.duration > 0 && p.position / p.duration >= 0.9;
  const timeline = buildTimeline(progress, history, done);
  const hero = timeline[0];
  if (!hero) return null;

  const card = {
    type: hero.content_type === "movie" ? "movie" : "series",
    contentId: hero.content_id,
    title: hero.title || (history.find((h) => h.content_id === hero.content_id) || {}).title || "",
    season: hero.season, episode: hero.episode,
    position: hero.position, duration: hero.duration,
    when: hero.last_watched,
    finished: hero.finishedFlag,
    watched: hero.content_type === "movie" && hero.finishedFlag,
  };

  const ref = await resolveTmdb(hero.content_id, hero.content_type);
  if (ref) {
    card.tmdb = ref.id;
    const d = await tmdb(`/${ref.kind}/${ref.id}?append_to_response=images,external_ids&include_image_language=en,null`);
    if (d) {
      card.title = d.name || d.title || card.title;
      card.year = (d.first_air_date || d.release_date || "").slice(0, 4);
      // Rating: IMDb (via Stremio's public Cinemeta catalogue); TMDB's score if IMDb has none yet.
      const imdbId = d.imdb_id || (d.external_ids && d.external_ids.imdb_id) || (String(hero.content_id).match(/tt\d+/) || [])[0];
      const imdb = imdbId ? await imdbRating(imdbId, ref.kind === "movie" ? "movie" : "series") : null;
      if (imdb) { card.rating = imdb; card.ratingSrc = "IMDb"; }
      else { card.rating = d.vote_average ? Math.round(d.vote_average * 10) / 10 : null; card.ratingSrc = "TMDB"; }
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
  if (card.tmdb && (IS_XL || (LAYOUT !== "hero" && LAYOUT !== "split"))) {
    const d = await tmdb(`/${card.type === "movie" ? "movie" : "tv"}/${card.tmdb}?append_to_response=images,external_ids&include_image_language=en,null`);
    card.poster = d && d.poster_path ? tmdbImg("w342", d.poster_path) : null;
  }
  if (!IS_LOCK && (IS_XL || LAYOUT !== "hero")) card.rows = await buildRows(progress, history, hero.content_id, done, IS_XL ? 6 : 3);
  return card;
}

// Up to 3 other titles: newest unfinished progress first (one row per show), then recent history.
// One timeline, newest first: every progress row + every history row, one entry per title
// (its most recent event). Each entry knows whether it's finished.
function buildTimeline(progress, history, done) {
  const ev = [];
  for (const p of progress) ev.push(Object.assign({}, p, { finishedFlag: done(p), src: "progress" }));
  for (const h of history) ev.push({ content_id: h.content_id, content_type: h.content_type, season: h.season, episode: h.episode, title: h.title,
    position: 1, duration: 1, last_watched: h.watched_at, finishedFlag: true, src: "history", h });
  ev.sort((a, b) => b.last_watched - a.last_watched);
  const seen = new Set(), out = [];
  for (const e of ev) { if (seen.has(e.content_id)) continue; seen.add(e.content_id); out.push(e); }
  return out;
}

async function buildRows(progress, history, heroId, done, max = 3) {
  const picks = buildTimeline(progress, history, done).filter((e) => e.content_id !== heroId).slice(0, max)
    .map((e) => (e.src === "history" ? { src: "history", h: e.h } : { src: "progress", p: e }));
  const out = [];
  for (const it of picks) {
    const x = it.p || it.h;
    const r = { type: x.content_type === "movie" ? "movie" : "series", title: x.title || "", pct: 0, line: "" };
    if (it.p) {
      const p = it.p, fin = done(p), left = p.duration > 0 ? mins(p.duration - p.position) : null;
      r.pct = p.duration > 0 ? Math.min(1, p.position / p.duration) : 0;
      const short = (m) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`);
      if (r.type === "movie") { r.line = fin ? `✓ Watched · ${agoShort(p.last_watched)} ago` : left ? `${short(left)} left` : "Movie"; if (fin) { r.pct = 1; r.done = true; } }
      else if (fin) { r.line = `✓ S${p.season} E${p.episode} · E${p.episode + 1} next`; r.pct = 1; r.done = true; }
      else r.line = `S${p.season} E${p.episode}` + (left ? ` · ${short(left)} left` : "");
      r.when = p.last_watched;
    } else {
      const h = it.h; r.pct = 1; r.done = true; r.when = h.watched_at;
      r.line = r.type === "movie" ? `✓ Watched · ${agoShort(h.watched_at)} ago` : `✓ S${h.season} E${h.episode} · ${agoShort(h.watched_at)} ago`;
    }
    const ref = await resolveTmdb(x.content_id, x.content_type);
    if (ref) {
      const d = await tmdb(`/${ref.kind}/${ref.id}?append_to_response=images,external_ids&include_image_language=en,null`);
      if (d) { r.title = d.name || d.title || r.title; r.poster = d.poster_path ? tmdbImg("w185", d.poster_path) : null; r.backdrop = d.backdrop_path ? tmdbImg("w300", d.backdrop_path) : null; }
    }
    if (!r.title) r.title = String(x.content_id);
    out.push(r);
  }
  return out;
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
// Scale+crop an image into its own w×h canvas, so nothing spills outside the box.
function cropTo(img, w, h, focusY = 0.35) {
  const c = new DrawContext(); c.size = new Size(w, h); c.respectScreenScale = true; c.opaque = false;
  const s = Math.max(w / img.size.width, h / img.size.height), iw = img.size.width * s, ih = img.size.height * s;
  c.drawImageInRect(img, new Rect((w - iw) / 2, (h - ih) * focusY, iw, ih));
  return c.getImage();
}
function strokeCircle(ctx, cx, cy, r, color, lw) {
  ctx.setStrokeColor(color); ctx.setLineWidth(lw);
  const p = new Path(); p.addEllipse(new Rect(cx - r, cy - r, r * 2, r * 2)); ctx.addPath(p); ctx.strokePath();
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
function agoShort(ms) { const m = Math.round((Date.now() - ms) / 60000); return m < 60 ? Math.max(1, m) + "m" : m < 1440 ? Math.round(m / 60) + "h" : Math.round(m / 1440) + "d"; }
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
    const parts = [c.year, c.runtime ? hm(c.runtime) : null, ratingText(c), c.genre].filter(Boolean);
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

// ---------- shared hero wording ----------
function heroInfo(c) {
  if (c.watched) return { upNext: false, watched: true, d: null, notOut: false, kick: "JUST WATCHED", pct: 1, left: null, ep: "" };
  const upNext = c.type === "series" && c.finished;
  const d = upNext ? daysUntil(c.airDate) : null;
  const notOut = upNext && d != null && d > 0;
  const kick = c.type === "movie" ? "CONTINUE · MOVIE" : notOut ? "NEW EPISODE SOON" : upNext ? "UP NEXT" : "CONTINUE WATCHING";
  const pct = upNext ? 0 : c.duration > 0 ? Math.min(1, c.position / c.duration) : 0;
  const left = !upNext && c.duration > 0 ? mins(c.duration - c.position) : null;
  let ep = "";
  if (c.type === "series" && c.showSeason != null) ep = `S${c.showSeason} · E${c.showEpisode}`;
  return { upNext, d, notOut, kick, pct, left, ep };
}
function rowsBlock(ctx, rows, x, y0, w, rowH, posterW, posterH) {
  rows.slice(0, 3).forEach((r, i) => {
    const y = y0 + i * rowH;
    if (r._img) ctx.drawImageInRect(cropTo(r._img, posterW, posterH, 0.2), new Rect(x, y, posterW, posterH));
    else rrect(ctx, x, y, posterW, posterH, 3, col("#ffffff", 0.08));
    const tx = x + posterW + 8, tw = w - posterW - 8;
    text(ctx, fit(r.title, 10.5, tw, 0.58), tx, y - 1, tw + 30, Font.boldSystemFont(10.5), col("#ffffff", 0.95));
    text(ctx, fit(r.line, 8.5, tw, 0.56), tx, y + 13, tw + 30, Font.mediumSystemFont(8.5), col("#ffffff", 0.55));
    rrect(ctx, tx, y + posterH - 4, tw, 3, 1.5, col("#ffffff", 0.14));
    if (r.pct > 0) rrect(ctx, tx, y + posterH - 4, Math.max(3, tw * r.pct), 3, 1.5, r.pct >= 1 ? col("#ffffff", 0.75) : col(ACCENT));
  });
}
async function loadRowImages(rows) { for (const r of rows || []) r._img = await loadImage(r.poster); }

// ---------- layout: split (backdrop hero + Up Next list) ----------
async function drawSplit(c) {
  const ctx = new DrawContext();
  ctx.size = new Size(W, H); ctx.opaque = true; ctx.respectScreenScale = true;
  ctx.setFillColor(col(BG)); ctx.fillRect(new Rect(0, 0, W, H));
  const HW = 204, PX = HW;
  const info = heroInfo(c);

  const bd = await loadImage(c.backdrop);
  if (bd) {
    ctx.drawImageInRect(cropTo(bd, HW, H, 0.3), new Rect(0, 0, HW, H));
    for (let x = 0; x < HW; x++) { const t = x / HW; ctx.setFillColor(col(BG, 0.9 - 0.55 * t)); ctx.fillRect(new Rect(x, 0, 1, H)); }
    vfadeRect(ctx, 0, HW, Math.round(H * 0.5), H, 0, 0.8);
  }
  // panel
  ctx.setFillColor(col("#130f11")); ctx.fillRect(new Rect(PX, 0, W - PX, H));
  ctx.setFillColor(col("#ffffff", 0.07)); ctx.fillRect(new Rect(PX, 0, 1, H));

  const X = 14;
  rrect(ctx, X, 17, 6, 6, 3, col(ACCENT));
  text(ctx, info.kick, X + 11, 14, 170, Font.boldSystemFont(9), col("#ffffff", 0.75));

  let y = 31;
  const logo = await loadImage(c.logo);
  if (logo) {
    const r = logo.size.width / logo.size.height; let lh = 36, lw = lh * r;
    if (lw > 160) { lw = 160; lh = lw / r; }
    ctx.drawImageInRect(logo, new Rect(X, y + (36 - lh) / 2, lw, lh)); y += 43;
  } else {
    const t = (c.title || "Untitled").toUpperCase(), fs = estW(t, 26, 0.42) > 170 ? 20 : 26;
    text(ctx, fit(t, fs, 176, 0.42), X, y + (26 - fs), 200, new Font("Futura-CondensedExtraBold", fs), col("#ffffff")); y += 36;
  }
  let sub;
  if (c.type === "series") sub = info.ep + (c.epName ? `  ${c.epName}` : "");
  else { const parts = [c.year, c.runtime ? hm(c.runtime) : null, ratingText(c)]; sub = parts.filter(Boolean).join("  ·  "); }
  text(ctx, fit(sub, 10.5, 180, 0.55), X, y, 200, Font.semiboldSystemFont(10.5), col("#ffffff", 0.88));

  const BY = H - 20, BW = 174;
  if (!info.upNext) {
    text(ctx, `${Math.round(info.pct * 100)}%`, X, BY - 16, 50, Font.heavySystemFont(10.5), col("#ffffff"));
    if (info.left) text(ctx, `${hm(info.left)} left`, X + BW - 100, BY - 15, 100, Font.mediumSystemFont(9.5), col("#ffffff", 0.65), "right");
    rrect(ctx, X, BY, BW, 4, 2, col("#ffffff", 0.2));
    if (info.pct > 0) rrect(ctx, X, BY, Math.max(4, BW * info.pct), 4, 2, col(ACCENT));
  } else {
    const n = c.seasonEpisodes && c.seasonEpisodes <= 30 ? c.seasonEpisodes : null;
    const label = info.notOut ? `E${c.showEpisode} in ${info.d} day${info.d === 1 ? "" : "s"}` : n ? `${(c.seen || []).length} of ${n} watched` : "Ready to watch";
    text(ctx, label, X, BY - 16, 160, Font.heavySystemFont(10.5), col("#ffffff"));
    if (n) {
      const gap = n > 16 ? 2 : 3, tw = (BW - gap * (n - 1)) / n, seen = new Set(c.seen || []);
      for (let i = 1; i <= n; i++) {
        const now = i === c.showEpisode;
        rrect(ctx, X + (i - 1) * (tw + gap), BY - (now ? 2 : 0), tw, now ? 8 : 4, 1.5, now ? col(ACCENT) : seen.has(i) ? col("#ffffff", 0.92) : col("#ffffff", 0.18));
      }
    } else rrect(ctx, X, BY, BW, 4, 2, col("#ffffff", 0.2));
  }

  // Up Next list
  const RX = PX + 11, RW = W - RX - 12;
  text(ctx, "UP NEXT", RX, 14, 100, Font.boldSystemFont(9), col("#ffffff", 0.5));
  await loadRowImages(c.rows);
  if (c.rows && c.rows.length) rowsBlock(ctx, c.rows, RX, 33, RW, 40, 22, 33);
  else text(ctx, "Nothing else yet", RX, 34, RW + 20, Font.mediumSystemFont(9.5), col("#ffffff", 0.4));
  return ctx.getImage();
}
function vfadeRect(ctx, x0, x1, y0, y1, fromA, toA) {
  for (let y = y0; y < y1; y++) { const t = (y - y0) / (y1 - y0); ctx.setFillColor(col(BG, fromA + (toA - fromA) * t)); ctx.fillRect(new Rect(x0, y, x1 - x0, 1)); }
}

// ---------- layout: classic (old Simkl Radar look, on Nuvio data) ----------
function sfWidth(str, fs) {
  let w = 0;
  for (const ch of str || "") {
    if (ch === " ") w += fs * 0.28; else if (/[ilIjtf.,!:;'|]/.test(ch)) w += fs * 0.30;
    else if (/[mwMW]/.test(ch)) w += fs * 0.85; else if (/[A-Z0-9]/.test(ch)) w += fs * 0.62; else w += fs * 0.54;
  }
  return w;
}
function layoutTitle(title, maxW) {
  title = (title || "").trim(); const ladder = [22, 20, 18, 16, 14];
  for (const fs of ladder) if (sfWidth(title, fs) <= maxW) return { fs, lines: [title] };
  const words = title.split(/\s+/);
  for (const fs of ladder) for (let i = words.length - 1; i >= 1; i--) {
    const a = words.slice(0, i).join(" "), b = words.slice(i).join(" ");
    if (sfWidth(a, fs) <= maxW && sfWidth(b, fs) <= maxW) return { fs, lines: [a, b] };
  }
  return { fs: 14, lines: [fit(title, 14, maxW, 0.6)] };
}
const trk = (t) => (t || "").split("").join("\u2009");
async function drawClassic(c) {
  const CW = 364, CH = 170;
  const ctx = new DrawContext();
  ctx.size = new Size(CW, CH); ctx.opaque = true; ctx.respectScreenScale = true;
  ctx.setFillColor(col("#0f0c0d")); ctx.fillRect(new Rect(0, 0, CW, CH));
  const info = heroInfo(c);
  const ringPct = info.upNext ? 1 : info.pct;

  // left: round poster + progress ring
  const cx = 64, cy = 85, R = 41, ringR = 48;
  const poster = await loadImage(c.poster || c.backdrop);
  if (poster) {
    const sq = cropTo(poster, R * 2, R * 2, 0.18);
    ctx.drawImageInRect(sq, new Rect(cx - R, cy - R, R * 2, R * 2));
    const Lm = R * 0.5; strokeCircle(ctx, cx, cy, R + Lm / 2, col("#0f0c0d"), Lm);   // round mask
    ctx.setFillColor(col("#000000", 0.35)); const dim = new Path(); dim.addEllipse(new Rect(cx - R, cy - R, R * 2, R * 2)); ctx.addPath(dim); ctx.fillPath();
  } else { ctx.setFillColor(col("#2a2224")); const pe = new Path(); pe.addEllipse(new Rect(cx - R, cy - R, R * 2, R * 2)); ctx.addPath(pe); ctx.fillPath(); }
  strokeCircle(ctx, cx, cy, ringR, col("#ffffff", 0.18), 3);
  if (ringPct > 0) {
    const seg = Math.max(2, Math.round(72 * ringPct)), ap = new Path();
    for (let i = 0; i <= seg; i++) { const a = (-90 + 360 * ringPct * (i / seg)) * Math.PI / 180, px = cx + ringR * Math.cos(a), py = cy + ringR * Math.sin(a); if (i === 0) ap.move(new Point(px, py)); else ap.addLine(new Point(px, py)); }
    ctx.setStrokeColor(col(ACCENT)); ctx.setLineWidth(3.5); ctx.addPath(ap); ctx.strokePath();
  }
  if (!info.upNext) {
    const num = String(Math.round(info.pct * 100));
    text(ctx, num + "%", cx - 40, cy - 12, 80, Font.heavySystemFont(20), col("#ffffff"), "center");
  } else {
    const tri = new Path(); tri.move(new Point(cx - 6, cy - 9)); tri.addLine(new Point(cx - 6, cy + 9)); tri.addLine(new Point(cx + 9, cy)); tri.closeSubpath();
    ctx.addPath(tri); ctx.setFillColor(col("#ffffff", 0.95)); ctx.fillPath();
  }

  // middle
  const mx = 122, dvx = 226, midW = dvx - 12 - mx;
  text(ctx, trk(info.kick.replace("CONTINUE · MOVIE", "NOW WATCHING").replace("CONTINUE WATCHING", "NOW WATCHING")), mx, 38, 140, Font.boldSystemFont(8.5), col("#ffffff", 0.55));
  const lay = layoutTitle(c.title, midW);
  let yy = lay.lines.length === 2 ? 50 : 53;
  for (const ln of lay.lines) { text(ctx, ln, mx, yy, midW + 30, Font.boldSystemFont(lay.fs), col("#ffffff")); yy += lay.fs + 1; }
  let sub;
  if (c.type === "movie") sub = info.left ? `${hm(info.left)} LEFT` : "MOVIE";
  else if (info.notOut) sub = `${info.ep} · IN ${info.d}D`;
  else sub = (info.ep || "—") + (info.left ? ` · ${hm(info.left).toUpperCase()} LEFT` : info.upNext ? " · NEXT" : "");
  text(ctx, trk(fit(sub, 8.5, midW, 0.78)), mx, yy + 6, midW + 30, Font.boldSystemFont(8.5), col("#ffffff", 0.75));
  let by = Math.min(yy + 24, 136);
  rrect(ctx, mx, by, midW, 6, 3, col("#ffffff", 0.14));
  if (ringPct > 0) rrect(ctx, mx, by, Math.max(6, midW * ringPct), 6, 3, col(ACCENT));

  // divider + Up Next
  rrect(ctx, dvx - 0.8, 40, 1.6, 100, 0.8, col("#ffffff", 0.1));
  const rx = 236;
  text(ctx, trk("UP NEXT"), rx, 28, 100, Font.boldSystemFont(8.5), col("#ffffff", 0.55));
  await loadRowImages(c.rows);
  if (c.rows && c.rows.length) rowsBlock(ctx, c.rows, rx, 44, CW - rx - 16, 38, 20, 29);

  // footer
  const nowD = new Date(), hh = nowD.getHours() % 12 || 12, mm = String(nowD.getMinutes()).padStart(2, "0");
  strokeCircle(ctx, 24, 154, 3.5, col("#ffffff", 0.3), 1.2);
  text(ctx, trk(`NUVIO  ·  ${hh}:${mm} ${nowD.getHours() >= 12 ? "PM" : "AM"}`), 32, 149, 200, Font.boldSystemFont(7), col("#ffffff", 0.35));
  return ctx.getImage();
}

// ---------- extra layouts ----------
const COND = (fs) => new Font("Futura-CondensedExtraBold", fs);
function poly(ctx, pts, color) { const p = new Path(); p.move(new Point(pts[0][0], pts[0][1])); for (const q of pts.slice(1)) p.addLine(new Point(q[0], q[1])); p.closeSubpath(); ctx.addPath(p); ctx.setFillColor(color); ctx.fillPath(); }
async function drawLogo(ctx, c, x, y, maxW, maxH, fallbackFs) {
  const logo = await loadImage(c.logo);
  if (logo) { const r = logo.size.width / logo.size.height; let lh = maxH, lw = lh * r; if (lw > maxW) { lw = maxW; lh = lw / r; } ctx.drawImageInRect(logo, new Rect(x, y + (maxH - lh) / 2, lw, lh)); return; }
  const t = (c.title || "Untitled").toUpperCase(); const fs = estW(t, fallbackFs, 0.42) > maxW ? Math.round(fallbackFs * 0.75) : fallbackFs;
  text(ctx, fit(t, fs, maxW, 0.42), x, y + (maxH - fs) / 2 - 2, maxW + 30, COND(fs), col("#ffffff"));
}
function subLine(c, info) {
  if (c.type === "series") return info.ep + (c.epName ? `  ${c.epName}` : "");
  return [c.year, c.runtime ? hm(c.runtime) : null, ratingText(c)].filter(Boolean).join("  ·  ");   // callers fit it
}
const pctText = (c, info) => (info.watched ? "DONE" : info.upNext ? (info.notOut ? `IN ${info.d}D` : `E${c.showEpisode}`) : `${Math.round(info.pct * 100)}%`);
const barPct = (c, info) => (info.watched ? 1 : info.upNext ? (c.seasonEpisodes ? Math.min(1, (c.seen || []).length / c.seasonEpisodes) : 0) : info.pct);
const leftText = (c, info) => (info.watched ? `Watched ${ago(c.when)}` : info.upNext ? (info.notOut ? `E${c.showEpisode} airs soon` : `${(c.seen || []).length}${c.seasonEpisodes ? "/" + c.seasonEpisodes : ""} watched`) : info.left ? `${hm(info.left)} left` : "");

// Ticket-style barcode progress: bars of varying height, red up to the % watched.
function barcode(ctx, x, yBottom, w, pct, n = 40) {
  const step = w / n;
  for (let i = 0; i < n; i++) {
    const h = [13, 9, 13, 6, 13, 10][i % 6];
    rrect(ctx, x + i * step, yBottom - h, Math.max(1.6, step * 0.42), h, 0.6, i / n < pct ? col(ACCENT) : col("#ffffff", 0.2));
  }
}

// SLASH
async function drawSlash(c) {
  const ctx = new DrawContext(); ctx.size = new Size(W, H); ctx.opaque = true; ctx.respectScreenScale = true;
  ctx.setFillColor(col(BG)); ctx.fillRect(new Rect(0, 0, W, H));
  const info = heroInfo(c);
  const bd = await loadImage(c.backdrop);
  if (bd) {
    ctx.drawImageInRect(cropTo(bd, 236, H, 0.3), new Rect(0, 0, 236, H));
    for (let x = 0; x < 236; x++) { const t = x / 236; ctx.setFillColor(col(BG, 0.88 - 0.6 * t)); ctx.fillRect(new Rect(x, 0, 1, H)); }
    vfadeRect(ctx, 0, 236, 70, H, 0, 0.75);
  }
  const TX = 212, BX = 170;                     // diagonal: x at top / bottom
  const edge = (y) => TX + (BX - TX) * (y / H);
  poly(ctx, [[TX, 0], [W, 0], [W, H], [BX, H]], col("#0e0a0b"));
  poly(ctx, [[TX - 4, 0], [TX + 1, 0], [BX + 1, H], [BX - 4, H]], col(ACCENT));
  poly(ctx, [[TX + 7, 0], [TX + 8.5, 0], [BX + 8.5, H], [BX + 7, H]], col("#ffffff", 0.12));

  const X = 14;
  text(ctx, info.kick, X, 14, 170, Font.boldSystemFont(8.5), col(ACCENT));
  await drawLogo(ctx, c, X, 30, 150, 38, 28);
  let sl = subLine(c, info); if (c.type === "movie") { const parts = sl.split("  ·  "); while (parts.length > 1 && estW(parts.join("  ·  "), 10, 0.55) > 150) parts.splice(1, 1); sl = parts.join("  ·  "); }
  text(ctx, fit(sl, 10, 150, 0.55), X, 74, 190, Font.semiboldSystemFont(10), col("#ffffff", 0.85));
  const big = pctText(c, info);
  text(ctx, big, X, 90, 120, COND(34), col("#ffffff"));
  text(ctx, leftText(c, info), X + 142 - 120, 112, 120, Font.mediumSystemFont(9), col("#ffffff", 0.65), "right");
  barcode(ctx, X, H - 12, 142, barPct(c, info));
  if (!(c.rows && c.rows.length)) { text(ctx, "Nothing else", edge(40) + 16, 36, 110, Font.mediumSystemFont(10), col("#ffffff", 0.35)); text(ctx, "in progress", edge(54) + 16, 50, 110, Font.mediumSystemFont(10), col("#ffffff", 0.35)); }

  text(ctx, "RECENT", edge(14) + 16, 14, 110, Font.boldSystemFont(8.5), col("#ffffff", 0.45));
  await loadRowImages(c.rows);
  (c.rows || []).slice(0, 3).forEach((r, i) => {
    const y = 32 + i * 41, x = edge(y + 16) + 16, w = W - x - 12;
    if (r._img) ctx.drawImageInRect(cropTo(r._img, 23, 34, 0.2), new Rect(x, y, 23, 34)); else rrect(ctx, x, y, 23, 34, 2, col("#ffffff", 0.08));
    const tx = x + 30, tw = w - 30;
    text(ctx, fit(r.title, 10.5, tw, 0.58), tx, y, tw + 30, Font.boldSystemFont(10.5), col("#ffffff"));
    text(ctx, fit(r.line, 8, tw + 4, 0.5), tx, y + 14, tw + 30, Font.mediumSystemFont(8), col("#ffffff", 0.55));
    rrect(ctx, tx, y + 30, tw, 2.5, 1.25, col("#ffffff", 0.14));
    if (r.pct > 0) rrect(ctx, tx, y + 30, Math.max(3, tw * r.pct), 2.5, 1.25, r.pct >= 1 ? col("#ffffff", 0.7) : col(ACCENT));
  });
  return ctx.getImage();
}

// TICKET
async function drawTicket(c) {
  const ctx = new DrawContext(); ctx.size = new Size(W, H); ctx.opaque = true; ctx.respectScreenScale = true;
  const DARK = "#050304"; ctx.setFillColor(col(DARK)); ctx.fillRect(new Rect(0, 0, W, H));
  const info = heroInfo(c), SX = 228;           // stub starts here
  const bd = await loadImage(c.backdrop);
  ctx.setFillColor(col("#140d0f")); ctx.fillRect(new Rect(0, 0, SX, H));
  if (bd) {
    ctx.drawImageInRect(cropTo(bd, SX, H, 0.3), new Rect(0, 0, SX, H));
    for (let x = 0; x < SX; x++) { const t = x / SX; ctx.setFillColor(col("#140d0f", 0.9 - 0.5 * t)); ctx.fillRect(new Rect(x, 0, 1, H)); }
    vfadeRect(ctx, 0, SX, 80, H, 0, 0.7);
  }
  // stub
  ctx.setFillColor(col("#1b1214")); ctx.fillRect(new Rect(SX, 0, W - SX, H));
  // notches + perforation
  for (const ny of [0, H]) { const p = new Path(); p.addEllipse(new Rect(SX - 9, ny - 9, 18, 18)); ctx.addPath(p); ctx.setFillColor(col(DARK)); ctx.fillPath(); }
  for (let y = 14; y < H - 12; y += 7) rrect(ctx, SX - 1, y, 2, 3.5, 1, col("#ffffff", 0.22));

  const X = 14;
  text(ctx, "NUVIO  ·  " + info.kick, X, 14, 200, Font.boldSystemFont(8.5), col("#ffffff", 0.7));
  await drawLogo(ctx, c, X, 32, 170, 40, 30);
  text(ctx, fit(subLine(c, info), 10, 196, 0.55), X, 80, 210, Font.semiboldSystemFont(10), col("#ffffff", 0.88));
  // barcode-ish progress: thin bars, filled up to %
  const BX0 = X, BW = 196, n = 49, done = info.upNext ? 1 : info.pct;
  for (let i = 0; i < n; i++) {
    const h = [14, 10, 14, 7, 14, 11][i % 6], x = BX0 + i * (BW / n);
    rrect(ctx, x, H - 16 - h, 2, h, 0.6, i / n < done ? col(ACCENT) : col("#ffffff", 0.2));
  }
  text(ctx, leftText(c, info), X, H - 44, 200, Font.mediumSystemFont(9), col("#ffffff", 0.6));

  // stub content
  const RX = SX + 12, RW = W - RX - 10;
  text(ctx, "ADMIT ONE", RX, 14, RW + 20, Font.boldSystemFont(8), col(ACCENT));
  text(ctx, pctText(c, info), RX - 1, 26, RW + 20, COND(30), col("#ffffff"));
  text(ctx, info.upNext ? info.ep.replace(" · ", "") : c.type === "movie" ? "MOVIE" : info.ep.replace(" · ", " "), RX, 64, RW + 20, Font.boldSystemFont(8.5), col("#ffffff", 0.55));
  await loadRowImages(c.rows);
  const rows = (c.rows || []).slice(0, 3), pw = 24, gap = (RW - pw * 3) / 2;
  rows.forEach((r, i) => {
    const x = RX + i * (pw + gap), y = 92;
    if (r._img) ctx.drawImageInRect(cropTo(r._img, pw, 36, 0.2), new Rect(x, y, pw, 36)); else rrect(ctx, x, y, pw, 36, 2, col("#ffffff", 0.08));
    rrect(ctx, x, y + 40, pw, 2.5, 1.25, col("#ffffff", 0.15));
    if (r.pct > 0) rrect(ctx, x, y + 40, Math.max(2.5, pw * r.pct), 2.5, 1.25, r.pct >= 1 ? col("#ffffff", 0.7) : col(ACCENT));
  });
  if (rows.length) text(ctx, "UP NEXT", RX, 80, RW + 20, Font.boldSystemFont(7), col("#ffffff", 0.4));
  return ctx.getImage();
}

// SHELF
async function drawShelf(c) {
  const ctx = new DrawContext(); ctx.size = new Size(W, H); ctx.opaque = true; ctx.respectScreenScale = true;
  ctx.setFillColor(col(BG)); ctx.fillRect(new Rect(0, 0, W, H));
  const info = heroInfo(c);
  const bd = await loadImage(c.backdrop);
  if (bd) {
    ctx.drawImageInRect(cropTo(bd, W, H, 0.25), new Rect(0, 0, W, H));
    ctx.setFillColor(col(BG, 0.62)); ctx.fillRect(new Rect(0, 0, W, H));
    for (let x = 0; x < W; x++) { const t = x / W; ctx.setFillColor(col(BG, 0.55 * (1 - t))); ctx.fillRect(new Rect(x, 0, 1, H)); }
    vfadeRect(ctx, 0, W, 50, H, 0, 0.92);
  }
  const X = 14;
  text(ctx, info.kick, X, 12, 200, Font.boldSystemFont(8.5), col("#ffffff", 0.75));
  await drawLogo(ctx, c, X, 25, 150, 30, 24);
  text(ctx, pctText(c, info), W - 14 - 110, 6, 110, COND(36), col("#ffffff"), "right");
  text(ctx, leftText(c, info), W - 14 - 150, 48, 150, Font.mediumSystemFont(8.5), col("#ffffff", 0.65), "right");

  // shelf: current item as a wide still + 3 posters
  const Y = 72, PH = 58;
  const cw = 104, still = await loadImage(c.backdrop);
  if (still) ctx.drawImageInRect(cropTo(still, cw, PH, 0.3), new Rect(X, Y, cw, PH));
  ctx.setStrokeColor(col(ACCENT)); ctx.setLineWidth(1.5); ctx.strokeRect(new Rect(X, Y, cw, PH));
  ctx.setFillColor(col("#000000", 0.35)); ctx.fillRect(new Rect(X, Y + PH - 16, cw, 16));
  text(ctx, c.type === "movie" ? "MOVIE" : info.ep.replace(" · ", " "), X + 6, Y + PH - 14, cw, Font.boldSystemFont(8.5), col("#ffffff"));
  rrect(ctx, X, Y + PH + 5, cw, 3, 1.5, col("#ffffff", 0.18));
  const cp = info.upNext ? 1 : info.pct; if (cp > 0) rrect(ctx, X, Y + PH + 5, Math.max(3, cw * cp), 3, 1.5, col(ACCENT));

  await loadRowImages(c.rows);
  const rows = (c.rows || []).slice(0, 3), pw = 39, gap = 10;
  rows.forEach((r, i) => {
    const x = X + cw + 14 + i * (pw + gap);
    if (r._img) ctx.drawImageInRect(cropTo(r._img, pw, PH, 0.2), new Rect(x, Y, pw, PH)); else rrect(ctx, x, Y, pw, PH, 2, col("#ffffff", 0.08));
    rrect(ctx, x, Y + PH + 5, pw, 3, 1.5, col("#ffffff", 0.18));
    if (r.pct > 0) rrect(ctx, x, Y + PH + 5, Math.max(3, pw * r.pct), 3, 1.5, r.pct >= 1 ? col("#ffffff", 0.7) : col(ACCENT));
    const lab = r.type === "movie" ? r.line.replace(" left", "").replace(/(\d+)h (\d+)m/, "$1h$2m") : r.line.split(" · ")[0];
    text(ctx, fit(lab, 7.5, pw + 6, 0.56), x, Y + PH + 11, pw + 30, Font.semiboldSystemFont(7.5), col("#ffffff", 0.55));
  });
  return ctx.getImage();
}

// =====================================================================
// EXTRA LARGE (Mac desktop) — 730 × 358
// =====================================================================
const XW = 730, XH = 358;
function xlCtx(bg) { const ctx = new DrawContext(); ctx.size = new Size(XW, XH); ctx.opaque = true; ctx.respectScreenScale = true; ctx.setFillColor(col(bg)); ctx.fillRect(new Rect(0, 0, XW, XH)); return ctx; }
function hgrad(ctx, x0, x1, y0, y1, hex, fromA, toA) { for (let x = x0; x < x1; x++) { const t = (x - x0) / (x1 - x0); ctx.setFillColor(col(hex, fromA + (toA - fromA) * t)); ctx.fillRect(new Rect(x, y0, 1, y1 - y0)); } }
function vgrad(ctx, x0, x1, y0, y1, hex, fromA, toA) { for (let y = y0; y < y1; y++) { const t = (y - y0) / (y1 - y0); ctx.setFillColor(col(hex, fromA + (toA - fromA) * t)); ctx.fillRect(new Rect(x0, y, x1 - x0, 1)); } }
function clock() { const d = new Date(), D = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][d.getDay()], M = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"][d.getMonth()]; return `${D} ${d.getDate()} ${M} · ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; }
function tc(ms) { const t = Math.max(0, Math.round(ms / 1000)), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s2 = t % 60; return `${h}:${String(m).padStart(2, "0")}:${String(s2).padStart(2, "0")}`; }
async function xlImages(c) { c._bd = await loadImage(c.backdrop); c._poster = await loadImage(c.poster); for (const r of c.rows || []) { r._img = await loadImage(r.poster); r._bd = await loadImage(r.backdrop); } }

// ---------------- REEL: a strip of 35mm film running across the desk ----------------
async function drawReel(c) {
  const ctx = xlCtx("#060405"), info = heroInfo(c); await xlImages(c);
  const S0 = 40, S1 = 318;                                     // film strip
  ctx.setFillColor(col("#171011")); ctx.fillRect(new Rect(0, S0, XW, S1 - S0));
  for (let x = 8; x < XW; x += 22) for (const y of [48, 299]) rrect(ctx, x, y, 12, 9, 2.5, col("#060405"));
  const AMB = "#ff9a4d";
  for (const [x, t] of [[28, "NUVIO 5219"], [210, "▸ 14A"], [470, "NUVIO 5219"], [640, "▸ 15"]]) text(ctx, t, x, 62, 120, Font.boldSystemFont(7), col(AMB, 0.65));
  for (const [x, t] of [[120, "KODAK·NUVIO"], [380, "▸ 14"], [560, "KODAK·NUVIO"]]) text(ctx, t, x, 288, 120, Font.boldSystemFont(7), col(AMB, 0.65));

  // header
  rrect(ctx, 24, 18, 7, 7, 3.5, col(ACCENT));
  text(ctx, "NUVIO  ·  NOW SHOWING", 37, 14, 300, Font.boldSystemFont(10), col("#ffffff", 0.8));
  text(ctx, clock(), XW - 24 - 220, 14, 220, Font.boldSystemFont(10), col("#ffffff", 0.45), "right");

  // hero frame
  const FY = 76, FH = 206, HX = 24, HW = 404;
  if (c._bd) ctx.drawImageInRect(cropTo(c._bd, HW, FH, 0.3), new Rect(HX, FY, HW, FH)); else rrect(ctx, HX, FY, HW, FH, 2, col("#2a1f21"));
  hgrad(ctx, HX, HX + HW, FY, FY + FH, "#000000", 0.75, 0.05);
  vgrad(ctx, HX, HX + HW, FY + 90, FY + FH, "#000000", 0, 0.7);
  text(ctx, info.kick, HX + 16, FY + 14, 300, Font.boldSystemFont(9), col(ACCENT));
  await drawLogo(ctx, c, HX + 16, FY + 34, 250, 64, 46);
  text(ctx, fit(subLine(c, info), 12, 260, 0.55), HX + 16, FY + 108, 300, Font.semiboldSystemFont(12), col("#ffffff", 0.9));
  text(ctx, pctText(c, info), HX + HW - 16 - 160, FY + FH - 66, 160, COND(58), col("#ffffff"), "right");
  text(ctx, leftText(c, info), HX + 16, FY + FH - 24, 250, Font.mediumSystemFont(11), col("#ffffff", 0.7));

  // other frames
  const rows = (c.rows || []).slice(0, 3), OX = HX + HW + 12, OW = (XW - 24 - OX - 2 * 10) / 3;
  rows.forEach((r, i) => {
    const x = OX + i * (OW + 10);
    const img = r._img || r._bd;
    if (img) ctx.drawImageInRect(cropTo(img, OW, FH, 0.25), new Rect(x, FY, OW, FH)); else rrect(ctx, x, FY, OW, FH, 2, col("#2a1f21"));
    vgrad(ctx, x, x + OW, FY + FH - 60, FY + FH, "#000000", 0, 0.75);
    ctx.setFillColor(col("#000000", 0.25)); ctx.fillRect(new Rect(x, FY, OW, FH));
    rrect(ctx, x, FY + FH - 4, OW, 4, 0, col("#ffffff", 0.18));
    if (r.pct > 0) rrect(ctx, x, FY + FH - 4, Math.max(4, OW * r.pct), 4, 0, r.pct >= 1 ? col("#ffffff", 0.8) : col(ACCENT));
    text(ctx, fit(r.title, 11, OW - 4, 0.58), x, S1 + 8, OW + 30, Font.boldSystemFont(11), col("#ffffff", 0.9));
    text(ctx, fit(r.line, 9, OW, 0.52), x, S1 + 23, OW + 30, Font.mediumSystemFont(9), col("#ffffff", 0.5));
  });

  // playhead through the whole strip
  const p = barPct(c, info), PX = HX + Math.max(2, HW * p);
  rrect(ctx, PX - 1, S0 - 6, 2, S1 - S0 + 12, 1, col(ACCENT));
  poly(ctx, [[PX - 7, S0 - 12], [PX + 7, S0 - 12], [PX, S0 - 3]], col(ACCENT));
  const label = info.upNext ? `S${c.showSeason} · ${(c.seen || []).length}${c.seasonEpisodes ? "/" + c.seasonEpisodes : ""}` : c.duration ? `${tc(c.position)} / ${tc(c.duration)}` : "";
  if (label) { const lw = estW(label, 10, 0.6) + 18; const lx = Math.min(Math.max(HX, PX - lw / 2), HX + HW - lw); rrect(ctx, lx, S1 + 8, lw, 20, 10, col(ACCENT)); text(ctx, label, lx, S1 + 11, lw, Font.heavySystemFont(10), col("#ffffff"), "center"); }
  return ctx.getImage();
}

// ---------------- SHATTER: manga panels split by slanted gutters ----------------
// Progress is a fill level: the watched part of each panel is lit, the rest is dark,
// and a red line with a small tag marks where you are. No giant numbers.
async function drawShatter(c) {
  const ctx = xlCtx("#050304"), info = heroInfo(c); await xlImages(c);
  const rows = (c.rows || []).slice(0, 3);
  const HP = rows.length >= 3 ? 322 : 352;
  const B = [0, HP]; for (let i = 0; i < rows.length; i++) B.push(HP + (i + 1) * ((XW - HP) / rows.length)); B[B.length - 1] = XW;
  const SL = 18;
  const imgs = [c._bd || c._poster].concat(rows.map((r) => r._bd || r._img));
  const pcts = [barPct(c, info)].concat(rows.map((r) => r.pct || 0));
  const levels = [];
  for (let i = 0; i < B.length - 1; i++) {
    const x0 = B[i], x1 = B[i + 1], img = imgs[i], p = Math.max(0, Math.min(1, pcts[i]));
    if (img) ctx.drawImageInRect(cropTo(img, x1 - x0, XH, 0.3), new Rect(x0, 0, x1 - x0, XH)); else { ctx.setFillColor(col("#21181a")); ctx.fillRect(new Rect(x0, 0, x1 - x0, XH)); }
    // fill level: dark above the line, lit below it
    const ly = i === 0 ? 0 : Math.round(XH * (1 - p)); levels.push(ly);   // main panel uses the barcode instead
    if (i > 0) { ctx.setFillColor(col("#07030a", 0.72)); ctx.fillRect(new Rect(x0, 0, x1 - x0, ly)); }
    if (i === 0) { hgrad(ctx, x0, x1, 0, XH, "#000000", 0.75, 0); vgrad(ctx, x0, x1, 230, XH, "#000000", 0, 0.55); }
    else { vgrad(ctx, x0, x1, 0, 120, "#000000", 0.55, 0); vgrad(ctx, x0, x1, 210, XH, "#000000", 0, 0.8); }
  }
  // screentone dots, top-right of the hero panel
  for (let y = 10; y < 130; y += 9) for (let x = 230; x < 340; x += 9) { const k = ((x - 230) / 110) * (1 - (y - 10) / 120); if (k <= 0.05) continue; const r = 2.4 * k; const e = new Path(); e.addEllipse(new Rect(x - r, y - r, r * 2, r * 2)); ctx.addPath(e); ctx.setFillColor(col("#ffffff", 0.2)); ctx.fillPath(); }
  // level lines + tags (drawn before gutters so their ends tuck under the slant)
  for (let i = 1; i < B.length - 1; i++) {
    const p = pcts[i]; if (p <= 0.005 || p >= 0.995) continue;
    const ly = levels[i], x0 = B[i], x1 = B[i + 1];
    rrect(ctx, x0, ly - 1, x1 - x0, 2, 0, col(ACCENT));
    vgrad(ctx, x0, x1, ly, Math.min(XH, ly + 14), ACCENT, 0.28, 0);
    const tag = `${Math.round(p * 100)}%`, tw = estW(tag, 9, 0.62) + 12;
    const ty = ly < 30 ? ly + 6 : Math.min(ly - 22, 258), gwT = SL / 2 + 6, offT = SL / 2 - (SL * (ty + 16)) / XH;
    const rEdge = i === B.length - 2 ? XW - 12 : x1 + offT - gwT - 10;
    const tx = rEdge - tw;
    rrect(ctx, tx, ty, tw, 16, 8, col(ACCENT)); text(ctx, tag, tx, ty + 2, tw, Font.heavySystemFont(9), col("#ffffff"), "center");
  }
  // gutters
  for (let i = 1; i < B.length - 1; i++) {
    const m = B[i], gw = SL / 2 + 6;
    poly(ctx, [[m + SL / 2 - gw, 0], [m + SL / 2 + gw, 0], [m - SL / 2 + gw, XH], [m - SL / 2 - gw, XH]], col("#050304"));
    poly(ctx, [[m + SL / 2 - 1.5, 0], [m + SL / 2 + 1.5, 0], [m - SL / 2 + 1.5, XH], [m - SL / 2 - 1.5, XH]], col(i === 1 ? ACCENT : "#ffffff", i === 1 ? 1 : 0.25));
  }
  // hero panel text
  rrect(ctx, 24, 25, 7, 7, 3.5, col(ACCENT));
  text(ctx, info.kick, 37, 21, 260, Font.boldSystemFont(10), col("#ffffff", 0.85));
  await drawLogo(ctx, c, 24, 50, Math.min(260, HP - 60), 80, 54);
  text(ctx, fit(subLine(c, info), 12.5, 290, 0.55), 24, 142, 310, Font.semiboldSystemFont(12.5), col("#ffffff", 0.92));
  if (c.type === "series" && info.upNext) {
    const n = c.seasonEpisodes && c.seasonEpisodes <= 30 ? c.seasonEpisodes : null;
    text(ctx, info.notOut ? `E${c.showEpisode} in ${info.d} day${info.d === 1 ? "" : "s"}` : `Next: E${c.showEpisode}`, 24, 276, 300, Font.heavySystemFont(15), col("#ffffff"));
    if (n) { const seen = new Set(c.seen || []), gap = 3, tw = (290 - gap * (n - 1)) / n; for (let i = 1; i <= n; i++) rrect(ctx, 24 + (i - 1) * (tw + gap), 306 - (i === c.showEpisode ? 3 : 0), tw, i === c.showEpisode ? 10 : 5, 1.5, i === c.showEpisode ? col(ACCENT) : seen.has(i) ? col("#ffffff", 0.9) : col("#ffffff", 0.2)); }
  } else {
    text(ctx, leftText(c, info) || " ", 24, 282, 300, Font.heavySystemFont(15), col("#ffffff"));
    barcode(ctx, 24, 324, HP - 62, barPct(c, info), 50);
  }
  // other panels: number tag, title + line at the bottom.
  // The gutters slant (right at the top, left at the bottom), so the free space depends on height.
  const gw = SL / 2 + 6, off = (y) => SL / 2 - (SL * y) / XH;
  const span = (pi, y) => {
    const L = pi === 0 ? 0 : B[pi] + off(y) + gw, R = pi === B.length - 2 ? XW : B[pi + 1] + off(y) - gw;
    return [L, R];
  };
  rows.forEach((r, i) => {
    const [L1, R1] = span(i + 1, 310), [L0] = span(i + 1, 286);
    const x0 = Math.max(L0, L1) + 9, w = R1 - x0 - 8;
    text(ctx, String(i + 2).padStart(2, "0"), x0, 22, 40, Font.boldSystemFont(10), col(ACCENT));
    text(ctx, fit(r.title.toUpperCase(), 11.5, w, 0.64), x0, 286, w + 40, Font.heavySystemFont(11.5), col("#ffffff"));
    text(ctx, fit(r.line, 9, w, 0.5), x0, 303, w + 40, Font.mediumSystemFont(9), col("#ffffff", 0.65));
  });
  text(ctx, clock(), XW - 24 - 200, XH - 24, 200, Font.boldSystemFont(8.5), col("#ffffff", 0.4), "right");
  return ctx.getImage();
}

// ---------------- RADAR: your shows as blips (distance = how recent, angle = how far in) ----------------
async function drawRadar(c) {
  const PANEL = "#0b0708";
  const ctx = xlCtx(PANEL), info = heroInfo(c); await xlImages(c);
  // hero, left
  const HW = 400;
  if (c._bd) ctx.drawImageInRect(cropTo(c._bd, HW, XH, 0.3), new Rect(0, 0, HW, XH));
  hgrad(ctx, 0, HW, 0, XH, PANEL, 0.82, 0.25); hgrad(ctx, HW - 120, HW, 0, XH, PANEL, 0, 1); vgrad(ctx, 0, HW, 180, XH, PANEL, 0, 0.85);
  rrect(ctx, 26, 27, 7, 7, 3.5, col(ACCENT));
  text(ctx, "NUVIO RADAR  ·  " + info.kick, 39, 23, 340, Font.boldSystemFont(10), col("#ffffff", 0.85));
  await drawLogo(ctx, c, 26, 52, 260, 72, 50);
  text(ctx, fit(subLine(c, info), 12.5, 300, 0.55), 26, 134, 330, Font.semiboldSystemFont(12.5), col("#ffffff", 0.9));
  const ov = c.overview || "";
  text(ctx, pctText(c, info), 22, 200, 260, COND(84), col("#ffffff"));
  text(ctx, leftText(c, info), 26, 296, 300, Font.mediumSystemFont(11), col("#ffffff", 0.7));
  barcode(ctx, 26, 330, 300, barPct(c, info), 60);

  // radar, right
  const CX = 565, CY = 179, R = 152;
  const now = Date.now(), WEEK = 7 * 86400e3;
  const items = [{ hero: true, title: c.title, pct: barPct(c, info), when: c.when, _img: c._poster || c._bd }].concat((c.rows || []).slice(0, 6));
  // sweep wedge, trailing the hero's angle
  const ha = -90 + 360 * items[0].pct;
  for (let k = 0; k < 40; k++) {
    const a0 = (ha - 50 + k * 1.25) * Math.PI / 180, a1 = (ha - 50 + (k + 1) * 1.25 + 0.4) * Math.PI / 180;
    poly(ctx, [[CX, CY], [CX + R * Math.cos(a0), CY + R * Math.sin(a0)], [CX + R * Math.cos(a1), CY + R * Math.sin(a1)]], col(ACCENT, 0.008 + 0.0075 * k));
  }
  for (const rr of [R / 3, (2 * R) / 3, R]) strokeCircle(ctx, CX, CY, rr, col(ACCENT, rr === R ? 0.55 : 0.25), rr === R ? 1.5 : 1);
  rrect(ctx, CX - R, CY - 0.5, R * 2, 1, 0, col("#ffffff", 0.08)); rrect(ctx, CX - 0.5, CY - R, 1, R * 2, 0, col("#ffffff", 0.08));
  for (let a = 0; a < 360; a += 10) { const t = a * Math.PI / 180, r0 = R + 3, r1 = R + (a % 90 === 0 ? 11 : 6); const p = new Path(); p.move(new Point(CX + r0 * Math.cos(t), CY + r0 * Math.sin(t))); p.addLine(new Point(CX + r1 * Math.cos(t), CY + r1 * Math.sin(t))); ctx.addPath(p); ctx.setStrokeColor(col("#ffffff", 0.3)); ctx.setLineWidth(1); ctx.strokePath(); }
  // sweep edge
  { const t = ha * Math.PI / 180; const p = new Path(); p.move(new Point(CX, CY)); p.addLine(new Point(CX + R * Math.cos(t), CY + R * Math.sin(t))); ctx.addPath(p); ctx.setStrokeColor(col(ACCENT, 0.9)); ctx.setLineWidth(1.5); ctx.strokePath(); }
  for (const [rr, t] of [[R / 3, "TODAY"], [(2 * R) / 3, "3 DAYS"], [R, "1 WEEK"]]) { const a = 135 * Math.PI / 180; text(ctx, t, CX + rr * Math.cos(a) - 64, CY + rr * Math.sin(a) - 4, 60, Font.boldSystemFont(7), col("#ffffff", 0.35), "right"); }
  text(ctx, "START", CX - 30, CY - R - 26, 60, Font.boldSystemFont(7), col(ACCENT, 0.85), "center");
  // blips: place, then nudge clockwise until nothing overlaps; labels flip side or hide if crowded
  const placed = [], labels = [];
  const hit = (a, b2) => a.x < b2.x + b2.w && b2.x < a.x + a.w && a.y < b2.y + b2.h && b2.y < a.y + a.h;
  items.forEach((it) => {
    const age = Math.min(1, Math.max(0, (now - (it.when || now)) / WEEK));
    const rad = (it.hero ? 0.22 : 0.34) * R + age * (0.6 * R), br = it.hero ? 21 : 14;
    let ang = -90 + 360 * Math.min(0.97, it.pct || 0), bx, by;
    for (let k = 0; k < 24; k++) {
      const t = ang * Math.PI / 180; bx = CX + rad * Math.cos(t); by = CY + rad * Math.sin(t);
      if (!placed.some((q) => Math.hypot(q.x - bx, q.y - by) < q.r + br + 10)) break;
      ang += 360 / 24 * (k % 2 ? 1 : 1.3);
    }
    placed.push({ x: bx, y: by, r: br, it });
  });
  for (const q of placed) labels.push({ x: q.x - q.r - 2, y: q.y - q.r - 2, w: (q.r + 2) * 2, h: (q.r + 2) * 2 });
  placed.forEach((q) => {
    const it = q.it, bx = q.x, by = q.y, br = q.r;
    if (it._img) { ctx.drawImageInRect(cropTo(it._img, br * 2, br * 2, 0.2), new Rect(bx - br, by - br, br * 2, br * 2)); strokeCircle(ctx, bx, by, br + 5, col(PANEL), 10); }
    else { const e = new Path(); e.addEllipse(new Rect(bx - br, by - br, br * 2, br * 2)); ctx.addPath(e); ctx.setFillColor(col("#2a1f21")); ctx.fillPath(); }
    strokeCircle(ctx, bx, by, br + 1, it.hero ? col(ACCENT) : col("#ffffff", 0.5), it.hero ? 2.5 : 1.2);
    if (it.hero) strokeCircle(ctx, bx, by, br + 7, col(ACCENT, 0.35), 1);
  });
  placed.forEach((q) => {
    const it = q.it, bx = q.x, by = q.y, br = q.r;
    const t1 = fit(it.title || "", 9.5, 104, 0.58);
    const t2 = it.hero ? (info.upNext ? "up next" : `${Math.round(it.pct * 100)}%`) : `${Math.round((it.pct || 0) * 100)}% · ${ago(it.when || now)}`;
    const lw = Math.max(estW(t1, 9.5, 0.58), estW(t2, 8, 0.55)) + 4;
    const prefRight = bx >= CX - 20;
    for (const right of [prefRight, !prefRight]) {
      const box = { x: right ? bx + br + 6 : bx - br - 6 - lw, y: by - 13, w: lw, h: 26 };
      if (box.x < 408 || box.x + box.w > XW - 6 || labels.some((l) => hit(l, box))) continue;
      labels.push(box);
      text(ctx, t1, box.x, by - 12, lw + 20, Font.boldSystemFont(9.5), col("#ffffff", it.hero ? 1 : 0.85), right ? "left" : "left");
      text(ctx, t2, box.x, by + 1, lw + 20, Font.mediumSystemFont(8), col(it.hero ? ACCENT : "#ffffff", it.hero ? 1 : 0.5), "left");
      break;
    }
  });
  { const e = new Path(); e.addEllipse(new Rect(CX - 3, CY - 3, 6, 6)); ctx.addPath(e); ctx.setFillColor(col(ACCENT)); ctx.fillPath(); }
  text(ctx, "closer = more recent  ·  clockwise = further in", XW - 18 - 190, XH - 22, 190, Font.mediumSystemFont(8), col("#ffffff", 0.35), "right");
  text(ctx, clock(), XW - 18 - 150, 14, 150, Font.boldSystemFont(9), col("#ffffff", 0.4), "right");
  return ctx.getImage();
}

// =====================================================================
// LOCK SCREEN (single-tint: everything is white at different strengths)
// =====================================================================
const lw_ = (a) => new Color("#ffffff", a);
const trackT = (t) => (t || "").split("").join(" ");
function lockCtx(w, h) { const c = new DrawContext(); c.size = new Size(w, h); c.respectScreenScale = true; c.opaque = false; return c; }
function sfW(str, fs) { let w = 0; for (const ch of str || "") { if (ch === " ") w += fs * 0.28; else if (/[ilIjtf.,!:;'|]/.test(ch)) w += fs * 0.30; else if (/[mwMW]/.test(ch)) w += fs * 0.85; else if (/[A-Z0-9]/.test(ch)) w += fs * 0.62; else w += fs * 0.54; } return w; }
async function lockLogo(c) {
  if (!c.logo) return null;
  // bri=255 pushes a coloured logo to white: dark art vanishes on the single-tint lock screen
  return await loadImage("https://wsrv.nl/?url=" + encodeURIComponent(c.logo.replace("/w500/", "/w300/")) + "&output=png&bri=255");
}
function lockFacts(c) {
  const info = heroInfo(c), n = c.seasonEpisodes && c.seasonEpisodes >= 2 && c.seasonEpisodes <= 26 ? c.seasonEpisodes : null;
  const tag = info.watched ? "WATCHED" : c.type === "movie" ? "MOVIE" : info.upNext ? `E${c.showEpisode} NEXT` : `S${c.showSeason}E${c.showEpisode}`;
  const big = info.watched ? "✓" : info.upNext ? (info.notOut ? `${info.d}D` : `E${c.showEpisode}`) : String(Math.round(info.pct * 100));
  const unit = info.upNext || info.watched ? "" : "%";
  const epsLeft = n ? Math.max(0, n - (c.seen || []).length) : null;
  const note = info.watched ? `WATCHED ${ago(c.when).toUpperCase()}` : info.upNext ? (info.notOut ? "AIRS SOON" : epsLeft != null ? `${epsLeft} EP${epsLeft === 1 ? "" : "S"} LEFT IN S${c.showSeason}` : "UP NEXT")
    : info.left ? `${hm(info.left).toUpperCase()} LEFT` : "NOW WATCHING";
  return { info, n, tag, big, unit, note };
}
function lockTitle(ctx, c, logo, x, y, tw, th) {
  if (logo) { const s = Math.min(tw / logo.size.width, th / logo.size.height); ctx.drawImageInRect(logo, new Rect(x, y + (th - logo.size.height * s) / 2, logo.size.width * s, logo.size.height * s)); return; }
  const t = c.title || "Untitled"; let fs = 15; while (fs > 10 && sfW(t, fs) > tw) fs -= 1;
  ctx.setFont(Font.boldSystemFont(fs)); ctx.setTextColor(lw_(1)); ctx.setTextAlignedLeft();
  ctx.drawTextInRect(fit(t, fs, tw, 0.56), new Rect(x, y + (th - fs) / 2 - 1, tw + 20, fs + 6));
}
function lockPill(ctx, tag, W) {
  const pw = Math.max(30, sfW(tag, 8.5) + 16);
  ctx.setStrokeColor(lw_(1)); ctx.setLineWidth(1.4);
  const pp = new Path(); pp.addRoundedRect(new Rect(W - 1 - pw, 5, pw, 14), 7, 7); ctx.addPath(pp); ctx.strokePath();
  ctx.setTextAlignedCenter(); ctx.setFont(Font.boldSystemFont(8.5)); ctx.setTextColor(lw_(1));
  ctx.drawTextInRect(trackT(tag), new Rect(W - 1 - pw - 10, 7, pw + 20, 12)); ctx.setTextAlignedLeft();
  return pw;
}
function lockBottom(ctx, f, W) {
  const fs = 21; ctx.setFont(Font.boldSystemFont(fs)); ctx.setTextColor(lw_(1)); ctx.setTextAlignedLeft();
  ctx.drawTextInRect(f.big, new Rect(1, 47, 80, 28));
  if (f.unit) { ctx.setFont(Font.boldSystemFont(10)); ctx.setTextColor(lw_(0.8)); ctx.drawTextInRect(f.unit, new Rect(1 + sfW(f.big, fs) * 1.05 + 1, 54, 20, 14)); }
  ctx.setTextAlignedRight(); ctx.setFont(Font.boldSystemFont(8)); ctx.setTextColor(lw_(0.8));
  ctx.drawTextInRect(trackT(f.note), new Rect(W - 140, 57, 139, 12)); ctx.setTextAlignedLeft();
}

// RECTANGLE A: the original "ticks" design (one tick per episode)
async function drawLockTicks(c) {
  const W = 172, H = 76, ctx = lockCtx(W, H), f = lockFacts(c), logo = await lockLogo(c);
  const pw = lockPill(ctx, f.tag, W);
  lockTitle(ctx, c, logo, 1, 3, W - 2 - pw - 8, 24);
  const by = 34, bh = 8, bw = W - 2;
  if (c.type === "series" && f.n) {
    const seen = new Set(c.seen || []), gap = 1.4, w = (bw - gap * (f.n - 1)) / f.n;
    for (let i = 1; i <= f.n; i++) {
      const cur = i === c.showEpisode && !f.info.upNext;
      rrect(ctx, 1 + (i - 1) * (w + gap), by, w, bh, 1.6, lw_(seen.has(i) ? 1 : 0.25));
      if (cur && f.info.pct > 0) rrect(ctx, 1 + (i - 1) * (w + gap), by, Math.max(1.5, w * f.info.pct), bh, 1.6, lw_(1));   // partly-watched tick
      if (i === c.showEpisode) rrect(ctx, 1 + (i - 1) * (w + gap), by + bh + 2, w, 2, 1, lw_(1));                         // marker under the current one
    }
  } else {
    // Movies (and shows without an episode count): still ticks, one per ~5 minutes of runtime (max 26)
    const p = barPct(c, f.info), mins_ = c.duration ? c.duration / 60000 : (c.runtime || 120);
    const n = Math.max(12, Math.min(26, Math.round(mins_ / 5))), gap = 1.4, w = (bw - gap * (n - 1)) / n;
    const done = p * n, full = Math.floor(done);
    for (let i = 0; i < n; i++) {
      rrect(ctx, 1 + i * (w + gap), by, w, bh, 1.6, lw_(i < full ? 1 : 0.25));
      if (i === full && done > full) {
        rrect(ctx, 1 + i * (w + gap), by, Math.max(1.5, w * (done - full)), bh, 1.6, lw_(1));
        rrect(ctx, 1 + i * (w + gap), by + bh + 2, w, 2, 1, lw_(1));
      }
    }
  }
  lockBottom(ctx, f, W);
  return ctx.getImage();
}

// RECTANGLE B: barcode, matching the home-screen + Mac widgets
async function drawLockBarcode(c) {
  const W = 172, H = 76, ctx = lockCtx(W, H), f = lockFacts(c), logo = await lockLogo(c);
  const pw = lockPill(ctx, f.tag, W);
  lockTitle(ctx, c, logo, 1, 3, W - 2 - pw - 8, 24);
  const p = barPct(c, f.info), n = 34, step = (W - 2) / n;
  for (let i = 0; i < n; i++) { const h = [12, 8, 12, 5, 12, 9][i % 6]; rrect(ctx, 1 + i * step, 44 - h, Math.max(1.6, step * 0.45), h, 0.6, lw_(i / n < p ? 1 : 0.28)); }
  lockBottom(ctx, f, W);
  return ctx.getImage();
}

// CIRCLE: progress ring + % (or next episode)
async function drawLockCircle(c) {
  const S = 76, m = S / 2, ctx = lockCtx(S, S), f = lockFacts(c), p = barPct(c, f.info);
  strokeCircle(ctx, m, m, 33, lw_(0.3), 5);
  if (p > 0) { const seg = Math.max(2, Math.round(90 * p)), ap = new Path(); for (let i = 0; i <= seg; i++) { const a = (-90 + 360 * p * (i / seg)) * Math.PI / 180, pt = new Point(m + 33 * Math.cos(a), m + 33 * Math.sin(a)); if (i === 0) ap.move(pt); else ap.addLine(pt); } ctx.setStrokeColor(lw_(1)); ctx.setLineWidth(5); ctx.addPath(ap); ctx.strokePath(); }
  ctx.setTextAlignedCenter();
  ctx.setFont(Font.boldSystemFont(f.unit ? 19 : 18)); ctx.setTextColor(lw_(1));
  ctx.drawTextInRect(f.big + f.unit, new Rect(4, m - 16, S - 8, 24));
  ctx.setFont(Font.boldSystemFont(7.5)); ctx.setTextColor(lw_(0.7));
  const sub = c.type === "movie" ? (f.info.left ? `${hm(f.info.left).replace(" ", "")} LEFT` : "MOVIE") : f.info.upNext ? "NEXT" : `S${c.showSeason}E${c.showEpisode}`;
  ctx.drawTextInRect(sub.toUpperCase(), new Rect(6, m + 7, S - 12, 12));
  return ctx.getImage();
}

// INLINE (the line above the clock): text only
function lockInline(c) {
  const f = lockFacts(c);
  if (f.info.watched) return `✓ ${c.title} · watched ${ago(c.when)}`;
  if (c.type === "movie") return `▶ ${c.title}${f.info.left ? " · " + hm(f.info.left) + " left" : ""}`;
  if (f.info.upNext) return `▶ ${c.title} · E${c.showEpisode} next`;
  return `▶ ${c.title} S${c.showSeason}E${c.showEpisode}${f.info.left ? " · " + hm(f.info.left) + " left" : ""}`;
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
// iOS 26 Clear/Tinted home screens remove a widget's BACKGROUND entirely (blank widget).
// Content survives (iOS recolours it), so the artwork goes in as a full-bleed content image.
// Set to false to go back to a plain background image.
const GLASS_SAFE = true;
function setArt(w, img) {
  if (!GLASS_SAFE) { w.backgroundImage = img; return; }
  w.setPadding(0, 0, 0, 0);
  const wi = w.addImage(img);
  wi.resizable = true;
  wi.applyFillingContentMode();
  wi.centerAlignImage();
}

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
    if (e.auth) w.url = `scriptable:///run/${encodeURIComponent(Script.name() || SCRIPT_NAME)}`;
  }
  if (IS_LOCK) {
    if (problem || !card) { const t = w.addText(problem ? problem[0] : "Nuvio"); t.font = Font.boldSystemFont(11); return w; }
    try {
      if (FAMILY === "accessoryInline") w.addText(lockInline(card));
      else {
        const img = FAMILY === "accessoryCircular" ? await drawLockCircle(card) : LOCK_STYLE === "barcode" ? await drawLockBarcode(card) : await drawLockTicks(card);
        const im = w.addImage(img); im.centerAlignImage(); im.applyFittingContentMode();
      }
      w.url = deepLink(card);
    } catch (e) { w.addText("Nuvio: " + String(e.message || e).slice(0, 40)); }
    return w;
  }
  try {
    if (problem) setArt(w, messageCard(problem[0], problem[1]));
    else {
      const hasRows = card.rows && card.rows.length;
      if (IS_XL) { const xd = XL_LAYOUT === "reel" ? drawReel : XL_LAYOUT === "shatter" ? drawShatter : drawRadar; setArt(w, await xd(card)); w.url = deepLink(card); return w; }
      const draw = LAYOUT === "classic" ? drawClassic : LAYOUT === "slash" ? drawSlash : LAYOUT === "ticket" ? drawTicket
        : LAYOUT === "shelf" ? drawShelf : LAYOUT === "split" && hasRows ? drawSplit : drawCard;
      setArt(w, await draw(card)); w.url = deepLink(card);
    }
  } catch (e) {
    setArt(w, messageCard("Widget error", String(e.message || e).slice(0, 120)));
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
  const a = new Alert(); a.title = "Connection check (v14)"; a.message = lines.join("\n\n"); a.addAction("Copy"); a.addCancelAction("Close");
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

// Sign-in page. (Scriptable's pop-up text fields return nothing on recent iOS, so this uses a
// small web form instead. It also lets iOS Passwords autofill your Nuvio login.)
const LOGIN_HTML = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<style>
 :root{color-scheme:dark} *{box-sizing:border-box;font-family:-apple-system,system-ui,sans-serif}
 body{margin:0;min-height:100vh;background:radial-gradient(120% 60% at 80% 0%,#3a0d0b 0%,#0b0809 60%);color:#fff;display:flex;align-items:center;justify-content:center;padding:28px}
 .card{width:100%;max-width:380px}
 .k{display:flex;align-items:center;gap:8px;font:700 12px/1 -apple-system;letter-spacing:.12em;color:#ffffffb0}
 .dot{width:8px;height:8px;border-radius:4px;background:${ACCENT}}
 h1{font:800 30px/1.1 -apple-system;margin:14px 0 6px} p{color:#ffffff99;font-size:14px;line-height:1.45;margin:0 0 22px}
 input{width:100%;font-size:17px;padding:15px 16px;margin:0 0 10px;border-radius:14px;border:1px solid #ffffff22;background:#ffffff10;color:#fff;outline:none}
 input:focus{border-color:${ACCENT}}
 button{width:100%;margin-top:6px;padding:15px;border:0;border-radius:14px;background:${ACCENT};color:#fff;font:700 17px -apple-system}
 button:disabled{opacity:.5} #msg{min-height:22px;margin-top:14px;font-size:14px;color:#ff8a80;line-height:1.4} #msg.ok{color:#9be59b}
</style></head><body><form class="card" id="f" autocomplete="on">
 <div class="k"><span class="dot"></span>NUVIO</div><h1>Sign in</h1>
 <p>Your password goes straight to Nuvio and isn't saved. Only a login pass is kept, so your widgets stay signed in.</p>
 <input id="e" type="email" name="email" autocomplete="username" placeholder="Email" autocapitalize="none" autocorrect="off" required>
 <input id="p" type="password" name="password" autocomplete="current-password" placeholder="Password" required>
 <button id="b" type="submit">Sign in</button><div id="msg"></div></form>
<script>
 window.__pending=null;
 document.getElementById("f").addEventListener("submit",function(ev){ev.preventDefault();
  var v={email:document.getElementById("e").value.trim(),password:document.getElementById("p").value};
  if(!v.email||!v.password)return; document.getElementById("b").disabled=true; setMsg("Signing in…",true);
  if(window.__pending){var c=window.__pending;window.__pending=null;c(v);} else window.__queued=v;});
 function setMsg(t,ok){var m=document.getElementById("msg");m.textContent=t;m.className=ok?"ok":"";}
 function fail(t){setMsg(t,false);document.getElementById("b").disabled=false;}
</script></body></html>`;

const niceSignInError = (e) => {
  const m = String((e && e.message) || e);
  return /invalid_credentials|Invalid login/i.test(m)
    ? "Wrong email or password. (If you normally use Google or Apple to sign in to Nuvio, there's no password on this account yet.)"
    : /not.confirmed/i.test(m) ? "This email isn't confirmed yet. Check your inbox for Nuvio's email." : m;
};
const say = async (title, msg) => { const x = new Alert(); x.title = title; x.message = String(msg); x.addAction("OK"); await x.presentAlert(); };
const str = (v) => (typeof v === "string" ? v : "");

// Way 1: the normal pop-up. Some iOS versions return nothing from its text boxes; then we use way 2.
async function alertSignIn() {
  for (let tries = 0; tries < 3; tries++) {
    const a = new Alert();
    a.title = "Sign in to Nuvio (v14)";
    a.message = "Your password goes straight to Nuvio and isn't saved. Only a login pass is kept, so the widgets stay signed in.";
    a.addTextField("Email");
    a.addSecureTextField("Password");
    a.addAction("Sign in");
    a.addCancelAction("Cancel");
    let idx;
    try { idx = await a.presentAlert(); } catch (e) { return { broken: true }; }
    if (idx === -1) return { cancelled: true };
    let email = "", password = "";
    try { email = str(a.textFieldValue(0)).trim(); password = str(a.textFieldValue(1)); } catch (e) {}
    if (!email || !password) return { broken: true };
    try { return { session: await signIn(email, password) }; }
    catch (e) { await say("Couldn't sign in", niceSignInError(e)); }
  }
  return { cancelled: true };
}

// Way 2: a small sign-in page. The sheet is opened FIRST and the page loaded into it
// (loading before presenting showed an empty sheet on iOS 26).
async function webSignIn() {
  const wv = new WebView();
  let closed = false;
  const shown = wv.present(false).then(() => { closed = true; return null; });
  await wv.loadHTML(LOGIN_HTML);
  const waitSubmit = () => wv.evaluateJavaScript(
    // Wrapped so the snippet itself evaluates to undefined: Scriptable rejects a function as a result.
    "(function () { if (window.__queued) { var q = window.__queued; window.__queued = null; completion(q); } else { window.__pending = completion; } })();", true);
  let s = null;
  while (!closed && !s) {
    const v = await Promise.race([waitSubmit(), shown]);
    if (!v || closed) break;
    try { s = await signIn(str(v.email), str(v.password)); }
    catch (e) { try { await wv.evaluateJavaScript("fail(" + JSON.stringify(niceSignInError(e)) + "); null;"); } catch (x) {} }
  }
  if (s) {
    try { await wv.evaluateJavaScript("setMsg(" + JSON.stringify("✓ Signed in. Close this page (top-left) to continue.") + ", true); null;"); } catch (x) {}
    await shown;
  }
  return s;
}

async function signInFlow() {
  const r = await alertSignIn();
  if (r.cancelled) return false;
  let s = r.session || null;
  if (!s && r.broken) {
    s = await webSignIn();
    if (!s) await say("Not signed in", "The sign-in page was closed before signing in. If it showed up blank, screenshot this and send it to Claude.");
  }
  if (!s) return false;
  // Save the login FIRST, so a later hiccup (profiles) never throws it away.
  s.profile = 1; s.profileName = "Main";
  const w1 = writeSession(s);
  if (!w1.ok) { await say("Signed in, but couldn't save the login", w1.errs.join("\n")); return false; }
  try { await chooseProfile(s); writeSession(s); }
  catch (e) { await say("Signed in ✓", "Couldn't load your Nuvio profiles, so using profile 1.\n\n" + (e.detail || e.message || e)); }
  if (!(await readSession())) { await say("Signed in, but the login didn't stick", "Saved it, but couldn't read it back. Send Claude a screenshot."); return false; }
  return true;
}

// In-app: rectangle + circle on a dark plate, scaled up (lock widgets can't be previewed directly)
async function previewLock() {
  const card = await loadCard(await liveSession());
  if (!card) return;
  const k = 3, pv = new DrawContext(); pv.size = new Size(300 * k, 130 * k); pv.opaque = true; pv.respectScreenScale = false;
  pv.setFillColor(new Color("#1b0b0b")); pv.fillRect(new Rect(0, 0, 300 * k, 130 * k));
  const r = LOCK_STYLE === "barcode" ? await drawLockBarcode(card) : await drawLockTicks(card), c = await drawLockCircle(card);
  pv.drawImageInRect(r, new Rect(20 * k, 27 * k, 172 * k, 76 * k)); pv.drawImageInRect(c, new Rect(206 * k, 27 * k, 76 * k, 76 * k));
  pv.setFont(Font.semiboldSystemFont(11 * k)); pv.setTextColor(new Color("#ffffff", 0.7)); pv.drawText(lockInline(card), new Point(20 * k, 6 * k));
  await QuickLook.present(pv.getImage());
}

async function main() {
  if (config.runsInWidget) { Script.setWidget(await buildWidget()); Script.complete(); return; }
  let s = await readSession();
  if (!s) { if (!(await signInFlow())) return Script.complete(); await diagnose(); }
  else {
    const a = new Alert();
    a.title = "Nuvio Up Next (v14)";
    a.message = `Signed in · profile: ${s.profileName || s.profile || 1}`;
    a.addAction("Preview widget");
    a.addAction("Switch profile");
    a.addDestructiveAction("Sign out");
    a.addAction("Check connection");
    a.addAction("Preview lock screen");
    a.addCancelAction("Close");
    const i = await a.presentSheet();
    if (i === 3) { await diagnose(); return Script.complete(); }
    if (i === 4) { await previewLock(); return Script.complete(); }
    if (i === 1) { try { const live = await liveSession(); await chooseProfile(live); writeSession(live); } catch (e) {} }
    else if (i === 2) {
      try { const live = await liveSession(); await nuvioReq("/auth/v1/logout", {}, live.access_token); } catch (e) {}
      clearSession(); return Script.complete();
    } else if (i !== 0) return Script.complete();
  }
  const w = await buildWidget();
  if (IS_XL) await w.presentExtraLarge(); else await w.presentMedium();
  Script.complete();
}

try { await main(); }
catch (e) {
  if (config.runsInWidget) throw e;
  const x = new Alert(); x.title = "Nuvio Up Next error"; x.message = (String((e && e.message) || e) + (e && e.line ? `\n(line ${e.line})` : "") + "\n\n" + String((e && e.stack) || "")).slice(0, 600); x.addAction("OK"); await x.presentAlert();
  Script.complete();
}
