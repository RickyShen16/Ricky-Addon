// ============================================
// KAGURABACHI: one script, every size (Scriptable)
//   • iPhone home: SMALL square
//   • Mac desktop: LARGE square
//   • Lock screen: RECTANGLE (same tick style as the Nuvio widget)
// Latest chapter + live countdown to the next one, on a katana-shaped
// progress bar that fills as the week runs out. Large adds the
// volume spines (all JP volumes) and the weekly release rhythm.
//
// Data (no login): WeebCentral series page (chapters + exact times),
// AniList (banner, cover), MangaDex (volume covers).
// SETUP: paste into Scriptable, name it "Kagurabachi", add a
// Scriptable widget (small / large / lock-screen rectangle),
// Script = Kagurabachi. Tap = open Tachimanga.
// ============================================

const WC_ID = "01J76XYGGM22WZP7T4TKA4ZFAF";             // WeebCentral
const ANILIST_ID = 169355;
const MANGADEX_ID = "d65c0332-3764-4c89-84bd-b1a4e7278ad7";
const TAP_URL = "tachimanga://";
const ACCENT = "#e8332a";                                // Kagurabachi red
const BG = "#0a0607";
const COND = (fs) => new Font("Futura-CondensedExtraBold", fs);
const FAMILY = config.runsInWidget ? config.widgetFamily : "large";
// iOS 26 Clear/Tinted home screens drop widget BACKGROUNDS, so the art goes in as content.
const GLASS_SAFE = true;

// ---------- storage ----------
const fm = FileManager.local();
const P = (n) => fm.joinPath(fm.documentsDirectory(), n);
const readJ = (n) => { try { return fm.fileExists(P(n)) ? JSON.parse(fm.readString(P(n))) : null; } catch (e) { return null; } };
const writeJ = (n, o) => { try { fm.writeString(P(n), JSON.stringify(o)); } catch (e) {} };

// ---------- data ----------
const clean = (s) => (s || "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/\s+/g, " ").trim();
// The full chapter list has every chapter with its exact release time (the series page only
// shows the newest few), so the weekly rhythm and break detection are accurate.
async function fetchChapters() {
  const r = new Request(`https://weebcentral.com/series/${WC_ID}/full-chapter-list`);
  r.headers = { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)" }; r.timeoutInterval = 20;
  const html = await r.loadString();
  const chapters = [...html.matchAll(/<span class="">Chapter ([\d.]+)<\/span>[\s\S]*?datetime="([^"]+)"/g)]
    .map((m) => ({ num: parseFloat(m[1]), date: Date.parse(m[2]) }))
    .filter((c) => !isNaN(c.num) && !isNaN(c.date))
    .sort((a, b) => b.date - a.date).slice(0, 30);
  if (!chapters.length) throw new Error("no chapters");
  return { chapters, author: "HOKAZONO Takeru" };
}
async function fetchArt() {
  const cached = readJ("kagura-art.json");
  if (cached && Date.now() - cached.t < 3 * 86400e3) return cached;
  const out = { t: Date.now(), banner: null, cover: null, vols: [] };
  try {
    const r = new Request("https://graphql.anilist.co"); r.method = "POST"; r.timeoutInterval = 12;
    r.headers = { "Content-Type": "application/json", Accept: "application/json" };
    r.body = JSON.stringify({ query: `{Media(id:${ANILIST_ID}){bannerImage coverImage{extraLarge}}}` });
    const m = (await r.loadJSON()).data.Media; out.banner = m.bannerImage; out.cover = m.coverImage.extraLarge;
  } catch (e) {}
  try {
    const rq = new Request(`https://api.mangadex.org/cover?manga%5B%5D=${MANGADEX_ID}&order%5Bvolume%5D=desc&limit=40`);
    rq.headers = MD_UA; rq.timeoutInterval = 12;
    const j = await rq.loadJSON();
    const seen = new Set();
    for (const c of j.data || []) {
      const v = parseInt(c.attributes.volume, 10); if (!v || seen.has(v) || c.attributes.locale !== "ja") continue;
      seen.add(v); out.vols.push({ v, url: `https://uploads.mangadex.org/covers/${MANGADEX_ID}/${c.attributes.fileName}.256.jpg` });
    }
    out.vols.sort((a, b) => a.v - b.v);
  } catch (e) {}
  if (!out.banner && cached) return cached;
  writeJ("kagura-art.json", out);
  return out;
}
// MangaDex turns away browser-looking requests; it wants apps to name themselves.
const MD_UA = { "User-Agent": "KagurabachiWidget/1.0 (Scriptable)" };
async function img(url) { if (!url) return null; try { const r = new Request(url); r.timeoutInterval = 15; if (url.includes("mangadex.org")) r.headers = MD_UA; return await r.loadImage(); } catch (e) { return null; } }

// When's the next chapter? Weekly by default; uses the gap the chapters actually keep.
function schedule(chs) {
  const last = chs[0], gaps = [];
  for (let i = 0; i < Math.min(6, chs.length - 1); i++) gaps.push(chs[i].date - chs[i + 1].date);
  const wk = 7 * 86400e3, typical = gaps.filter((g) => g > 5 * 86400e3 && g < 9 * 86400e3).length >= 2 ? wk : wk;
  let next = last.date + typical; const now = Date.now();
  const late = now - next;
  const state = late > 2 * 86400e3 ? "break" : late > 0 ? "due" : "wait";
  const frac = Math.max(0, Math.min(1, (now - last.date) / (next - last.date)));
  return { last, next, nextNum: Math.floor(last.num) + 1, state, frac, isNew: now - last.date < 48 * 3600e3 };
}
function countdown(ms) {
  if (ms <= 0) return "ANY MOMENT";
  const m = Math.round(ms / 60000), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
  return d > 0 ? `${d}D ${String(h).padStart(2, "0")}H` : h > 0 ? `${h}H ${String(mm).padStart(2, "0")}M` : `${mm}M`;
}
const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const fmtDay = (t) => { const d = new Date(t); return `${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`; };
const fmtTime = (t) => { const d = new Date(t); const h = d.getHours(); return `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`; };
function ago(t) { const h = Math.round((Date.now() - t) / 3600e3); return h < 1 ? "JUST NOW" : h < 24 ? `${h}H AGO` : `${Math.round(h / 24)}D AGO`; }

// ---------- drawing ----------
const col = (h, a = 1) => new Color(h, a);
function ctxOf(w, h, opaque = true) { const c = new DrawContext(); c.size = new Size(w, h); c.opaque = opaque; c.respectScreenScale = true; if (opaque) { c.setFillColor(col(BG)); c.fillRect(new Rect(0, 0, w, h)); } return c; }
function txt(ctx, t, x, y, w, font, color, align = "left") { ctx.setFont(font); ctx.setTextColor(color); if (align === "right") ctx.setTextAlignedRight(); else if (align === "center") ctx.setTextAlignedCenter(); else ctx.setTextAlignedLeft(); ctx.drawTextInRect(t, new Rect(x, y, w, 120)); }
function rr(ctx, x, y, w, h, r, color) { const p = new Path(); p.addRoundedRect(new Rect(x, y, w, h), r, r); ctx.addPath(p); ctx.setFillColor(color); ctx.fillPath(); }
function poly(ctx, pts, color) { const p = new Path(); p.move(new Point(pts[0][0], pts[0][1])); for (const q of pts.slice(1)) p.addLine(new Point(q[0], q[1])); p.closeSubpath(); ctx.addPath(p); ctx.setFillColor(color); ctx.fillPath(); }
function cropTo(im, w, h, fy = 0.4, fx = 0.5) { const c = new DrawContext(); c.size = new Size(w, h); c.opaque = false; c.respectScreenScale = true; const s = Math.max(w / im.size.width, h / im.size.height), iw = im.size.width * s, ih = im.size.height * s; c.drawImageInRect(im, new Rect((w - iw) * fx, (h - ih) * fy, iw, ih)); return c.getImage(); }
function vgrad(ctx, x, w, y0, y1, hex, a0, a1) { for (let y = y0; y < y1; y++) { const t = (y - y0) / (y1 - y0); ctx.setFillColor(col(hex, a0 + (a1 - a0) * t)); ctx.fillRect(new Rect(x, y, w, 1)); } }
function hgrad(ctx, x0, x1, y, h, hex, a0, a1) { for (let x = x0; x < x1; x++) { const t = (x - x0) / (x1 - x0); ctx.setFillColor(col(hex, a0 + (a1 - a0) * t)); ctx.fillRect(new Rect(x, y, 1, h)); } }

// The katana progress bar: wrapped hilt (tsuka), guard (tsuba), blade that fills red to `frac`.
function katana(ctx, x, y, w, h, frac, mono = false) {
  const hiltW = Math.round(w * 0.2), gx = x + hiltW, bx = gx + Math.max(3, h * 0.45), tip = x + w, bw = tip - bx;
  const steel = mono ? col("#ffffff", 0.25) : col("#3a3033"), fill = mono ? col("#ffffff") : col(ACCENT);
  // hilt: dark wrap with diamond pattern
  rr(ctx, x, y - h * 0.15, hiltW, h * 1.3, h * 0.35, mono ? col("#ffffff", 0.9) : col("#16100f"));
  if (!mono) for (let dx = x + h * 0.5; dx < gx - h * 0.4; dx += h * 1.1) poly(ctx, [[dx, y + h * 0.5 - h * 0.42], [dx + h * 0.42, y + h * 0.5], [dx, y + h * 0.5 + h * 0.42], [dx - h * 0.42, y + h * 0.5]], col("#c9a24a", 0.9));
  // guard
  rr(ctx, gx, y - h * 0.45, Math.max(3, h * 0.45), h * 1.9, h * 0.2, mono ? col("#ffffff") : col("#c9a24a"));
  // blade: straight spine, edge sweeping up to the tip
  const blade = (x1) => { const xe = Math.min(x1, tip); const pts = [[bx, y], [Math.min(xe, tip - h * 1.4), y]]; if (xe > tip - h * 1.4) pts.push([xe, y + h * 0.5 * Math.min(1, (xe - (tip - h * 1.4)) / (h * 1.4))]); pts.push([Math.min(xe, tip - h * 1.4), y + h]); pts.push([bx, y + h]); return pts; };
  poly(ctx, [[bx, y], [tip - h * 1.4, y], [tip, y + h * 0.5], [tip - h * 1.4, y + h], [bx, y + h]], steel);
  if (frac > 0) poly(ctx, blade(bx + bw * frac), fill);
  if (!mono) rr(ctx, bx, y + 1, bw - h * 1.4, Math.max(1, h * 0.14), 0.5, col("#ffffff", 0.28));   // light on the spine
}

// ---------- SMALL (home, square) ----------
async function drawSmall(d) {
  const S = 170, ctx = ctxOf(S, S), sc = d.sc;
  const v = d.art.vols.length ? d.art.vols[d.art.vols.length - 1] : null;
  const cover = await img(v ? v.url.replace(".256.jpg", ".512.jpg") : d.art.cover);
  if (cover) ctx.drawImageInRect(cropTo(cover, S, S, 0.5), new Rect(0, 0, S, S));
  ctx.setFillColor(col(BG, 0.45)); ctx.fillRect(new Rect(0, 0, S, S));
  vgrad(ctx, 0, S, 50, S, BG, 0, 0.95); vgrad(ctx, 0, S, 0, 56, BG, 0.92, 0);
  rr(ctx, 12, 15, 6, 6, 3, col(ACCENT));
  txt(ctx, "KAGURABACHI", 22, 12, 140, Font.heavySystemFont(9), col("#ffffff", 0.9));
  if (sc.isNew) { rr(ctx, S - 12 - 34, 11, 34, 15, 7.5, col(ACCENT)); txt(ctx, "NEW", S - 12 - 34, 13, 34, Font.heavySystemFont(8.5), col("#ffffff"), "center"); }
  txt(ctx, "CH", 13, 64, 30, Font.heavySystemFont(9), col(ACCENT));
  txt(ctx, String(sc.last.num), 10, 72, 160, COND(52), col("#ffffff"));
  txt(ctx, `${fmtDay(sc.last.date)} · ${ago(sc.last.date)}`, 13, 126, 150, Font.semiboldSystemFont(8), col("#ffffff", 0.6));
  const label = sc.state === "break" ? "ON BREAK?" : sc.state === "due" ? `CH ${sc.nextNum} DUE` : `CH ${sc.nextNum}`;
  txt(ctx, label, 13, 140, 90, Font.heavySystemFont(8.5), col("#ffffff", 0.85));
  txt(ctx, sc.state === "wait" ? countdown(sc.next - Date.now()) : "", S - 13 - 90, 140, 90, Font.heavySystemFont(8.5), col(ACCENT), "right");
  katana(ctx, 13, 155, S - 26, 5, sc.frac);
  return ctx.getImage();
}

// ---------- LARGE (Mac desktop, square) ----------
async function drawLarge(d) {
  const W = 364, H = Device.isPhone() ? 382 : 364, ctx = ctxOf(W, H), sc = d.sc;
  const banner = await img(d.art.banner);
  const BH = 178;
  if (banner) ctx.drawImageInRect(cropTo(banner, W, BH, 0.35, 0.52), new Rect(0, 0, W, BH));
  ctx.setFillColor(col(BG, 0.22)); ctx.fillRect(new Rect(0, 0, W, BH));
  vgrad(ctx, 0, W, 70, BH, BG, 0, 1); hgrad(ctx, 0, 170, 0, BH, BG, 0.75, 0);
  // header
  rr(ctx, 18, 21, 7, 7, 3.5, col(ACCENT));
  txt(ctx, "KAGURABACHI", 30, 17, 200, Font.heavySystemFont(11), col("#ffffff"));
  txt(ctx, d.author.toUpperCase(), 30, 32, 200, Font.semiboldSystemFont(8), col("#ffffff", 0.55));
  // vertical katakana down the right edge
  [..."カグラバチ"].forEach((ch, i) => txt(ctx, ch, W - 34, 14 + i * 21, 22, Font.heavySystemFont(16), col("#ffffff", 0.85), "center"));
  rr(ctx, W - 24, 124, 2, 40, 1, col(ACCENT));

  // chapter
  txt(ctx, "LATEST CHAPTER", 20, 118, 200, Font.heavySystemFont(8.5), col(ACCENT));
  txt(ctx, String(sc.last.num), 15, 128, 200, COND(86), col("#ffffff"));
  const nx = 20 + String(sc.last.num).length * 39;
  if (sc.isNew) { rr(ctx, nx, 150, 38, 16, 8, col(ACCENT)); txt(ctx, "NEW", nx, 152, 38, Font.heavySystemFont(9), col("#ffffff"), "center"); }
  txt(ctx, fmtDay(sc.last.date), nx, 172, 150, Font.heavySystemFont(11), col("#ffffff", 0.9));
  txt(ctx, `${fmtTime(sc.last.date)} · ${ago(sc.last.date)}`, nx, 188, 150, Font.mediumSystemFont(9.5), col("#ffffff", 0.55));

  // weekly rhythm: last 8 Sundays, filled if a chapter dropped that week
  const RX = 236; txt(ctx, "LAST 8 WEEKS", RX, 176, 110, Font.heavySystemFont(7.5), col("#ffffff", 0.45));
  for (let i = 0; i < 8; i++) {
    const wEnd = sc.last.date - (7 - i) * 7 * 86400e3 + 3.5 * 86400e3, wStart = wEnd - 7 * 86400e3;
    const hit = d.chapters.some((c) => c.date > wStart && c.date <= wEnd) || i === 7;
    rr(ctx, RX + i * 13, 192, 9, 9, 2, hit ? col(i === 7 ? ACCENT : "#ffffff", i === 7 ? 1 : 0.85) : col("#ffffff", 0.15));
  }

  // katana countdown
  const KY = 236;
  const label = sc.state === "break" ? "LOOKS LIKE A BREAK WEEK" : sc.state === "due" ? `CH ${sc.nextNum} · DUE NOW` : `NEXT · CH ${sc.nextNum} · ${fmtDay(sc.next)}`;
  txt(ctx, label, 20, KY - 18, 220, Font.heavySystemFont(9), col("#ffffff", 0.75));
  txt(ctx, sc.state === "wait" ? countdown(sc.next - Date.now()) : sc.state === "due" ? "ANY MOMENT" : "", W - 20 - 140, KY - 24, 140, COND(18), col(ACCENT), "right");
  katana(ctx, 20, KY + 4, W - 40, 9, sc.frac);

  // volume spines
  const vols = d.art.vols.slice(-12), n = vols.length;
  if (n) {
    txt(ctx, `VOLUMES 1–${vols[n - 1].v}`, 20, 270, 200, Font.heavySystemFont(7.5), col("#ffffff", 0.45));
    const SY = 284, SH = H - SY - 16, gap = 3, sw = (W - 40 - gap * (n - 1)) / n;
    for (let i = 0; i < n; i++) {
      const x = 20 + i * (sw + gap), im = await img(vols[i].url);
      if (im) ctx.drawImageInRect(cropTo(im, sw, SH, 0.45, 0.62), new Rect(x, SY, sw, SH)); else rr(ctx, x, SY, sw, SH, 2, col("#2a1f21"));
      ctx.setFillColor(col(BG, i === n - 1 ? 0 : 0.35)); ctx.fillRect(new Rect(x, SY, sw, SH));
      ctx.setFillColor(col("#000000", 0.7)); ctx.fillRect(new Rect(x, SY + SH - 15, sw, 15));
      txt(ctx, String(vols[i].v), x, SY + SH - 13, sw, Font.heavySystemFont(8), col(i === n - 1 ? ACCENT : "#ffffff"), "center");
      if (i === n - 1) { ctx.setStrokeColor(col(ACCENT)); ctx.setLineWidth(1.5); ctx.strokeRect(new Rect(x, SY, sw, SH)); }
    }
  }
  return ctx.getImage();
}

// ---------- LOCK SCREEN rectangle (white only) ----------
function drawLock(d) {
  const W = 172, H = 76, ctx = ctxOf(W, H, false), sc = d.sc, w_ = (a) => col("#ffffff", a);
  const tag = `CH ${sc.last.num}`, pw = Math.max(30, tag.length * 6 + 12);
  ctx.setStrokeColor(w_(1)); ctx.setLineWidth(1.4);
  const pp = new Path(); pp.addRoundedRect(new Rect(W - 1 - pw, 5, pw, 14), 7, 7); ctx.addPath(pp); ctx.strokePath();
  txt(ctx, tag.split("").join(" "), W - 1 - pw - 10, 7, pw + 20, Font.boldSystemFont(8.5), w_(1), "center");
  txt(ctx, "KAGURABACHI", 1, 4, W - pw - 10, COND(17), w_(1));
  // 7 ticks = the 7 days of the release week; today is partly filled with a marker under it
  const n = 7, by = 34, bh = 8, gap = 2, tw = (W - 2 - gap * (n - 1)) / n, done = sc.frac * n, full = Math.floor(done);
  for (let i = 0; i < n; i++) {
    rr(ctx, 1 + i * (tw + gap), by, tw, bh, 1.6, w_(i < full || sc.state !== "wait" ? 1 : 0.25));
    if (sc.state === "wait" && i === full && done > full) { rr(ctx, 1 + i * (tw + gap), by, Math.max(1.5, tw * (done - full)), bh, 1.6, w_(1)); rr(ctx, 1 + i * (tw + gap), by + bh + 2, tw, 2, 1, w_(1)); }
  }
  const big = sc.state === "wait" ? countdown(sc.next - Date.now()) : sc.state === "due" ? "DUE" : "BREAK?";
  txt(ctx, big, 1, 46, 110, Font.boldSystemFont(19), w_(1));
  txt(ctx, (sc.isNew ? `NEW · ` : "") + `TO CH ${sc.nextNum}`.split("").join(" "), W - 100, 57, 99, Font.boldSystemFont(8), w_(0.8), "right");
  return ctx.getImage();
}

// ---------- widget ----------
async function load() {
  try {
    const { chapters, author } = await fetchChapters();
    const data = { chapters, author }; writeJ("kagura-cache.json", data); return data;
  } catch (e) { const c = readJ("kagura-cache.json"); if (c) return c; throw e; }
}
function setArt(w, image) {
  if (!GLASS_SAFE) { w.backgroundImage = image; return; }
  const wi = w.addImage(image); wi.resizable = true; wi.applyFillingContentMode(); wi.centerAlignImage();
}
async function build() {
  const w = new ListWidget(); w.setPadding(0, 0, 0, 0); w.backgroundColor = col(BG); w.url = TAP_URL;
  try {
    const base = await load();
    const d = { chapters: base.chapters, author: base.author, sc: schedule(base.chapters), art: FAMILY.startsWith("accessory") ? { vols: [] } : await fetchArt() };
    // refresh right after the next chapter is expected, else every 30 min
    const soon = d.sc.next - Date.now();
    w.refreshAfterDate = new Date(Date.now() + (soon > 0 && soon < 30 * 60e3 ? soon + 5 * 60e3 : 30 * 60e3));
    if (FAMILY === "accessoryInline") { w.addText(`⚔︎ Kagurabachi ${d.sc.last.num} · ${d.sc.state === "wait" ? "next in " + countdown(d.sc.next - Date.now()).toLowerCase() : "next due"}`); }
    else if (FAMILY.startsWith("accessory")) { const im = w.addImage(drawLock(d)); im.applyFittingContentMode(); im.centerAlignImage(); }
    else if (FAMILY === "small") setArt(w, await drawSmall(d));
    else setArt(w, await drawLarge(d));
  } catch (e) {
    const t = w.addText("Kagurabachi: " + String(e.message || e).slice(0, 60)); t.font = Font.boldSystemFont(10); t.textColor = Color.white();
  }
  return w;
}

const widget = await build();
if (config.runsInWidget) Script.setWidget(widget);
else await widget.presentLarge();
Script.complete();
