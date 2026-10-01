// ============================================
// SIMKL LOCK — lock screen widgets (Scriptable)
// Rectangular + Circular (+ inline text).
// Needs the token from "Simkl Radar" (run that one first).
// Lock screen is single-tint, so everything is white
// at different opacities. Run in-app to preview.
// ============================================

const CLIENT_ID =
  "70a1d2b1c1b5c2ed32bd9bbd498b5cc8e00d2a0d0ddf0f29849472492b0889ce";
// Paste your free TMDB API key (v3 "API Key") between the quotes to show the
// official title logo instead of plain text. Leave "" to keep plain titles.
const TMDB_KEY = "";
const USE_LOGOS = true;

const API = "https://api.simkl.com";
const fm = FileManager.local();
const tokenPath = fm.joinPath(fm.documentsDirectory(), "simkl-token.txt");
const token = fm.fileExists(tokenPath) ? fm.readString(tokenPath).trim() : null;

async function getJSON(path) {
  const r = new Request(API + path + (path.includes("?") ? "&" : "?") + "_=" + Date.now());
  r.headers = {
    "Content-Type": "application/json",
    "Authorization": "Bearer " + token,
    "simkl-api-key": CLIENT_ID,
  };
  r.timeoutInterval = 20;
  return await r.loadJSON();
}
async function loadImage(url) {
  try { const r = new Request(url); r.timeoutInterval = 15; return await r.loadImage(); }
  catch (e) { return null; }
}
const posterUrl = (p) => p ? "https://wsrv.nl/?url=https://simkl.in/posters/" + p + "_m.webp&output=jpg&w=200" : null;

// ---------- data (newest watched first) ----------
async function loadItems() {
  const safe = (p, d) => getJSON(p).catch(() => d);
  const [sw, sd, aw, ad, md] = await Promise.all([
    safe("/sync/all-items/shows/watching?extended=full", {}),
    safe("/sync/all-items/shows/completed?extended=full", {}),
    safe("/sync/all-items/anime/watching?extended=full", {}),
    safe("/sync/all-items/anime/completed?extended=full", {}),
    safe("/sync/all-items/movies/completed?extended=full", {}),
  ]);
  const norm = (obj, kind, finished) =>
    ((obj && (obj.shows || obj.anime || obj.movies)) || []).map((it) => {
      const s = it.show || it.anime || it.movie || {};
      const total = kind === "movie" ? 100 : (s.total_episodes_count || it.total_episodes_count || null);
      const watched = finished ? total
        : (it.watched_episodes_count != null ? it.watched_episodes_count : null);
      const ne = it.next_to_watch || it.next_episode || null;
      return {
        kind, finished, total, watched,
        title: s.title || "Untitled", poster: s.poster || null, ids: s.ids || {},
        ep: kind === "movie" ? null
          : (typeof ne === "string" && ne ? ne.replace(/S0*(\d+)E0*(\d+)/i, "S$1E$2")
            : (ne && ne.episode != null ? (ne.season != null ? "S" + ne.season + "E" + ne.episode : "EP " + ne.episode)
              : (watched != null ? "EP " + (watched + 1) : null))),
        last: it.last_watched_at ? new Date(it.last_watched_at) : null,
      };
    });
  let all = [
    ...norm(md, "movie", true), ...norm(sw, "tv", false), ...norm(sd, "tv", true),
    ...norm(aw, "anime", false), ...norm(ad, "anime", true),
  ].filter((s) => s.last);
  all.sort((a, b) => b.last - a.last);
  return all;
}

// ---------- TMDB title logo (official title art), null if none ----------
async function fetchLogo(s) {
  if (!TMDB_KEY || !USE_LOGOS) return null;
  try {
    const type = s.kind === "movie" ? "movie" : "tv";
    let id = s.ids && s.ids.tmdb;
    if (!id) {
      const r = new Request("https://api.themoviedb.org/3/search/" + type +
        "?api_key=" + TMDB_KEY + "&query=" + encodeURIComponent(s.title));
      r.timeoutInterval = 12;
      const j = await r.loadJSON();
      id = j.results && j.results[0] && j.results[0].id;
    }
    if (!id) return null;
    const r2 = new Request("https://api.themoviedb.org/3/" + type + "/" + id +
      "/images?api_key=" + TMDB_KEY + "&include_image_language=en,null");
    r2.timeoutInterval = 12;
    const imgs = await r2.loadJSON();
    const logos = (imgs.logos || []).filter((l) => l.file_path && !/\.svg$/i.test(l.file_path));
    if (!logos.length) return null;
    logos.sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0));
    // bri=255 pushes coloured logos to white (lock screen is single-tint, dark art vanishes)
    return await loadImage("https://wsrv.nl/?url=image.tmdb.org/t/p/w500" + logos[0].file_path + "&output=png&bri=255");
  } catch (e) { return null; }
}

// ---------- drawing helpers ----------
const white = (a) => new Color("#ffffff", a);
function rounded(ctx, x, y, w, h, r, color) {
  ctx.setFillColor(color);
  const p = new Path(); p.addRoundedRect(new Rect(x, y, w, h), r, r);
  ctx.addPath(p); ctx.fillPath();
}
function textWidth(str, fs) {
  let w = 0;
  for (const ch of str || "") {
    if (ch === " ") w += fs * 0.28;
    else if (/[ilIjtf.,!:;'|]/.test(ch)) w += fs * 0.30;
    else if (/[mwMW]/.test(ch)) w += fs * 0.85;
    else if (/[A-Z0-9]/.test(ch)) w += fs * 0.62;
    else w += fs * 0.54;
  }
  return w;
}
// 1 line at the biggest size that fits, else 2 lines (break on space or hyphen), else "…"
function layoutTitle(title, maxW, ladder) {
  title = (title || "").trim();
  for (const fs of ladder) if (textWidth(title, fs) <= maxW) return { fs, lines: [title] };
  const parts = title.match(/[^\s-]+[\s-]?/g) || [title]; // keep the break char on the first half
  for (const fs of ladder) {
    for (let i = parts.length - 1; i >= 1; i--) {
      const l1 = parts.slice(0, i).join("").trim(), l2 = parts.slice(i).join("").trim();
      if (textWidth(l1, fs) <= maxW && textWidth(l2, fs) <= maxW) return { fs, lines: [l1, l2] };
    }
  }
  const fs = ladder[ladder.length - 1];
  let l1 = "";
  for (const p of parts) { const t = l1 + p; if (textWidth(t.trim(), fs) <= maxW) l1 = t; else break; }
  l1 = l1.trim() || title.slice(0, 6);
  let rest = title.slice(l1.length).trim();
  while (rest && textWidth(rest + "…", fs) > maxW) rest = rest.slice(0, -1);
  return { fs, lines: [l1, rest ? rest + "…" : ""] };
}
function strokeCircle(ctx, cx, cy, r, color, lw) {
  ctx.setStrokeColor(color); ctx.setLineWidth(lw);
  const p = new Path(); p.addEllipse(new Rect(cx - r, cy - r, r * 2, r * 2)); ctx.addPath(p); ctx.strokePath();
}
function ringArc(ctx, cx, cy, r, pct, lw) {
  strokeCircle(ctx, cx, cy, r, white(0.3), lw);
  if (pct <= 0) return;
  const seg = Math.max(2, Math.round(90 * pct)), p = new Path();
  for (let i = 0; i <= seg; i++) {
    const a = (-90 + 360 * pct * (i / seg)) * Math.PI / 180;
    const pt = new Point(cx + r * Math.cos(a), cy + r * Math.sin(a));
    if (i === 0) p.move(pt); else p.addLine(pt);
  }
  ctx.setStrokeColor(white(1)); ctx.setLineWidth(lw); ctx.addPath(p); ctx.strokePath();
}
function newCtx(w, h) {
  const c = new DrawContext();
  c.size = new Size(w, h); c.respectScreenScale = true; c.opaque = false;
  c.setTextAlignedLeft();
  return c;
}
const pctOf = (s) => s.finished ? 1 : (s.total && s.watched != null ? Math.min(1, s.watched / s.total) : 0);
const leftOf = (s) => (s.kind === "movie" || s.finished || s.total == null || s.watched == null) ? null : Math.max(0, s.total - s.watched);

// ---------- RECTANGULAR 172 x 76 — latest item, episode ticks ----------
//  [LOGO / title]                 (E24)
//  ▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▯▯▯▯      one tick per episode
//  83%                 4 EPISODES LEFT
const track = (str) => str.split("").join("\u200A");
function drawRect(s) {
  const W = 172, H = 76, ctx = newCtx(W, H);
  const p = pctOf(s), isMovie = s.kind === "movie", left = leftOf(s);

  // ---- top right: tag pill ----
  const tag = isMovie ? "MOVIE" : (s.finished ? "DONE" : (s.ep || "").toUpperCase());
  const pw = tag ? Math.max(30, textWidth(tag, 8.5) + 14) : 0;
  if (tag) {
    ctx.setStrokeColor(white(0.75)); ctx.setLineWidth(1);
    const pp = new Path(); pp.addRoundedRect(new Rect(W - 1 - pw, 5, pw, 14), 7, 7);
    ctx.addPath(pp); ctx.strokePath();
    ctx.setTextAlignedCenter();
    ctx.setFont(Font.boldSystemFont(8.5)); ctx.setTextColor(white(1));
    ctx.drawTextInRect(track(tag), new Rect(W - 1 - pw, 7, pw, 11));
    ctx.setTextAlignedLeft();
  }

  // ---- top left: official logo, else the text title (1-2 lines) ----
  const tw = W - 2 - (pw ? pw + 8 : 0), th = 24;
  if (s.logo) {
    const iw = s.logo.size.width, ih = s.logo.size.height;
    const sc = Math.min(tw / iw, th / ih), dw = iw * sc, dh = ih * sc;
    ctx.drawImageInRect(s.logo, new Rect(1, 3 + (th - dh) / 2, dw, dh));
  } else {
    let lay = layoutTitle(s.title, tw, [15, 13, 12]);
    if (lay.lines.length === 2) lay = layoutTitle(s.title, tw, [10.5, 10]);
    ctx.setFont(Font.boldSystemFont(lay.fs)); ctx.setTextColor(white(1));
    let ty = lay.lines.length === 2 ? 2 : 6;
    for (const ln of lay.lines) { ctx.drawText(ln, new Point(1, ty)); ty += lay.fs + 1; }
  }

  // ---- middle: one tick per episode (solid bar for movies / long series) ----
  const by = 34, bh = 8, bw = W - 2;
  const n = s.total, ticks = !isMovie && n && n >= 2 && n <= 26;
  if (ticks) {
    const lit = s.finished ? n : Math.min(n, s.watched || 0);
    const gap = 1.4, w = (bw - gap * (n - 1)) / n;
    for (let i = 0; i < n; i++) rounded(ctx, 1 + i * (w + gap), by, w, bh, 1.6, white(i < lit ? 1 : 0.25));
  } else {
    rounded(ctx, 1, by, bw, bh, 4, white(0.25));
    if (p > 0) rounded(ctx, 1, by, Math.max(bh, bw * p), bh, 4, white(1));
  }

  // ---- bottom: big percentage (or a check) + what's left ----
  if (s.finished) {
    const k = new Path();
    k.move(new Point(2, 58)); k.addLine(new Point(7, 63)); k.addLine(new Point(15, 51));
    ctx.addPath(k); ctx.setStrokeColor(white(1)); ctx.setLineWidth(3.5); ctx.strokePath();
    ctx.setFont(Font.boldSystemFont(13)); ctx.setTextColor(white(1));
    ctx.drawText(isMovie ? "WATCHED" : "COMPLETED", new Point(21, 53));
  } else {
    const num = String(Math.round(p * 100)), fs = 21, nw = num.length * fs * 0.7;
    ctx.setFont(Font.boldSystemFont(fs)); ctx.setTextColor(white(1));
    ctx.drawText(num, new Point(1, 47));
    ctx.setFont(Font.boldSystemFont(10)); ctx.setTextColor(white(0.8));
    ctx.drawText("%", new Point(1 + nw + 1, 54));
  }
  let note = "";
  if (s.finished) note = isMovie ? "JUST WATCHED" : "JUST FINISHED";
  else if (left != null) note = left + (left === 1 ? " EPISODE LEFT" : " EPISODES LEFT");
  else note = "NOW WATCHING";
  ctx.setTextAlignedRight();
  ctx.setFont(Font.boldSystemFont(8)); ctx.setTextColor(white(0.8));
  ctx.drawTextInRect(track(note), new Rect(W - 150, 57, 149, 11));
  ctx.setTextAlignedLeft();
  return ctx.getImage();
}

// ---------- CIRCULAR 76 x 76 ----------
function drawCircle(s) {
  const S = 76, c = S / 2, ctx = newCtx(S, S);
  const p = pctOf(s);
  ringArc(ctx, c, c, 33, p, 5);
  ctx.setTextAlignedCenter();
  if (s.finished) {
    const k = new Path();
    k.move(new Point(c - 10, c)); k.addLine(new Point(c - 3, c + 8)); k.addLine(new Point(c + 11, c - 9));
    ctx.addPath(k); ctx.setStrokeColor(white(1)); ctx.setLineWidth(4); ctx.strokePath();
  } else {
    ctx.setFont(Font.boldSystemFont(19)); ctx.setTextColor(white(1));
    ctx.drawTextInRect(String(Math.round(p * 100)) + "%", new Rect(8, c - 16, S - 16, 24));
    ctx.setFont(Font.boldSystemFont(8)); ctx.setTextColor(white(0.7));
    ctx.drawTextInRect(s.kind === "movie" ? "MOVIE" : (s.ep || ""), new Rect(8, c + 7, S - 16, 12));
  }
  return ctx.getImage();
}

// ---------- main ----------
const PREVIEW = "rect"; // in-app preview: "rect" or "circle"

if (!token) {
  const w = new ListWidget();
  const t = w.addText("Run Simkl Radar once to connect");
  t.font = Font.boldSystemFont(10);
  config.runsInWidget ? Script.setWidget(w) : await w.presentSmall();
  Script.complete();
} else {
  const items = await loadItems();
  // same rule as the home-screen widget: strictly newest watched first (movies included)
  const seen = {};
  const pick = items.filter((s) => { const k = s.kind + ":" + s.title.toLowerCase(); if (seen[k]) return false; seen[k] = true; return true; }).slice(0, 1);
  const hero = pick[0];
  if (hero) hero.logo = await fetchLogo(hero);

  if (config.runsInWidget) {
    const fam = config.widgetFamily;
    const w = new ListWidget();
    w.setPadding(0, 0, 0, 0);
    w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
    if (!hero) { const t = w.addText("Nothing watched"); t.font = Font.boldSystemFont(10); }
    else if (fam === "accessoryInline") {
      w.addText("📺 " + hero.title + (hero.ep ? " · " + hero.ep : ""));
    } else {
      const im = w.addImage(fam === "accessoryCircular" ? drawCircle(hero) : drawRect(hero));
      im.centerAlignImage(); im.applyFittingContentMode();
    }
    Script.setWidget(w);
  } else if (hero) {
    // in-app preview: ONE widget on a dark plate, scaled up
    const k = 4, isRect = PREVIEW === "rect", ww = isRect ? 172 : 76, hh = 76, pad = 24;
    const pv = new DrawContext();
    pv.size = new Size((ww + pad * 2) * k, (hh + pad * 2) * k); pv.opaque = true; pv.respectScreenScale = false;
    pv.setFillColor(new Color("#1b1517")); pv.fillRect(new Rect(0, 0, pv.size.width, pv.size.height));
    pv.drawImageInRect(isRect ? drawRect(hero) : drawCircle(hero), new Rect(pad * k, pad * k, ww * k, hh * k));
    await QuickLook.present(pv.getImage());
  }
  Script.complete();
}
