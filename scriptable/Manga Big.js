// ============================================
// MANGA BIG — large widget (Scriptable)
// Kagurabachi up top (cover, latest chapter, release date, the last six
// chapters), the rest of your list below. Same style as Simkl Big.
// Works on the iPhone home screen and on the Mac via "Use iPhone widgets".
//
// SETUP: paste into Scriptable, name it "Manga Big", add a LARGE
// Scriptable widget, set Script = Manga Big. Tap = open Tachimanga.
// Data: WeebCentral RSS. Unread counts appear only if your AniList list is public.
// ============================================

// first entry is the big one
const SERIES = [
  { id: "01J76XYGGM22WZP7T4TKA4ZFAF", name: "Kagurabachi", anilistId: null },
  { id: "01J76XYE3130E1W5HKTJ7VD912", name: "Sakamoto Days", anilistId: null },
  { id: "01K4JBKB0VX8TCFSSF1MK2DTZZ", name: "JJK: Modulo", anilistId: null },
];
const ANILIST_USERNAME = "MastaDeBlasta";
const ACCENT = "#ff4b3e";
const TAP_URL = "tachimanga://";
const NEW_DAYS = 7;                  // "NEW" for chapters released within this many days

const UA = { "User-Agent": "MangaRadarWidget/3.0" };

// ---------- data ----------
const clean = (s) => (s || "").replace(/<!\[CDATA\[|\]\]>/g, "").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').trim();
const chNum = (s) => { const m = (s || "").match(/(?:Chapter|Episode|Days|Ch\.?)\s*([\d.]+)/i) || (s || "").match(/([\d.]+)\s*$/); return m ? parseFloat(m[1]) : null; };

async function fetchChapters(id) {
  try {
    const r = new Request("https://weebcentral.com/series/" + id + "/rss");
    r.headers = UA; r.timeoutInterval = 15;
    const xml = await r.loadString();
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
    return items.map((it) => {
      const get = (tag) => { const m = it.match(new RegExp("<" + tag + ">([\\s\\S]*?)</" + tag + ">")); return m ? clean(m[1]) : ""; };
      return { num: chNum(get("title")), date: new Date(get("pubDate")) };
    }).filter((c) => c.num != null && !isNaN(c.date));
  } catch (e) { return []; }
}
async function loadImage(url, headers) {
  try { const r = new Request(url); if (headers) r.headers = headers; r.timeoutInterval = 15; return await r.loadImage(); } catch (e) { return null; }
}
const coverUrl = (id) => "https://temp.compsci88.com/cover/fallback/" + id + ".jpg";
const blurCoverUrl = (id) => "https://wsrv.nl/?url=temp.compsci88.com/cover/fallback/" + id + ".jpg&w=400&blur=30&output=jpg";

// AniList progress by series (null when the list is private or a title isn't on it)
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

// ---------- drawing helpers (same as Simkl Big) ----------
const BG = "#0e0c10";
const col = (hex, a) => new Color(hex, a == null ? 1 : a);
const white = (a) => col("#ffffff", a);
const track = (t) => t.split("").join(" ");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shortDate = (d) => MONTHS[d.getMonth()] + " " + d.getDate();
const daysAgo = (d) => Math.floor((Date.now() - d.getTime()) / 86400000);
function ago(d) {
  const m = Math.max(1, Math.round((Date.now() - d.getTime()) / 60000));
  if (m < 60) return m + "m ago";
  const h = Math.round(m / 60); if (h < 24) return h + "h ago";
  const days = Math.round(h / 24); return days < 30 ? days + "d ago" : Math.round(days / 30) + "mo ago";
}
const fmtCh = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
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
function fitSize(t, maxW, ladder) { for (const fs of ladder) if (textWidth(t, fs) <= maxW) return fs; return ladder[ladder.length - 1]; }
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
function shade(ctx, x, y, w, h, dir, a0, a1, hex) {
  const n = Math.round(dir === "v" ? h : w);
  for (let i = 0; i < n; i++) {
    const t = n > 1 ? i / (n - 1) : 0;
    ctx.setFillColor(col(hex || BG, a0 + (a1 - a0) * t));
    if (dir === "v") ctx.fillRect(new Rect(Math.round(x), Math.round(y) + i, Math.round(w), 1));
    else ctx.fillRect(new Rect(Math.round(x) + i, Math.round(y), 1, Math.round(h)));
  }
}
function drawPill(ctx, label, x, y) {
  const PFS = 11, PILL_H = 28, ICON_W = 8, GAP_I = 7, PAD_X = 15;
  const labelW = Math.ceil(textWidth(label, PFS) * 1.08);
  const pillW = PAD_X + ICON_W + GAP_I + labelW + PAD_X, midY = y + PILL_H / 2;
  rounded(ctx, x, y, pillW, PILL_H, PILL_H / 2, white(0.94));
  const ix = x + PAD_X;
  // open book: two pages tilted up from the spine
  ctx.setFillColor(col("#111111"));
  const page = (pts) => { const p = new Path(); p.move(pts[0]); pts.slice(1).forEach((q) => p.addLine(q)); p.closeSubpath(); ctx.addPath(p); ctx.fillPath(); };
  page([new Point(ix + 3.6, midY - 3), new Point(ix - 0.5, midY - 5), new Point(ix - 0.5, midY + 3.8), new Point(ix + 3.6, midY + 5.6)]);
  page([new Point(ix + 4.6, midY - 3), new Point(ix + 8.7, midY - 5), new Point(ix + 8.7, midY + 3.8), new Point(ix + 4.6, midY + 5.6)]);
  ctx.setFont(Font.boldSystemFont(PFS)); ctx.setTextColor(col("#111111")); ctx.setTextAlignedCenter();
  ctx.drawTextInRect(label, new Rect(ix + ICON_W + GAP_I, midY - PFS * 0.6, labelW, PFS * 1.3));
  ctx.setTextAlignedLeft();
}

// ---------- LARGE 364 × 382 ----------
const W = 364, H = 382, PAD = 16;

function drawLarge(main, others, updated) {
  const ctx = newCtx(W, H);
  ctx.opaque = true;
  ctx.setFillColor(col(BG)); ctx.fillRect(new Rect(0, 0, W, H));
  CORNER_BG = col(BG);

  // backdrop: the cover, blurred
  const HERO_H = 230;
  if (main.backdrop) {
    ctx.drawImageInRect(cover(main.backdrop, W, HERO_H, 0, 0.3), new Rect(0, 0, W, HERO_H));
    ctx.setFillColor(col(BG, 0.35)); ctx.fillRect(new Rect(0, 0, W, HERO_H));
    shade(ctx, 0, 0, W, HERO_H, "h", 0.85, 0.2, BG);
    shade(ctx, 0, 100, W, HERO_H - 100, "v", 0, 1, BG);
  }

  // cover
  const PX = PAD, PY = PAD, PW = 92, PH = 138;
  rounded(ctx, PX - 1, PY - 1, PW + 2, PH + 2, 11, white(0.14));
  if (main.img) ctx.drawImageInRect(cover(main.img, PW, PH, 10, 0.2), new Rect(PX, PY, PW, PH));
  else rounded(ctx, PX, PY, PW, PH, 10, col("#2a2630"));

  const TX = PX + PW + 14, TW = W - PAD - TX;
  const latest = main.chapters[0];
  const fresh = latest && daysAgo(latest.date) < NEW_DAYS;

  // kicker
  let kick = "LATEST CHAPTER", hot = fresh;
  if (main.unread != null) { kick = main.unread > 0 ? fmtCh(main.unread) + " UNREAD" : "CAUGHT UP"; hot = main.unread > 0; }
  else if (fresh) kick = "NEW CHAPTER";
  let kx = TX;
  if (hot) { dot(ctx, TX + 3.5, PY + 7, 3.5, col(ACCENT)); kx = TX + 12; }
  ctx.setFont(Font.boldSystemFont(8.5)); ctx.setTextColor(white(0.62)); ctx.setTextAlignedLeft();
  ctx.drawText(track(kick), new Point(kx, PY + 1.5));

  // title
  const tfs = fitSize(main.name, TW, [26, 23, 20, 17]);
  ctx.setFont(Font.heavySystemFont(tfs)); ctx.setTextColor(white(1));
  ctx.drawText(fitLine(main.name, tfs, TW), new Point(TX, PY + 18));

  // big chapter number
  if (latest) {
    const ny = PY + 18 + tfs * 1.08 + 6;
    ctx.setFont(Font.boldSystemFont(10)); ctx.setTextColor(white(0.55));
    ctx.drawText(track("CH"), new Point(TX, ny + 9));
    ctx.setFont(Font.heavySystemFont(30)); ctx.setTextColor(white(1));
    ctx.drawText(fmtCh(latest.num), new Point(TX + 22, ny - 2));
    ctx.setFont(Font.semiboldSystemFont(10.5)); ctx.setTextColor(white(0.6));
    ctx.drawText(fitLine(shortDate(latest.date) + "  ·  " + ago(latest.date), 10.5, TW), new Point(TX, ny + 34));
  }

  drawPill(ctx, "Read", TX, PY + PH - 28);

  // last six chapters
  const CY = PY + PH + 16;
  ctx.setFont(Font.boldSystemFont(8.5)); ctx.setTextColor(white(0.5));
  ctx.drawText(track("RECENT CHAPTERS"), new Point(PAD, CY));
  ctx.setTextAlignedRight(); ctx.drawTextInRect(updated, new Rect(W - PAD - 120, CY, 120, 12)); ctx.setTextAlignedLeft();
  const chips = main.chapters.slice(0, 6), CG = 6, CHW = (W - PAD * 2 - CG * 5) / 6, CHH = 36, chipY = CY + 15;
  chips.forEach((c, i) => {
    const x = PAD + i * (CHW + CG), newest = i === 0;
    const unread = main.read != null && c.num > main.read;
    if (newest) rounded(ctx, x, chipY, CHW, CHH, 9, white(0.94));
    else rounded(ctx, x, chipY, CHW, CHH, 9, white(0.07));
    if (unread) strokeRounded(ctx, x + 0.75, chipY + 0.75, CHW - 1.5, CHH - 1.5, 8.5, col(ACCENT), 1.5);
    ctx.setTextAlignedCenter();
    ctx.setFont(Font.heavySystemFont(13)); ctx.setTextColor(newest ? col("#111111") : white(0.95));
    ctx.drawTextInRect(fmtCh(c.num), new Rect(x, chipY + 5, CHW, 16));
    ctx.setFont(Font.semiboldSystemFont(8.5)); ctx.setTextColor(newest ? col("#111111", 0.6) : white(0.5));
    ctx.drawTextInRect(shortDate(c.date), new Rect(x, chipY + 21, CHW, 11));
    ctx.setTextAlignedLeft();
  });

  // the rest of the list
  const LY = chipY + CHH + 14;
  ctx.setFont(Font.boldSystemFont(8.5)); ctx.setTextColor(white(0.5));
  ctx.drawText(track("ALSO READING"), new Point(PAD, LY));
  const RG = 8, RY0 = LY + 15, RH = (H - PAD - RY0 - RG) / 2;
  others.slice(0, 2).forEach((s, i) => {
    const x = PAD, y = RY0 + i * (RH + RG), w = W - PAD * 2;
    rounded(ctx, x, y, w, RH, 12, white(0.065));
    strokeRounded(ctx, x + 0.5, y + 0.5, w - 1, RH - 1, 11.5, white(0.08), 1);
    const th = RH - 12, tw = Math.round(th * 2 / 3);
    if (s.img) { CORNER_BG = col("#1a181c"); ctx.drawImageInRect(cover(s.img, tw, th, 5, 0.2), new Rect(x + 6, y + 6, tw, th)); }
    else rounded(ctx, x + 6, y + 6, tw, th, 5, col("#2a2630"));
    const c = s.chapters[0], tx = x + 6 + tw + 10;
    const isNew = c && daysAgo(c.date) < NEW_DAYS;
    const badge = s.unread != null ? (s.unread > 0 ? fmtCh(s.unread) + " NEW" : "✓") : isNew ? "NEW" : "";
    const bw = badge ? Math.max(24, textWidth(badge, 8.5) + 14) : 0;
    ctx.setFont(Font.boldSystemFont(12.5)); ctx.setTextColor(white(1));
    ctx.drawText(fitLine(s.name, 12.5, x + w - tx - bw - 16), new Point(tx, y + RH / 2 - 15));
    ctx.setFont(Font.semiboldSystemFont(10)); ctx.setTextColor(white(0.55));
    ctx.drawText(c ? "Ch " + fmtCh(c.num) + "  ·  " + ago(c.date) : "No chapters found", new Point(tx, y + RH / 2 + 2));
    if (badge) {
      const bx = x + w - 10 - bw, by = y + RH / 2 - 9;
      const lit = badge !== "✓";
      if (lit) rounded(ctx, bx, by, bw, 18, 9, col(ACCENT)); else strokeRounded(ctx, bx + 0.5, by + 0.5, bw - 1, 17, 8.5, white(0.4), 1);
      ctx.setTextAlignedCenter(); ctx.setFont(Font.heavySystemFont(8.5)); ctx.setTextColor(white(lit ? 1 : 0.7));
      ctx.drawTextInRect(track(badge), new Rect(bx, by + 4, bw, 11)); ctx.setTextAlignedLeft();
    }
  });
  return ctx.getImage();
}

// ---------- main ----------
const [chapterLists, progress] = await Promise.all([Promise.all(SERIES.map((s) => fetchChapters(s.id))), fetchProgress()]);
const list = SERIES.map((s, i) => {
  const chapters = chapterLists[i];
  const read = typeof progress[s.id] === "number" ? progress[s.id] : null;
  const unread = read != null && chapters[0] ? Math.max(0, Math.round((chapters[0].num - Math.min(read, chapters[0].num)) * 10) / 10) : null;
  return Object.assign({}, s, { chapters, read, unread });
});
const main = list[0];
const others = list.slice(1).sort((a, b) => (b.chapters[0] ? b.chapters[0].date : 0) - (a.chapters[0] ? a.chapters[0].date : 0));
const imgs = await Promise.all([loadImage(coverUrl(main.id), UA), loadImage(blurCoverUrl(main.id)), ...others.slice(0, 2).map((s) => loadImage(coverUrl(s.id), UA))]);
main.img = imgs[0]; main.backdrop = imgs[1];
others.slice(0, 2).forEach((s, i) => { s.img = imgs[2 + i]; });

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
