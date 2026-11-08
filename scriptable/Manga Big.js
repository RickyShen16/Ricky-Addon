// ============================================
// MANGA BIG — large widget (Scriptable)  v2
// Poster-style: cover art bleeding in from the right, a giant ghost chapter
// number, manga screentone, an 8-week release rhythm, and the rest of your
// list below. Works on the iPhone and on the Mac via "Use iPhone widgets".
//
// SETUP: paste into Scriptable, name it "Manga Big", add a LARGE
// Scriptable widget, set Script = Manga Big. Tap = open Tachimanga.
// Data: WeebCentral series pages (their RSS feed lags a chapter or two).
// Unread counts appear only if your AniList list is public.
// ============================================

// first entry is the big one
// anilistId: artwork (banner + hi-res cover) and, if your list is public, your progress.
// focus: where to crop the cover, 0 = top … 1 = bottom (keeps logos out, faces in).
const SERIES = [
  { id: "01J76XYGGM22WZP7T4TKA4ZFAF", name: "Kagurabachi", anilistId: 169355, focus: 0.66 },
  { id: "01J76XYE3130E1W5HKTJ7VD912", name: "Sakamoto Days", anilistId: 125828, focus: 0.6 },
  { id: "01JR0D52BNWR8TTEFSNCRX36AP", name: "Phantom Busters", anilistId: 168985, focus: 0.22 },
];
const ANILIST_USERNAME = "MastaDeBlasta";
const ACCENT = "#ff3b30";
const TAP_URL = "tachimanga://";
const NEW_DAYS = 7;                  // red "NEW" for chapters released within this many days
const DISPLAY = "Futura-CondensedExtraBold";   // poster type (built into iOS)

const UA = { "User-Agent": "MangaRadarWidget/3.0" };

// ---------- data ----------
const clean = (s) => (s || "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
const chNum = (s) => { const m = (s || "").match(/([\d.]+)\s*$/); return m ? parseFloat(m[1]) : null; };

// series page lists the latest ~9 chapters with exact timestamps
async function fetchSeries(id) {
  try {
    const r = new Request("https://weebcentral.com/series/" + id);
    r.headers = UA; r.timeoutInterval = 15;
    const html = await r.loadString();
    const chapters = [...html.matchAll(/checkNewChapter\('([^']+)'\)[\s\S]*?<span class="">([^<]+)<\/span>/g)]
      .map((m) => ({ num: chNum(m[2]), date: new Date(m[1]) }))
      .filter((c) => c.num != null && !isNaN(c.date));
    const am = html.match(/<strong>Author\(s\):<\/strong>([\s\S]*?)<\/li>/);
    return { chapters, author: am ? clean(am[1]).replace(/\s*,\s*$/, "") : "" };
  } catch (e) { return { chapters: [], author: "" }; }
}
async function loadImage(url, headers) {
  try { const r = new Request(url); if (headers) r.headers = headers; r.timeoutInterval = 15; return await r.loadImage(); } catch (e) { return null; }
}
const coverUrl = (id) => "https://temp.compsci88.com/cover/fallback/" + id + ".jpg";

// AniList artwork (public, no login): wide banner + hi-res cover, by id
async function fetchArt() {
  const ids = SERIES.map((s) => s.anilistId).filter(Boolean);
  if (!ids.length) return {};
  try {
    const r = new Request("https://graphql.anilist.co");
    r.method = "POST"; r.timeoutInterval = 12;
    r.headers = { "Content-Type": "application/json", "Accept": "application/json" };
    r.body = JSON.stringify({ query: "query($ids:[Int]){Page(perPage:20){media(id_in:$ids,type:MANGA){id bannerImage coverImage{extraLarge}}}}", variables: { ids } });
    const j = await r.loadJSON();
    const out = {};
    for (const m of (j && j.data && j.data.Page && j.data.Page.media) || []) out[m.id] = { banner: m.bannerImage || null, cover: m.coverImage && m.coverImage.extraLarge };
    return out;
  } catch (e) { return {}; }
}

const norm = (t) => (t || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
async function fetchProgress() {
  if (!ANILIST_USERNAME) return {};
  try {
    const r = new Request("https://graphql.anilist.co");
    r.method = "POST"; r.timeoutInterval = 12;
    r.headers = { "Content-Type": "application/json", "Accept": "application/json" };
    r.body = JSON.stringify({ query: "query($n:String){MediaListCollection(userName:$n,type:MANGA){lists{entries{progress media{id title{romaji english native}}}}}}", variables: { n: ANILIST_USERNAME } });
    const j = await r.loadJSON();
    const entries = [];
    for (const l of (j && j.data && j.data.MediaListCollection && j.data.MediaListCollection.lists) || [])
      for (const e of l.entries || []) if (e.media) entries.push(e);
    const out = {};
    for (const s of SERIES) {
      const want = norm(s.name);
      const hit = entries.find((e) => s.anilistId != null ? e.media.id === s.anilistId
        : [e.media.title.romaji, e.media.title.english, e.media.title.native].filter(Boolean).map(norm).some((t) => t === want || t.includes(want) || want.includes(t)));
      if (hit) out[s.id] = hit.progress;
    }
    return out;
  } catch (e) { return {}; }
}

// ---------- drawing helpers ----------
const BG = "#0b0a0d";
const col = (hex, a) => new Color(hex, a == null ? 1 : a);
const white = (a) => col("#ffffff", a);
const track = (t) => t.split("").join(" ");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const shortDate = (d) => MONTHS[d.getMonth()] + " " + d.getDate();
const daysAgo = (d) => Math.floor((Date.now() - d.getTime()) / 86400000);
function ago(d) {
  const m = Math.max(1, Math.round((Date.now() - d.getTime()) / 60000));
  if (m < 60) return m + "m ago";
  const h = Math.round(m / 60); if (h < 24) return h + "h ago";
  const days = Math.round(h / 24); return days < 30 ? days + "d ago" : Math.round(days / 30) + "mo ago";
}
const fmtCh = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const display = (size) => new Font(DISPLAY, size);
function textWidth(str, fs, condensed) {
  let w = 0;
  for (const ch of str || "") {
    if (condensed) { w += ch === " " ? fs * 0.22 : /[IJ1il.,:]/.test(ch) ? fs * 0.3 : /[MW]/.test(ch) ? fs * 0.72 : fs * 0.5; continue; }
    if (ch === " ") w += fs * 0.28;
    else if (/[ilIjtf.,!:;'|]/.test(ch)) w += fs * 0.30;
    else if (/[mwMW]/.test(ch)) w += fs * 0.85;
    else if (/[A-Z0-9]/.test(ch)) w += fs * 0.64;
    else w += fs * 0.55;
  }
  return w;
}
function fitLine(t, fs, maxW, condensed) {
  if (textWidth(t, fs, condensed) <= maxW) return t;
  while (t.length > 1 && textWidth(t + "…", fs, condensed) > maxW) t = t.slice(0, -1);
  return t.trim() + "…";
}
function rounded(ctx, x, y, w, h, r, c) { ctx.setFillColor(c); const p = new Path(); p.addRoundedRect(new Rect(x, y, w, h), r, r); ctx.addPath(p); ctx.fillPath(); }
function strokeRounded(ctx, x, y, w, h, r, c, lw) { ctx.setStrokeColor(c); ctx.setLineWidth(lw); const p = new Path(); p.addRoundedRect(new Rect(x, y, w, h), r, r); ctx.addPath(p); ctx.strokePath(); }
function dot(ctx, cx, cy, r, c) { ctx.setFillColor(c); const p = new Path(); p.addEllipse(new Rect(cx - r, cy - r, r * 2, r * 2)); ctx.addPath(p); ctx.fillPath(); }
function newCtx(w, h) { const c = new DrawContext(); c.size = new Size(w, h); c.respectScreenScale = true; c.opaque = false; return c; }
let CORNER_BG = col(BG);
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
function cover(img, w, h, r, biasY) {
  const iw = img.size.width, ih = img.size.height, sc = Math.max(w / iw, h / ih), dw = iw * sc, dh = ih * sc;
  const c = newCtx(w, h);
  c.drawImageInRect(img, new Rect((w - dw) / 2, (h - dh) * (biasY == null ? 0.5 : biasY), dw, dh));
  return r ? roundedImage(c.getImage(), w, h, r) : c.getImage();
}
// 1-pt strips, whole-number edges, no overlap (overlapping alpha strips show as stripes)
function shade(ctx, x, y, w, h, dir, a0, a1, hex, ease) {
  const n = Math.round(dir === "v" ? h : w);
  for (let i = 0; i < n; i++) {
    let t = n > 1 ? i / (n - 1) : 0;
    if (ease) t = t * t * (3 - 2 * t);
    ctx.setFillColor(col(hex || BG, a0 + (a1 - a0) * t));
    if (dir === "v") ctx.fillRect(new Rect(Math.round(x), Math.round(y) + i, Math.round(w), 1));
    else ctx.fillRect(new Rect(Math.round(x) + i, Math.round(y), 1, Math.round(h)));
  }
}
// manga screentone: a dot grid whose dots shrink away from a corner
function screentone(ctx, x, y, w, h, fromX, fromY, reach, maxR, c) {
  const step = 6;
  for (let gy = y; gy <= y + h; gy += step) {
    for (let gx = x + ((gy - y) / step % 2 ? step / 2 : 0); gx <= x + w; gx += step) {
      const d = Math.hypot(gx - fromX, gy - fromY) / reach;
      const r = maxR * (1 - d);
      if (r > 0.35) dot(ctx, gx, gy, r, c);
    }
  }
}
function drawPill(ctx, label, x, y) {
  const PFS = 11, PILL_H = 28, ICON_W = 8, GAP_I = 7, PAD_X = 15;
  const labelW = Math.ceil(textWidth(label, PFS) * 1.08);
  const pillW = PAD_X + ICON_W + GAP_I + labelW + PAD_X, midY = y + PILL_H / 2;
  rounded(ctx, x, y, pillW, PILL_H, PILL_H / 2, white(0.95));
  const ix = x + PAD_X;
  ctx.setFillColor(col("#111111"));
  const page = (pts) => { const p = new Path(); p.move(pts[0]); pts.slice(1).forEach((q) => p.addLine(q)); p.closeSubpath(); ctx.addPath(p); ctx.fillPath(); };
  page([new Point(ix + 3.6, midY - 3), new Point(ix - 0.5, midY - 5), new Point(ix - 0.5, midY + 3.8), new Point(ix + 3.6, midY + 5.6)]);
  page([new Point(ix + 4.6, midY - 3), new Point(ix + 8.7, midY - 5), new Point(ix + 8.7, midY + 3.8), new Point(ix + 4.6, midY + 5.6)]);
  ctx.setFont(Font.boldSystemFont(PFS)); ctx.setTextColor(col("#111111")); ctx.setTextAlignedCenter();
  ctx.drawTextInRect(label, new Rect(ix + ICON_W + GAP_I, midY - PFS * 0.6, labelW, PFS * 1.3));
  ctx.setTextAlignedLeft();
}
// which of the last 8 weeks (Mon–Sun) had a chapter; [oldest … this week]
function rhythm(chapters) {
  const now = new Date(), monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const weeks = [];
  for (let i = 7; i >= 0; i--) {
    const start = new Date(monday.getTime() - i * 7 * 86400000), end = new Date(start.getTime() + 7 * 86400000);
    weeks.push(chapters.filter((c) => c.date >= start && c.date < end).length);
  }
  return weeks;
}

// ---------- LARGE: 364 × 382 on iPhone, square 364 × 364 on the Mac (which draws large widgets square) ----------
const W = 364, H = Device.isPhone() ? 382 : 364, PAD = 18;

function drawLarge(main, others, updated) {
  const ctx = newCtx(W, H);
  ctx.opaque = true;
  ctx.setFillColor(col(BG)); ctx.fillRect(new Rect(0, 0, W, H));
  const latest = main.chapters[0];
  const CARD_Y = 222, CARD_H = H - PAD - CARD_Y;

  // cover art bleeding in from the right, fading into the page
  const CW = 214, CX = W - CW, CH = CARD_Y - 6;
  if (main.img) {
    ctx.drawImageInRect(cover(main.img, CW, CH, 0, main.focus == null ? 0.3 : main.focus), new Rect(CX, 0, CW, CH));
    shade(ctx, CX, 0, 140, CH, "h", 1, 0, BG, true);
    shade(ctx, CX, CH - 80, CW, 80, "v", 0, 1, BG, true);
    ctx.setFillColor(col(BG, 0.1)); ctx.fillRect(new Rect(CX, 0, CW, CH));
  }

  // screentone + giant ghost chapter number
  screentone(ctx, 0, 110, 200, 110, 0, 220, 200, 2.1, white(0.06));
  if (latest) { ctx.setFont(display(140)); ctx.setTextColor(white(0.06)); ctx.drawText(fmtCh(latest.num), new Point(PAD - 6, 52)); }

  // kicker
  const fresh = latest && daysAgo(latest.date) < NEW_DAYS;
  let kick = fresh ? "NEW CHAPTER" : "LATEST", hot = fresh;
  if (main.unread != null) { kick = main.unread > 0 ? fmtCh(main.unread) + " UNREAD" : "CAUGHT UP"; hot = main.unread > 0; }
  let kx = PAD;
  if (hot) { dot(ctx, PAD + 3.5, PAD + 5.5, 3.5, col(ACCENT)); kx = PAD + 12; }
  ctx.setFont(Font.boldSystemFont(8.5)); ctx.setTextColor(white(hot ? 0.85 : 0.6));
  ctx.drawText(track(kick), new Point(kx, PAD));

  // title + author
  const TW = 196, title = main.name.toUpperCase();
  let tfs = 32; while (tfs > 20 && textWidth(title, tfs, true) > TW) tfs -= 1;
  ctx.setFont(display(tfs)); ctx.setTextColor(white(1));
  ctx.drawText(fitLine(title, tfs, TW, true), new Point(PAD, PAD + 12));
  if (main.author) {
    ctx.setFont(Font.semiboldSystemFont(9.5)); ctx.setTextColor(white(0.5));
    ctx.drawText(fitLine(main.author, 9.5, TW), new Point(PAD, PAD + 13 + tfs * 1.08));
  }

  // chapter number, big
  if (latest) {
    const ny = 86;
    ctx.setFont(Font.heavySystemFont(9)); ctx.setTextColor(col(ACCENT));
    ctx.drawText(track("CHAPTER"), new Point(PAD, ny));
    ctx.setFont(display(56)); ctx.setTextColor(white(1));
    ctx.drawText(fmtCh(latest.num), new Point(PAD - 2, ny + 7));
    ctx.setFont(Font.semiboldSystemFont(10.5)); ctx.setTextColor(white(0.65));
    ctx.drawText(DAYS[latest.date.getDay()] + ", " + shortDate(latest.date) + "  ·  " + ago(latest.date), new Point(PAD, ny + 70));
  }

  // 8-week release rhythm + Read
  const RY = 176, weeks = rhythm(main.chapters), SQ = 11, SG = 4;
  ctx.setFont(Font.boldSystemFont(7.5)); ctx.setTextColor(white(0.42));
  ctx.drawText(track("LAST 8 WEEKS"), new Point(PAD, RY));
  weeks.forEach((n, i) => {
    const x = PAD + i * (SQ + SG), yy = RY + 13, last = i === weeks.length - 1;
    if (n > 0) rounded(ctx, x, yy, SQ, SQ, 2.5, last ? col(ACCENT) : white(0.9));
    else strokeRounded(ctx, x + 0.5, yy + 0.5, SQ - 1, SQ - 1, 2.2, white(last ? 0.5 : 0.22), 1);
  });
  drawPill(ctx, "Read", PAD + 8 * (SQ + SG) + 10, RY + 4);

  // the rest of the list: big cover cards, cover fills the card, text over a dark fade
  const GAP = 10, CDW = (W - PAD * 2 - GAP) / 2;
  others.slice(0, 2).forEach((s, i) => {
    const x = PAD + i * (CDW + GAP), y = CARD_Y;
    if (s.img) ctx.drawImageInRect(cover(s.img, CDW, CARD_H, 0, s.imgIsBanner ? 0.5 : (s.focus == null ? 0.25 : s.focus)), new Rect(x, y, CDW, CARD_H));
    else { ctx.setFillColor(col("#2a2630")); ctx.fillRect(new Rect(x, y, CDW, CARD_H)); }
    shade(ctx, x, y + CARD_H * 0.3, CDW, CARD_H * 0.7, "v", 0, 0.94, BG, true);
    ctx.setStrokeColor(white(0.16)); ctx.setLineWidth(1); ctx.strokeRect(new Rect(x + 0.5, y + 0.5, CDW - 1, CARD_H - 1));

    const c = s.chapters[0], isNew = c && daysAgo(c.date) < NEW_DAYS;
    const badge = s.unread != null ? (s.unread > 0 ? fmtCh(s.unread) + " NEW" : "✓") : isNew ? "NEW" : "";
    if (badge) {
      const bw = Math.max(30, textWidth(badge, 8.5) + 14), bx = x + CDW - 8 - bw, by = y + 8, lit = badge !== "✓";
      rounded(ctx, bx, by, bw, 18, 9, lit ? col(ACCENT) : col(BG, 0.7));
      ctx.setTextAlignedCenter(); ctx.setFont(Font.heavySystemFont(8.5)); ctx.setTextColor(white(lit ? 1 : 0.8));
      ctx.drawTextInRect(track(badge), new Rect(bx, by + 4, bw, 11)); ctx.setTextAlignedLeft();
    }
    const tx = x + 10, tw = CDW - 20, nm = s.name.toUpperCase();
    let nfs = 17; while (nfs > 12 && textWidth(nm, nfs, true) > tw) nfs -= 0.5;
    ctx.setFont(display(nfs)); ctx.setTextColor(white(1));
    ctx.drawText(fitLine(nm, nfs, tw, true), new Point(tx, y + CARD_H - 50));
    if (c) {
      ctx.setFont(Font.boldSystemFont(7.5)); ctx.setTextColor(col(ACCENT));
      ctx.drawText(track("CH"), new Point(tx, y + CARD_H - 21));
      ctx.setFont(display(20)); ctx.setTextColor(white(1));
      ctx.drawText(fmtCh(c.num), new Point(tx + 15, y + CARD_H - 30));
      ctx.setFont(Font.semiboldSystemFont(9.5)); ctx.setTextColor(white(0.6));
      ctx.setTextAlignedRight(); ctx.drawTextInRect(ago(c.date), new Rect(x, y + CARD_H - 22, CDW - 10, 12)); ctx.setTextAlignedLeft();
    }
  });
  return ctx.getImage();
}

// ---------- main ----------
const [pages, progress, art] = await Promise.all([Promise.all(SERIES.map((s) => fetchSeries(s.id))), fetchProgress(), fetchArt()]);
const list = SERIES.map((s, i) => {
  const { chapters, author } = pages[i];
  const read = typeof progress[s.id] === "number" ? progress[s.id] : null;
  const unread = read != null && chapters[0] ? Math.max(0, Math.round((chapters[0].num - Math.min(read, chapters[0].num)) * 10) / 10) : null;
  return Object.assign({}, s, { chapters, author, read, unread });
});
const main = list[0];
const others = list.slice(1).sort((a, b) => (b.chapters[0] ? b.chapters[0].date : 0) - (a.chapters[0] ? a.chapters[0].date : 0));
// hero: hi-res cover cropped by focus; cards: the wide banner when there is one (no logos), else the cover
const pick = async (urls) => { for (const [u, h, kind] of urls) { if (!u) continue; const im = await loadImage(u, h); if (im) return { im, kind }; } return { im: null }; };
const A = (s) => art[s.anilistId] || {};
const cards = others.slice(0, 2);
const imgs = await Promise.all([
  pick([[A(main).cover], [coverUrl(main.id), UA]]),
  ...cards.map((s) => pick([[A(s).banner, null, "banner"], [A(s).cover], [coverUrl(s.id), UA]])),
]);
main.img = imgs[0].im;
cards.forEach((s, i) => { s.img = imgs[1 + i].im; s.imgIsBanner = imgs[1 + i].kind === "banner"; });

const widget = new ListWidget();
widget.setPadding(0, 0, 0, 0);
widget.url = TAP_URL;
if (!main.chapters.length && others.every((s) => !s.chapters.length)) {
  widget.backgroundColor = col(BG);
  const t = widget.addText("Couldn't reach WeebCentral"); t.font = Font.boldSystemFont(14); t.textColor = white(0.8);
} else {
  const df = new DateFormatter(); df.useNoDateStyle(); df.useShortTimeStyle();
  widget.backgroundImage = drawLarge(main, others, df.string(new Date()));
}
widget.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000);
if (config.runsInWidget) Script.setWidget(widget);
else await widget.presentLarge();
Script.complete();
