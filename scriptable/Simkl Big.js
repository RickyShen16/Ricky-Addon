// ============================================
// SIMKL BIG — large widget (Scriptable)
// Same design as the Mac desktop card: backdrop hero, poster, episode
// ticks, and a 2×2 "recently watched" grid. Shows on the iPhone home
// screen AND on the Mac (System Settings → Desktop & Dock → Widgets →
// "Use iPhone widgets"), with nothing running on the Mac.
//
// SETUP: needs "Simkl Radar" linked once (it reads the same token).
// On a Mac: run "Simkl Big" once on the iPhone first; it copies the login to iCloud for the Mac.
// Paste into Scriptable, name it "Simkl Big", add a LARGE Scriptable
// (or EXTRA LARGE, on Mac/iPad) widget, set Script = Simkl Big.
// It draws the matching layout for each size. Tap = resume in Nuvio.
// ============================================

const CLIENT_ID = "70a1d2b1c1b5c2ed32bd9bbd498b5cc8e00d2a0d0ddf0f29849472492b0889ce";
const ACCENT = "#ff4b3e";            // live dot + next-episode tick
const WATCH_APP = "nuvio";           // "nuvio" | "simkl"  (what a tap opens)
// Free TMDB key (themoviedb.org → Settings → API): official title logos and clean scene stills
// for the extra-large layout. Without it, it falls back to Simkl art and text titles.
const TMDB_KEY = "";

const API = "https://api.simkl.com";
// The Simkl login lives in Scriptable's local folder on the phone ("Simkl Radar" saves it there).
// A Mac running Scriptable can't see that folder, so the phone also copies it to Scriptable's
// iCloud folder, and the Mac reads it from there.
const TOKEN_FILE = "simkl-token.txt";
async function findToken() {
  let icloud = null, ip = null;
  try { icloud = FileManager.iCloud(); ip = icloud.joinPath(icloud.documentsDirectory(), TOKEN_FILE); } catch (e) { icloud = null; }
  const local = FileManager.local(), lp = local.joinPath(local.documentsDirectory(), TOKEN_FILE);
  if (local.fileExists(lp)) {
    const t = local.readString(lp).trim();
    if (t) {
      if (icloud) { try { if (!icloud.fileExists(ip) || icloud.readString(ip).trim() !== t) icloud.writeString(ip, t); } catch (e) {} }
      return t;
    }
  }
  if (icloud) {
    try {
      if (icloud.fileExists(ip)) { await icloud.downloadFileFromiCloud(ip); const t = icloud.readString(ip).trim(); if (t) return t; }
    } catch (e) {}
  }
  return null;
}
const token = await findToken();

// ---------- data ----------
async function getJSON(path, auth) {
  const r = new Request(API + path + (path.includes("?") ? "&" : "?") + "_=" + Date.now());
  r.headers = Object.assign({ "Content-Type": "application/json", "simkl-api-key": CLIENT_ID },
    auth ? { "Authorization": "Bearer " + token } : {});
  r.timeoutInterval = 20;
  return await r.loadJSON();
}
async function loadImage(url) {
  if (!url) return null;
  try { const r = new Request(url); r.timeoutInterval = 15; return await r.loadImage(); } catch (e) { return null; }
}
const posterUrl = (p) => p ? "https://simkl.in/posters/" + p + "_m.jpg" : null;
// pre-shrunk to 1100 px: the full 1920×1080 file costs ~8 MB decoded, and widgets only get ~30 MB in total
const fanartUrl = (f) => f ? "https://wsrv.nl/?url=simkl.in/fanart/" + f + "_medium.jpg&w=1100&output=jpg&q=82" : null;
// no fanart → the poster, heavily blurred, as an ambient backdrop
const blurPosterUrl = (p) => p ? "https://wsrv.nl/?url=simkl.in/posters/" + p + "_m.jpg&w=400&blur=30&output=jpg" : null;

function nextLabel(ne, kind, watched) {
  if (kind === "movie") return null;
  if (typeof ne === "string" && ne) return ne.replace(/S0*(\d+)E0*(\d+)/i, "S$1E$2").toUpperCase();
  if (ne && ne.episode != null) return (ne.season != null ? "S" + ne.season + "E" : "E") + ne.episode;
  return watched != null ? "E" + (watched + 1) : null;
}

async function loadItems() {
  const g = (p, fb) => getJSON(p, true).catch(() => fb);
  const [sw, sd, aw, ad, md, pb] = await Promise.all([
    g("/sync/all-items/shows/watching?extended=full", {}), g("/sync/all-items/shows/completed?extended=full", {}),
    g("/sync/all-items/anime/watching?extended=full", {}), g("/sync/all-items/anime/completed?extended=full", {}),
    g("/sync/all-items/movies/completed?extended=full", {}), g("/sync/playback/movies?extended=full", []),
  ]);
  const out = [];
  const add = (obj, kind, finished) => {
    for (const it of (obj && (obj.shows || obj.anime || obj.movies)) || []) {
      const s = it.show || it.anime || it.movie || {};
      const total = kind === "movie" ? null : (s.total_episodes_count || it.total_episodes_count || null);
      const watched = kind === "movie" ? null : (finished ? total : (it.watched_episodes_count != null ? it.watched_episodes_count : null));
      out.push({ kind, finished, title: s.title || "Untitled", year: s.year || null, poster: s.poster || null,
        fanart: s.fanart || null, runtime: s.runtime || null, total, watched,
        next: finished ? null : nextLabel(it.next_to_watch || it.next_episode || null, kind, watched),
        last: it.last_watched_at || null, ids: s.ids || {} });
    }
  };
  add(md, "movie", true); add(sw, "tv", false); add(sd, "tv", true); add(aw, "anime", false); add(ad, "anime", true);
  for (const it of Array.isArray(pb) ? pb : []) {
    const m = it.movie; if (!m) continue;
    out.push({ kind: "movie", finished: false, title: m.title || "Untitled", year: m.year || null, poster: m.poster || null,
      fanart: m.fanart || null, runtime: m.runtime || null, total: 100, watched: Math.round(it.progress || 0),
      next: null, last: it.paused_at || null, ids: m.ids || {} });
  }
  const seen = {};
  return out.filter((x) => x.last).sort((a, b) => Date.parse(b.last) - Date.parse(a.last))
    .filter((x) => { const k = x.kind + ":" + x.title.toLowerCase(); if (seen[k]) return false; seen[k] = true; return true; });
}

// the sync lists often omit fanart and details; fetch them for the hero (public endpoint)
async function heroDetail(s) {
  if (!s.ids || !s.ids.simkl) return {};
  const type = s.kind === "movie" ? "movies" : s.kind === "anime" ? "anime" : "tv";
  try {
    const r = new Request(API + "/" + type + "/" + s.ids.simkl + "?extended=full&client_id=" + CLIENT_ID);
    r.timeoutInterval = 12;
    const d = await r.loadJSON() || {};
    const rating = d.ratings && d.ratings.simkl && d.ratings.simkl.rating;
    return { fanart: s.fanart || d.fanart || null, overview: d.overview || "", genres: d.genres || [], rating: rating || null,
      tmdb: (s.ids && s.ids.tmdb) || (d.ids && d.ids.tmdb) || null };
  } catch (e) { return { fanart: s.fanart || null }; }
}

// TMDB: official title logo + a textless backdrop
async function tmdbArt(s, tmdbId) {
  if (!TMDB_KEY) return {};
  const type = s.kind === "movie" ? "movie" : "tv";
  try {
    let id = tmdbId || (s.ids && s.ids.tmdb);
    if (!id) {
      const q = new Request("https://api.themoviedb.org/3/search/" + type + "?api_key=" + TMDB_KEY + "&query=" + encodeURIComponent(s.title) + (s.year ? (type === "movie" ? "&year=" : "&first_air_date_year=") + s.year : ""));
      q.timeoutInterval = 12;
      const j = await q.loadJSON(); id = j.results && j.results[0] && j.results[0].id;
    }
    if (!id) return {};
    const r = new Request("https://api.themoviedb.org/3/" + type + "/" + id + "/images?api_key=" + TMDB_KEY + "&include_image_language=en,null");
    r.timeoutInterval = 12;
    const j = await r.loadJSON();
    const byVote = (a, b) => (b.vote_average || 0) - (a.vote_average || 0);
    const logos = (j.logos || []).filter((l) => l.file_path && !/\.svg$/i.test(l.file_path)).sort(byVote);
    let bds = (j.backdrops || []).filter((b) => !b.iso_639_1); if (!bds.length) bds = j.backdrops || [];
    bds.sort(byVote);
    return { logo: logos[0] ? logos[0].file_path : null, backdrop: bds[0] ? bds[0].file_path : null };
  } catch (e) { return {}; }
}
const tmdbImg = (size, path) => path ? "https://image.tmdb.org/t/p/" + size + path : null;

// ---------- helpers ----------
const col = (hex, a) => new Color(hex, a == null ? 1 : a);
const white = (a) => col("#ffffff", a);
const pct = (s) => (s.finished ? 1 : s.total && s.watched != null ? Math.min(1, s.watched / s.total) : 0);
const left = (s) => (s.kind === "movie" || s.finished || s.total == null || s.watched == null ? null : Math.max(0, s.total - s.watched));
const track = (t) => t.split("").join(" ");
function ago(iso) {
  if (!iso) return "";
  const m = Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (m < 60) return m + "m ago";
  const h = Math.round(m / 60); if (h < 24) return h + "h ago";
  const d = Math.round(h / 24); return d < 30 ? d + "d ago" : Math.round(d / 30) + "mo ago";
}
function sub(s) {
  if (s.kind === "movie") return s.finished ? "Movie · watched" : "Movie · " + Math.round(pct(s) * 100) + "%";
  if (s.finished) return "Completed";
  const l = left(s);
  return [s.next, l != null ? l + " left" : null].filter(Boolean).join(" · ");
}
function textWidth(str, fs) {
  let w = 0;
  for (const ch of str || "") {
    if (ch === " ") w += fs * 0.28;
    else if (/[ilIjtf.,!:;'|]/.test(ch)) w += fs * 0.30;
    else if (/[mwMW]/.test(ch)) w += fs * 0.85;
    else if (/[A-Z0-9]/.test(ch)) w += fs * 0.64;
    else w += fs * 0.55;
  }
  return w;
}
function fitLine(t, fs, maxW) {
  if (textWidth(t, fs) <= maxW) return t;
  while (t.length > 1 && textWidth(t + "…", fs) > maxW) t = t.slice(0, -1);
  return t.trim() + "…";
}
// biggest size that fits on 1 line, else 2 lines (break on space/hyphen), else "…"
function layoutTitle(title, maxW, ladder) {
  for (const fs of ladder) if (textWidth(title, fs) <= maxW) return { fs, lines: [title] };
  const parts = title.match(/[^\s-]+[\s-]?/g) || [title];
  for (const fs of ladder) for (let i = parts.length - 1; i >= 1; i--) {
    const a = parts.slice(0, i).join("").trim(), b = parts.slice(i).join("").trim();
    if (textWidth(a, fs) <= maxW && textWidth(b, fs) <= maxW) return { fs, lines: [a, b] };
  }
  const fs = ladder[ladder.length - 1];
  let a = "";
  for (const p of parts) { if (textWidth((a + p).trim(), fs) <= maxW) a += p; else break; }
  a = a.trim() || title.slice(0, 8);
  return { fs, lines: [a, fitLine(title.slice(a.length).trim(), fs, maxW)] };
}
function rounded(ctx, x, y, w, h, r, c) {
  ctx.setFillColor(c); const p = new Path(); p.addRoundedRect(new Rect(x, y, w, h), r, r); ctx.addPath(p); ctx.fillPath();
}
function strokeRounded(ctx, x, y, w, h, r, c, lw) {
  ctx.setStrokeColor(c); ctx.setLineWidth(lw); const p = new Path(); p.addRoundedRect(new Rect(x, y, w, h), r, r); ctx.addPath(p); ctx.strokePath();
}
function dot(ctx, cx, cy, r, c) {
  ctx.setFillColor(c); const p = new Path(); p.addEllipse(new Rect(cx - r, cy - r, r * 2, r * 2)); ctx.addPath(p); ctx.fillPath();
}
function newCtx(w, h) {
  const c = new DrawContext(); c.size = new Size(w, h); c.respectScreenScale = true; c.opaque = false; return c;
}
// cover-crop an image into w×h with rounded corners (drawn off-screen so nothing bleeds)
function cover(img, w, h, r, biasY) {
  const iw = img.size.width, ih = img.size.height, sc = Math.max(w / iw, h / ih), dw = iw * sc, dh = ih * sc;
  const c = newCtx(w, h);
  c.drawImageInRect(img, new Rect((w - dw) / 2, (h - dh) * (biasY == null ? 0.5 : biasY), dw, dh));
  return r ? roundedImage(c.getImage(), w, h, r) : c.getImage();
}
// Scriptable has no clip API: build rounded corners by painting corner wedges in the background colour.
let CORNER_BG = col("#0e0c10");
function roundedImage(img, w, h, r) {
  const c = newCtx(w, h);
  c.drawImageInRect(img, new Rect(0, 0, w, h));
  c.setFillColor(CORNER_BG);
  const k = 0.5523 * r;
  const corner = (x0, y0, x1, y1, cx1, cy1, cx2, cy2, ex, ey) => {
    const p = new Path(); p.move(new Point(x0, y0)); p.addLine(new Point(x1, y1));
    p.addCurve(new Point(ex, ey), new Point(cx1, cy1), new Point(cx2, cy2)); p.closeSubpath(); c.addPath(p); c.fillPath();
  };
  corner(0, 0, r, 0, r - k, 0, 0, r - k, 0, r);
  corner(w, 0, w, r, w, r - k, w - r + k, 0, w - r, 0);
  corner(w, h, w - r, h, w - r + k, h, w, h - r + k, w, h - r);
  corner(0, h, 0, h - r, 0, h - r + k, r - k, h, r, h);
  return c.getImage();
}
// vertical / horizontal shade made of thin alpha bands (no gradient API)
// one 1-pt strip per point, whole-number edges and no overlap (overlapping alpha strips show as stripes)
function shade(ctx, x, y, w, h, dir, a0, a1, hex) {
  const n = Math.round(dir === "v" ? h : w);
  for (let i = 0; i < n; i++) {
    const t = n > 1 ? i / (n - 1) : 0, a = a0 + (a1 - a0) * t;
    ctx.setFillColor(col(hex || "#0e0c10", a));
    if (dir === "v") ctx.fillRect(new Rect(Math.round(x), Math.round(y) + i, Math.round(w), 1));
    else ctx.fillRect(new Rect(Math.round(x) + i, Math.round(y), 1, Math.round(h)));
  }
}

// ---------- shared pieces (large + extra large) ----------
const BG = "#0e0c10";

function drawBackdrop(ctx, hero, w, heroH, fadeFrom) {
  if (!hero.backdrop) return;
  // cropped off-screen first: DrawContext doesn't clip, so a wide widget's tall art would spill into the cards.
  // fanart anchored low so baked-in logos at the top are cropped away
  ctx.drawImageInRect(cover(hero.backdrop, w, heroH, 0, hero.fanartReal ? 0.78 : 0.35), new Rect(0, 0, w, heroH));
  ctx.setFillColor(col(BG, 0.3)); ctx.fillRect(new Rect(0, 0, w, heroH));   // tame bright art
  shade(ctx, 0, 0, w, heroH, "h", 0.9, 0.2, BG);                           // dark on the left for text
  shade(ctx, 0, fadeFrom, w, heroH - fadeFrom, "v", 0, 1, BG);             // fade into the card
}

function drawPoster(ctx, img, x, y, w, h) {
  // hard edges: Scriptable can't clip, and faked rounded corners show as dark wedges over the backdrop
  ctx.setFillColor(col("#000000", 0.35)); ctx.fillRect(new Rect(x + 3, y + 5, w, h));
  if (img) ctx.drawImageInRect(cover(img, w, h, 0, 0.3), new Rect(x, y, w, h));
  else { ctx.setFillColor(col("#2a2630")); ctx.fillRect(new Rect(x, y, w, h)); }
  ctx.setStrokeColor(white(0.22)); ctx.setLineWidth(1); ctx.strokeRect(new Rect(x + 0.5, y + 0.5, w - 1, h - 1));
}

function drawKicker(ctx, hero, x, y) {
  const kick = hero.finished ? (hero.kind === "movie" ? "JUST WATCHED" : "JUST FINISHED") : "NOW WATCHING";
  let kx = x;
  if (!hero.finished) { dot(ctx, x + 3.5, y + 5.5, 3.5, col(ACCENT)); kx = x + 12; }
  ctx.setFont(Font.boldSystemFont(8.5)); ctx.setTextColor(white(0.62)); ctx.setTextAlignedLeft();
  ctx.drawText(track(kick), new Point(kx, y));
}

function metaLine(hero) {
  const typ = hero.kind === "movie" ? "MOVIE" : hero.kind === "anime" ? "ANIME" : "TV";
  return [hero.year, hero.kind === "movie" ? (hero.runtime ? hero.runtime + " min" : null) : hero.total ? hero.total + " eps" : null, typ]
    .filter(Boolean).join("  ·  ");
}

// "▶ Resume" pill (whole widget taps through to it): icon + label centred as one group
function drawPill(ctx, hero, x, y, labelOverride) {
  const label = labelOverride || (hero.finished ? "Watch again" : "Resume");
  const PFS = 11, PILL_H = 28, ICON_W = 8, GAP_I = 7, PAD_X = 15;
  const labelW = Math.ceil(textWidth(label, PFS) * 1.08);      // a little slack: estimates run short
  const pillW = PAD_X + ICON_W + GAP_I + labelW + PAD_X, midY = y + PILL_H / 2;
  rounded(ctx, x, y, pillW, PILL_H, PILL_H / 2, white(0.94));
  const ix = x + PAD_X;
  ctx.setFillColor(col("#111111"));
  const tri = new Path(); tri.move(new Point(ix, midY - 5)); tri.addLine(new Point(ix, midY + 5)); tri.addLine(new Point(ix + ICON_W, midY));
  tri.closeSubpath(); ctx.addPath(tri); ctx.fillPath();
  ctx.setFont(Font.boldSystemFont(PFS)); ctx.setTextColor(col("#111111")); ctx.setTextAlignedCenter();
  ctx.drawTextInRect(label, new Rect(ix + ICON_W + GAP_I, midY - PFS * 0.6, labelW, PFS * 1.3));   // SF caps centre ≈ 0.6em below line top
  ctx.setTextAlignedLeft();
  return pillW;
}

// big % (or ✓) + one tick per episode + caption
function drawProgress(ctx, hero, x, y, right, numFs) {
  const p = pct(hero), k = numFs / 34;
  ctx.setTextColor(white(1));
  if (hero.finished) {
    const c = new Path(); c.move(new Point(x + 2 * k, y + 15 * k)); c.addLine(new Point(x + 11 * k, y + 24 * k)); c.addLine(new Point(x + 27 * k, y + 5 * k));
    ctx.addPath(c); ctx.setStrokeColor(white(1)); ctx.setLineWidth(4.5 * k); ctx.strokePath();
  } else {
    const num = String(Math.round(p * 100));
    ctx.setFont(Font.heavySystemFont(numFs)); ctx.drawText(num, new Point(x - 1, y - 4 * k));
    ctx.setFont(Font.boldSystemFont(13 * k)); ctx.setTextColor(white(0.6));
    ctx.drawText("%", new Point(x + num.length * numFs * 0.6 + 1, y));
  }
  const BX = x + 78 * k, BW = right - BX, n = hero.total;
  if (hero.kind !== "movie" && n && n <= 30) {
    const lit = hero.finished ? n : Math.min(n, hero.watched || 0), gap = n > 20 ? 2 : 3, tw = (BW - gap * (n - 1)) / n;
    for (let i = 0; i < n; i++) {
      if (i === lit && !hero.finished) strokeRounded(ctx, BX + i * (tw + gap) + 0.6, y + 4.6, tw - 1.2, 8.8, 2, col(ACCENT), 1.2);
      else rounded(ctx, BX + i * (tw + gap), y + 4, tw, 10, 2.2, white(i < lit ? 1 : 0.16));
    }
  } else {
    rounded(ctx, BX, y + 5, BW, 8, 4, white(0.16));
    if (p > 0) rounded(ctx, BX, y + 5, Math.max(8, BW * p), 8, 4, white(1));
  }
  const cap = [hero.finished ? (hero.kind === "movie" ? "Watched" : "Series completed") : sub(hero), ago(hero.last)].filter(Boolean).join("  ·  ");
  ctx.setFont(Font.semiboldSystemFont(10.5)); ctx.setTextColor(white(0.62));
  ctx.drawText(fitLine(cap, 10.5, BW), new Point(BX, y + 21));
}

function drawCheck(ctx, cx, cy) {
  dot(ctx, cx, cy, 6.5, white(0.85));
  const k = new Path(); k.move(new Point(cx - 3, cy)); k.addLine(new Point(cx - 0.8, cy + 2.4)); k.addLine(new Point(cx + 3.4, cy - 2.6));
  ctx.addPath(k); ctx.setStrokeColor(col("#111111")); ctx.setLineWidth(1.6); ctx.strokePath();
}

// ---------- LARGE 364 × 382 ----------
const W = 364, H = 382, PAD = 16;

function drawLarge(hero, rows, updated) {
  const ctx = newCtx(W, H);
  ctx.opaque = true;
  ctx.setFillColor(col(BG)); ctx.fillRect(new Rect(0, 0, W, H));
  CORNER_BG = col(BG);

  drawBackdrop(ctx, hero, W, 236, 106);

  const PX = PAD, PY = PAD, PW = 92, PH = 138;
  drawPoster(ctx, hero.img, PX, PY, PW, PH);

  const TX = PX + PW + 14, TW = W - PAD - TX;
  drawKicker(ctx, hero, TX, PY + 1.5);

  // title (1–2 lines, auto size)
  const lay = layoutTitle(hero.title, TW, [26, 23, 20, 17]);
  let y = PY + 18;
  ctx.setFont(Font.heavySystemFont(lay.fs)); ctx.setTextColor(white(1));
  for (const ln of lay.lines) { ctx.drawText(ln, new Point(TX, y)); y += lay.fs * 1.08; }
  ctx.setFont(Font.semiboldSystemFont(10.5)); ctx.setTextColor(white(0.55));
  ctx.drawText(fitLine(metaLine(hero), 10.5, TW), new Point(TX, y + 5));

  drawPill(ctx, hero, TX, PY + PH - 28);

  const RY = PY + PH + 16;
  drawProgress(ctx, hero, PAD, RY, W - PAD, 34);

  // recently watched: 2×2 cards
  const LY = RY + 46;
  ctx.setFont(Font.boldSystemFont(8.5)); ctx.setTextColor(white(0.5));
  ctx.drawText(track("RECENTLY WATCHED"), new Point(PAD, LY));
  ctx.setTextAlignedRight();
  ctx.drawTextInRect(updated, new Rect(W - PAD - 120, LY, 120, 12));
  ctx.setTextAlignedLeft();

  const GX = PAD, GY = LY + 16, GAP = 8, CW = (W - PAD * 2 - GAP) / 2, CH = (H - PAD - GY - GAP) / 2;
  rows.slice(0, 4).forEach((s, i) => {
    const cx = GX + (i % 2) * (CW + GAP), cy = GY + Math.floor(i / 2) * (CH + GAP);
    rounded(ctx, cx, cy, CW, CH, 12, white(0.065));
    strokeRounded(ctx, cx + 0.5, cy + 0.5, CW - 1, CH - 1, 11.5, white(0.08), 1);
    const tw = Math.round((CH - 14) * 2 / 3), th = CH - 14;
    if (s.img) { CORNER_BG = col("#1a181c"); ctx.drawImageInRect(cover(s.img, tw, th, 6, 0.3), new Rect(cx + 7, cy + 7, tw, th)); }
    else rounded(ctx, cx + 7, cy + 7, tw, th, 6, col("#2a2630"));
    const x2 = cx + 7 + tw + 9, w2 = cx + CW - 8 - x2 - (s.finished ? 14 : 0);
    ctx.setFont(Font.boldSystemFont(11.5)); ctx.setTextColor(white(1));
    ctx.drawText(fitLine(s.title, 11.5, w2), new Point(x2, cy + 8));
    ctx.setFont(Font.semiboldSystemFont(9.5)); ctx.setTextColor(white(0.55));
    ctx.drawText(fitLine(sub(s), 9.5, cx + CW - 8 - x2), new Point(x2, cy + 24));
    const bw = cx + CW - 9 - x2, bp = pct(s);
    rounded(ctx, x2, cy + CH - 12, bw, 3.5, 1.75, white(0.14));
    rounded(ctx, x2, cy + CH - 12, Math.max(3.5, bw * bp), 3.5, 1.75, white(s.finished ? 0.45 : 1));
    if (s.finished) drawCheck(ctx, cx + CW - 13, cy + 13);
  });
  return ctx.getImage();
}

// ---------- EXTRA LARGE ~730 × 358 (wide; Mac desktop / iPad) — TV-app style ----------
const XW = 730, XH = 358, XPAD = 28;
const DISPLAY = "Futura-CondensedExtraBold";        // poster type (built into iOS)
const display = (size) => new Font(DISPLAY, size);
function condW(str, fs) {
  let w = 0;
  for (const ch of str || "") w += ch === " " ? fs * 0.22 : /[IJ1il.,:!']/.test(ch) ? fs * 0.3 : /[MW]/.test(ch) ? fs * 0.72 : fs * 0.5;
  return w;
}
function condLayout(title, maxW, ladder) {
  for (const fs of ladder) if (condW(title, fs) <= maxW) return { fs, lines: [title] };
  const words = title.split(" ");
  for (const fs of ladder.slice(-3)) for (let i = words.length - 1; i >= 1; i--) {
    const a = words.slice(0, i).join(" "), b = words.slice(i).join(" ");
    if (condW(a, fs) <= maxW && condW(b, fs) <= maxW) return { fs, lines: [a, b] };
  }
  const fs = ladder[ladder.length - 1]; let t = title;
  while (t.length > 1 && condW(t + "…", fs) > maxW) t = t.slice(0, -1);
  return { fs, lines: [t + "…"] };
}
// manga screentone: dots shrinking away from a corner
function screentone(ctx, x, y, w, h, fromX, fromY, reach, maxR, c) {
  const step = 6;
  for (let gy = y; gy <= y + h; gy += step)
    for (let gx = x + (Math.round((gy - y) / step) % 2 ? step / 2 : 0); gx <= x + w; gx += step) {
      const r = maxR * (1 - Math.hypot(gx - fromX, gy - fromY) / reach);
      if (r > 0.35) dot(ctx, gx, gy, r, c);
    }
}
function eased(ctx, x, y, w, h, dir, a0, a1) {
  const n = Math.round(dir === "v" ? h : w);
  for (let i = 0; i < n; i++) {
    let t = n > 1 ? i / (n - 1) : 0; t = t * t * (3 - 2 * t);
    ctx.setFillColor(col(BG, a0 + (a1 - a0) * t));
    if (dir === "v") ctx.fillRect(new Rect(Math.round(x), Math.round(y) + i, Math.round(w), 1));
    else ctx.fillRect(new Rect(Math.round(x) + i, Math.round(y), 1, Math.round(h)));
  }
}
function outlinePill(ctx, label, x, y) {
  const fs = 11, w = Math.ceil(textWidth(label, fs) * 1.08) + 30;
  strokeRounded(ctx, x + 0.5, y + 0.5, w - 1, 27, 13.5, white(0.45), 1);
  ctx.setFont(Font.boldSystemFont(fs)); ctx.setTextColor(white(0.95)); ctx.setTextAlignedCenter();
  ctx.drawTextInRect(label, new Rect(x, y + 14 - fs * 0.6, w, fs * 1.3)); ctx.setTextAlignedLeft();
  return w;
}

function wrapLines(text, fs, maxW, maxLines) {
  const words = (text || "").split(/\s+/).filter(Boolean), lines = [];
  let cur = "", i = 0;
  for (; i < words.length; i++) {
    const t = cur ? cur + " " + words[i] : words[i];
    if (textWidth(t, fs) <= maxW) { cur = t; continue; }
    lines.push(cur); cur = words[i];
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && cur) { lines.push(cur); i = words.length; }
  if (i < words.length) lines[lines.length - 1] = fitLine(lines[lines.length - 1] + " " + words.slice(i).join(" "), fs, maxW);
  return lines;
}

function drawXL(hero, rows, updated) {
  const ctx = newCtx(XW, XH);
  ctx.opaque = true;
  ctx.setFillColor(col(BG)); ctx.fillRect(new Rect(0, 0, XW, XH));
  const PANEL_X = 468;

  // full-bleed scene, drawn straight in (the canvas edge crops it)
  if (hero.backdrop) {
    const b = hero.backdrop, sc = Math.max(XW / b.size.width, XH / b.size.height), dw = b.size.width * sc, dh = b.size.height * sc;
    ctx.drawImageInRect(b, new Rect((XW - dw) * 0.65, (XH - dh) * (hero.fanartReal ? 0.45 : 0.3), dw, dh));
    ctx.setFillColor(col(BG, 0.18)); ctx.fillRect(new Rect(0, 0, XW, XH));
    eased(ctx, 0, 0, PANEL_X, XH, "h", 0.9, 0.05);
    eased(ctx, 0, 150, PANEL_X, XH - 150, "v", 0, 0.75);
  }

  // ---- left: the show ----
  const TX = XPAD, TW = PANEL_X - XPAD - 40;
  const typ = hero.kind === "movie" ? "MOVIE" : hero.kind === "anime" ? "ANIME" : "SERIES";
  let kx = TX;
  if (!hero.finished) { dot(ctx, TX + 3.5, 28, 3.5, col(ACCENT)); kx = TX + 12; }
  ctx.setFont(Font.boldSystemFont(9)); ctx.setTextColor(white(0.8)); ctx.setTextAlignedLeft();
  ctx.drawText(track(hero.finished ? (hero.kind === "movie" ? "JUST WATCHED" : "JUST FINISHED") : "NOW WATCHING"), new Point(kx, 22.5));

  // official logo (bottom-aligned in its box), else the title in poster type
  const LOGO_BOTTOM = 154, LOGO_MAXW = 330, LOGO_MAXH = 104;
  if (hero.logo) {
    const lw = hero.logo.size.width, lh = hero.logo.size.height, sc = Math.min(LOGO_MAXW / lw, LOGO_MAXH / lh);
    ctx.drawImageInRect(hero.logo, new Rect(TX, LOGO_BOTTOM - lh * sc, lw * sc, lh * sc));
  } else {
    const lay = condLayout(hero.title.toUpperCase(), TW, [60, 54, 48, 42, 36]);
    const lh = lay.fs * 1.0;
    let y = LOGO_BOTTOM - lh * lay.lines.length - 4;
    ctx.setFont(display(lay.fs)); ctx.setTextColor(white(1));
    for (const ln of lay.lines) { ctx.drawText(ln, new Point(TX - 1, y)); y += lh; }
  }

  // meta: type · year · length · rating · genres
  const metaBits = [typ, hero.year,
    hero.kind === "movie" ? (hero.runtime ? Math.floor(hero.runtime / 60) + "h " + (hero.runtime % 60) + "m" : null) : hero.total ? hero.total + " episodes" : null,
    hero.rating ? "★ " + Number(hero.rating).toFixed(1) : null,
    (hero.genres || []).slice(0, 2).join(", ") || null].filter(Boolean);
  ctx.setFont(Font.semiboldSystemFont(10.5)); ctx.setTextColor(white(0.75));
  ctx.drawText(fitLine(metaBits.join("   ·   "), 10.5, TW), new Point(TX, LOGO_BOTTOM + 12));

  // synopsis, two lines
  if (hero.overview) {
    ctx.setFont(Font.regularSystemFont ? Font.regularSystemFont(10.5) : Font.systemFont(10.5)); ctx.setTextColor(white(0.6));
    wrapLines(hero.overview, 10.5, TW, 2).forEach((ln, i) => ctx.drawText(ln, new Point(TX, LOGO_BOTTOM + 31 + i * 14)));
  }

  // progress: slim episode segments (or a line) + % on the right
  const PY = 244, n = hero.total, p = pct(hero), BARW = TW - 54;
  if (hero.kind !== "movie" && n && n <= 30) {
    const lit = hero.finished ? n : Math.min(n, hero.watched || 0), gap = 3, tw = (BARW - gap * (n - 1)) / n;
    for (let i = 0; i < n; i++) {
      const x = TX + i * (tw + gap);
      if (i === lit && !hero.finished) rounded(ctx, x, PY, tw, 5, 2.5, col(ACCENT));
      else rounded(ctx, x, PY, tw, 5, 2.5, white(i < lit ? 0.95 : 0.2));
    }
  } else {
    rounded(ctx, TX, PY, BARW, 5, 2.5, white(0.2));
    if (p > 0) rounded(ctx, TX, PY, Math.max(5, BARW * p), 5, 2.5, white(0.95));
  }
  ctx.setTextAlignedRight(); ctx.setFont(display(17)); ctx.setTextColor(white(1));
  ctx.drawTextInRect(hero.finished ? "✓" : Math.round(p * 100) + "%", new Rect(TX + TW - 50, PY - 7, 50, 20)); ctx.setTextAlignedLeft();
  const cap = [hero.finished ? (hero.kind === "movie" ? "Watched" : "Series completed") : sub(hero), ago(hero.last)].filter(Boolean).join("   ·   ");
  ctx.setFont(Font.semiboldSystemFont(10)); ctx.setTextColor(white(0.6));
  ctx.drawText(fitLine(cap, 10, TW), new Point(TX, PY + 12));

  // buttons
  const BY = XH - 26 - 28;
  const resumeLabel = hero.finished ? "Watch again" : hero.next ? "Resume  " + hero.next.replace(/^S(\d+)E(\d+)$/, "S$1 E$2") : "Resume";
  const pw = drawPill(ctx, hero, TX, BY, resumeLabel);
  outlinePill(ctx, "Open in Simkl", TX + pw + 10, BY);

  // ---- right: glass panel, recently watched ----
  ctx.setFillColor(col("#08070a", 0.72)); ctx.fillRect(new Rect(PANEL_X, 0, XW - PANEL_X, XH));
  ctx.setFillColor(white(0.08)); ctx.fillRect(new Rect(PANEL_X, 0, 1, XH));
  const PX = PANEL_X + 18, PW = XW - PX - 18;
  ctx.setFont(Font.boldSystemFont(8.5)); ctx.setTextColor(white(0.55));
  ctx.drawText(track("RECENTLY WATCHED"), new Point(PX, 22));
  const RY0 = 42, RH = 64, RG = 8, TH = 56, TWD = Math.round(TH * 16 / 9);
  rows.slice(0, 4).forEach((s, i) => {
    const ry = RY0 + i * (RH + RG);
    // landscape still (hard edges), progress along its bottom edge
    if (s.still) ctx.drawImageInRect(cover(s.still, TWD, TH, 0, 0.4), new Rect(PX, ry + 4, TWD, TH));
    else if (s.img) ctx.drawImageInRect(cover(s.img, TWD, TH, 0, 0.25), new Rect(PX, ry + 4, TWD, TH));
    else { ctx.setFillColor(col("#2a2630")); ctx.fillRect(new Rect(PX, ry + 4, TWD, TH)); }
    ctx.setStrokeColor(white(0.14)); ctx.setLineWidth(1); ctx.strokeRect(new Rect(PX + 0.5, ry + 4.5, TWD - 1, TH - 1));
    ctx.setFillColor(col("#000000", 0.55)); ctx.fillRect(new Rect(PX, ry + 4 + TH - 3, TWD, 3));
    ctx.setFillColor(s.finished ? white(0.85) : col(ACCENT)); ctx.fillRect(new Rect(PX, ry + 4 + TH - 3, Math.max(3, TWD * pct(s)), 3));
    const x2 = PX + TWD + 12, w2 = PX + PW - x2;
    ctx.setFont(Font.boldSystemFont(11.5)); ctx.setTextColor(white(1));
    ctx.drawText(fitLine(s.title, 11.5, w2), new Point(x2, ry + 7));
    const line1 = s.kind === "movie" ? (s.finished ? "Movie  ·  watched" : Math.round(pct(s) * 100) + "% watched") : sub(s);
    ctx.setFont(Font.semiboldSystemFont(9.5)); ctx.setTextColor(white(0.65));
    ctx.drawText(fitLine(line1, 9.5, w2), new Point(x2, ry + 25));
    ctx.setTextColor(white(0.4));
    ctx.drawText(fitLine(ago(s.last), 9.5, w2), new Point(x2, ry + 39));
  });
  ctx.setFont(Font.semiboldSystemFont(8)); ctx.setTextColor(white(0.3)); ctx.setTextAlignedRight();
  ctx.drawTextInRect(track("SIMKL  ·  " + updated), new Rect(PX, XH - 18, PW, 10)); ctx.setTextAlignedLeft();
  return ctx.getImage();
}
function fitCond(t, fs, maxW) {
  if (condW(t, fs) <= maxW) return t;
  while (t.length > 1 && condW(t + "…", fs) > maxW) t = t.slice(0, -1);
  return t.trim() + "…";
}

function message(title, body) {
  const w = new ListWidget();
  w.backgroundColor = col(BG);
  w.setPadding(22, 22, 22, 22);
  const k = w.addText(track("SIMKL BIG")); k.font = Font.boldSystemFont(9); k.textColor = white(0.5);
  w.addSpacer(8);
  const t = w.addText(title); t.font = Font.heavySystemFont(20); t.textColor = white(1);
  w.addSpacer(6);
  const b = w.addText(body); b.font = Font.mediumSystemFont(12); b.textColor = white(0.65);
  w.addSpacer();
  return w;
}

// ---------- main ----------
const PREVIEW = "large";   // in-app preview: "large" or "extraLarge"
const WIDE = (config.runsInWidget ? config.widgetFamily : PREVIEW) === "extraLarge";
let widget;
if (!token) {
  widget = message("Link Simkl first", Device.isPhone()
    ? "Run the \"Simkl Radar\" script once in Scriptable to connect your account."
    : "Open Scriptable on your iPhone and run \"Simkl Big\" once. That shares your Simkl login with this Mac through iCloud.");
  widget.url = "scriptable:///run/" + encodeURIComponent("Simkl Radar");
} else {
  try {
  let items = [];
  try { items = await loadItems(); } catch (e) { items = []; }
  if (!items.length) {
    widget = message("Nothing yet", "Watch something on Simkl and it will show up here.");
  } else {
    const [hero, ...rest] = items;
    const rows = rest.slice(0, 4);
    const det = await heroDetail(hero);
    Object.assign(hero, { overview: det.overview, genres: det.genres, rating: det.rating });
    const fan = det.fanart;
    if (WIDE) {
      // TMDB art for the hero and each row, all in parallel
      const [art, ...rowArt] = await Promise.all([tmdbArt(hero, det.tmdb), ...rows.map((s) => tmdbArt(s))]);
      const imgs = await Promise.all([
        loadImage(art.backdrop ? tmdbImg("w1280", art.backdrop) : fan ? fanartUrl(fan) : blurPosterUrl(hero.poster)),
        loadImage(tmdbImg("w500", art.logo)),
        ...rows.map((s, i) => rowArt[i].backdrop ? loadImage(tmdbImg("w300", rowArt[i].backdrop)) : loadImage(posterUrl(s.poster))),
      ]);
      hero.backdrop = imgs[0]; hero.logo = imgs[1]; hero.fanartReal = !!(art.backdrop || fan);
      rows.forEach((s, i) => { if (rowArt[i].backdrop) s.still = imgs[2 + i]; else s.img = imgs[2 + i]; });
    } else {
      const imgs = await Promise.all([loadImage(posterUrl(hero.poster)), loadImage(fan ? fanartUrl(fan) : blurPosterUrl(hero.poster)),
        ...rows.map((s) => loadImage(posterUrl(s.poster)))]);
      hero.img = imgs[0]; hero.backdrop = imgs[1]; hero.fanartReal = !!fan;
      rows.forEach((s, i) => { s.img = imgs[2 + i]; });
    }
    const df = new DateFormatter(); df.useNoDateStyle(); df.useShortTimeStyle();
    widget = new ListWidget();
    widget.setPadding(0, 0, 0, 0);
    widget.backgroundImage = WIDE ? drawXL(hero, rows, df.string(new Date())) : drawLarge(hero, rows, df.string(new Date()));
    widget.url = WATCH_APP === "nuvio"
      ? "nuvio://search?query=" + encodeURIComponent(hero.title)
      : "https://simkl.com/search/?q=" + encodeURIComponent(hero.title);
  }
  } catch (e) {
    // show the problem on the widget instead of a blank tile
    widget = message("Simkl Big hit an error", String(e && e.message || e).slice(0, 160));
  }
}
widget.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
if (config.runsInWidget) Script.setWidget(widget);
else if (WIDE) await widget.presentExtraLarge();
else await widget.presentLarge();
Script.complete();
