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
// Small home widget look: "eyes" (Chihiro's eyes + katana, from the official art) | "ink" (type-led, red ink)
// | "rotate" (a different volume cover each refresh) | "cover" (latest volume cover)
// | "kingyo" (drawn goldfish circling the number) | "wave" (seigaiha wave pattern + katana slash)
// | "koi" (orange/white/blue goldfish streaming through night water) | "asanoha" (hemp-leaf pattern + eclipse)
// | "kingyo2" (vol. 11 cover style: fat vermilion/white kingyo, water droplets, red logo, katana hilt)
const SMALL_STYLE = "koi";

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
// Place image so the point (fx, fy) (fractions of the image) lands at (px, py), scaled to `h` tall.
function zoomTo(ctx, im, h, fx, fy, px, py, W, H) {
  const s = h / im.size.height, iw = im.size.width * s, ih = h;
  const c = new DrawContext(); c.size = new Size(W, H); c.opaque = false; c.respectScreenScale = true;
  c.drawImageInRect(im, new Rect(px - iw * fx, py - ih * fy, iw, ih));
  ctx.drawImageInRect(c.getImage(), new Rect(0, 0, W, H));
}
function smallFooter(ctx, sc, S) {
  const label = sc.state === "break" ? "ON BREAK?" : sc.state === "due" ? `CH ${sc.nextNum} DUE` : `NEXT · CH ${sc.nextNum}`;
  txt(ctx, label, 13, 138, 100, Font.heavySystemFont(8), col("#ffffff", 0.8));
  txt(ctx, sc.state === "wait" ? countdown(sc.next - Date.now()) : "", S - 13 - 80, 136, 80, COND(11), col(ACCENT), "right");
  katana(ctx, 13, 155, S - 26, 5, sc.frac);
}
function smallKicker(ctx, sc, S) {
  rr(ctx, 12, 15, 6, 6, 3, col(ACCENT));
  txt(ctx, "KAGURABACHI", 22, 12, 120, Font.heavySystemFont(9), col("#ffffff", 0.92));
  if (sc.isNew) { rr(ctx, S - 12 - 34, 11, 34, 15, 7.5, col(ACCENT)); txt(ctx, "NEW", S - 12 - 34, 13, 34, Font.heavySystemFont(8.5), col("#ffffff"), "center"); }
}

// EYES: Chihiro's eyes + blade, cropped tight from the official banner, red-graded
async function drawSmallEyes(d) {
  const S = 170, ctx = ctxOf(S, S), sc = d.sc, b = await img(d.art.banner);
  if (b) zoomTo(ctx, b, 300, 0.565, 0.5, 92, 66, S, S);
  ctx.setFillColor(col("#3a0503", 0.28)); ctx.fillRect(new Rect(0, 0, S, S));
  vgrad(ctx, 0, S, 0, 34, BG, 0.85, 0); vgrad(ctx, 0, S, 78, S, BG, 0, 0.97);
  smallKicker(ctx, sc, S);
  txt(ctx, "CH", 14, 92, 30, Font.heavySystemFont(8.5), col(ACCENT));
  txt(ctx, String(sc.last.num), 11, 98, 120, COND(36), col("#ffffff"));
  txt(ctx, sc.isNew ? "OUT NOW" : ago(sc.last.date), S - 13 - 80, 112, 80, Font.heavySystemFont(8), col("#ffffff", 0.6), "right");
  smallFooter(ctx, sc, S);
  return ctx.getImage();
}

// INK: type-led. Huge chapter number over a red ink smear from the banner, vertical katakana.
async function drawSmallInk(d) {
  const S = 170, ctx = ctxOf(S, S), sc = d.sc, b = await img(d.art.banner);
  if (b) { zoomTo(ctx, b, 420, 0.16, 0.5, 40, 80, S, S); ctx.setFillColor(col(BG, 0.55)); ctx.fillRect(new Rect(0, 0, S, S)); }
  vgrad(ctx, 0, S, 110, S, BG, 0, 0.95);
  smallKicker(ctx, sc, S);
  [..."カグラバチ"].forEach((ch, i) => txt(ctx, ch, S - 26, 34 + i * 17, 18, Font.heavySystemFont(12.5), col("#ffffff", 0.8), "center"));
  txt(ctx, String(sc.last.num), 8, 26, 140, COND(78), col("#ffffff"));
  txt(ctx, `CH · ${fmtDay(sc.last.date)}`, 13, 116, 120, Font.heavySystemFont(8), col(ACCENT));
  smallFooter(ctx, sc, S);
  return ctx.getImage();
}

// ROTATE: a different volume cover every refresh (cycles through the hour), cropped to the character
async function drawSmallRotate(d) {
  const S = 170, ctx = ctxOf(S, S), sc = d.sc, vols = d.art.vols;
  const v = vols.length ? vols[Math.floor(Date.now() / 3600e3) % vols.length] : null;
  const cover = await img(v ? v.url.replace(".256.jpg", ".512.jpg") : d.art.cover);
  if (cover) zoomTo(ctx, cover, 300, 0.5, 0.55, 85, 70, S, S);
  vgrad(ctx, 0, S, 0, 36, BG, 0.88, 0); vgrad(ctx, 0, S, 66, 110, BG, 0, 0.85); ctx.setFillColor(col(BG, 0.94)); ctx.fillRect(new Rect(0, 110, S, S - 110));
  smallKicker(ctx, sc, S);
  if (v && !sc.isNew) { rr(ctx, S - 12 - 40, 11, 40, 15, 7.5, col("#000000", 0.55)); txt(ctx, `VOL ${v.v}`, S - 12 - 40, 13, 40, Font.heavySystemFont(8), col("#ffffff"), "center"); }
  txt(ctx, "CH", 14, 92, 30, Font.heavySystemFont(8.5), col(ACCENT));
  txt(ctx, String(sc.last.num), 11, 98, 120, COND(36), col("#ffffff"));
  txt(ctx, ago(sc.last.date), S - 13 - 80, 112, 80, Font.heavySystemFont(8), col("#ffffff", 0.6), "right");
  smallFooter(ctx, sc, S);
  return ctx.getImage();
}

// ---- drawn (no artwork) ----
function circle(ctx, cx, cy, r, color, fill = true, lw = 1) { const p = new Path(); p.addEllipse(new Rect(cx - r, cy - r, r * 2, r * 2)); ctx.addPath(p); if (fill) { ctx.setFillColor(color); ctx.fillPath(); } else { ctx.setStrokeColor(color); ctx.setLineWidth(lw); ctx.strokePath(); } }
// A goldfish facing `ang` (radians), drawn from rotated points.
function goldfish(ctx, cx, cy, ang, sc, body, fin) {
  const R = (x, y) => new Point(cx + (x * Math.cos(ang) - y * Math.sin(ang)) * sc, cy + (x * Math.sin(ang) + y * Math.cos(ang)) * sc);
  const shape = (pts, color) => { const p = new Path(); p.move(R(...pts[0])); for (let i = 1; i < pts.length; i += 3) p.addCurve(R(...pts[i + 2]), R(...pts[i]), R(...pts[i + 1])); p.closeSubpath(); ctx.addPath(p); ctx.setFillColor(color); ctx.fillPath(); };
  // flowing double tail
  shape([[-6, 0], [-14, -3], [-22, -14], [-27, -11], [-22, -5], [-21, 0], [-15, -1]], fin);
  shape([[-6, 0], [-14, 3], [-22, 14], [-27, 11], [-22, 5], [-21, 0], [-15, 1]], fin);
  // fins
  shape([[1, -4], [-2, -11], [-6, -12], [-5, -9], [-4, -6], [-3, -5], [-1, -4]], fin);
  shape([[1, 4], [-1, 8], [-4, 10], [-4, 7], [-3, 6], [-2, 5], [0, 4]], fin);
  // body
  shape([[10, 0], [9, -7], [-2, -7], [-9, -1], [-11, -0.5], [-11, 0.5], [-9, 1], [-2, 7], [9, 7], [10, 0]], body);
  const e = R(5, -1.6); circle(ctx, e.x, e.y, 1.1 * sc, col("#120607"));
  const h = R(2, -3.5); circle(ctx, h.x, h.y, 1.4 * sc, col("#ffffff", 0.35));
}
async function drawSmallKingyo(d) {
  const S = 170, ctx = ctxOf(S, S), sc = d.sc, cx = 85, cy = 72;
  // dark water + ripples
  for (let r = 96; r > 0; r -= 4) circle(ctx, cx, cy, r, col("#1a0709", 0.06));
  for (const r of [30, 44, 58, 74]) circle(ctx, cx, cy, r, col(ACCENT, 0.13), false, 0.8);
  // five goldfish swimming clockwise around the number
  const fish = [[0, 1.05], [1.25, 0.9], [2.5, 1.1], [3.75, 0.85], [5.0, 1.0]];
  fish.forEach(([a, k], i) => {
    const rad = 52 + (i % 2) * 8, x = cx + rad * Math.cos(a), y = cy + rad * Math.sin(a) * 0.82;
    goldfish(ctx, x, y, a + Math.PI / 2 + 0.25, 0.95 * k, col(i % 2 ? "#ff6a3d" : ACCENT), col(i % 2 ? "#ff8a5c" : "#ff5a4a", 0.6));
  });
  smallKicker(ctx, sc, S);
  txt(ctx, String(sc.last.num), 0, cy - 24, S, COND(40), col("#ffffff"), "center");
  txt(ctx, "CHAPTER", 0, cy + 22, S, Font.heavySystemFont(7.5), col(ACCENT), "center");
  vgrad(ctx, 0, S, 120, S, BG, 0, 0.9);
  smallFooter(ctx, sc, S);
  return ctx.getImage();
}
async function drawSmallWave(d) {
  const S = 170, ctx = ctxOf(S, S), sc = d.sc;
  // seigaiha: rows of overlapping fan-circles, each with concentric rings
  const r = 15;
  for (let row = 0, y = -r; y < S + r; row++, y += r / 2) {
    for (let x = (row % 2) * r - r; x < S + r * 2; x += r * 2) {
      circle(ctx, x, y, r, col(BG));
      for (let k = 0; k < 4; k++) circle(ctx, x, y, r - k * 3.6, col(ACCENT, 0.42 - k * 0.07), false, 1.1);
    }
  }
  // fade the pattern into black toward the bottom-left, keep it rich top-right
  for (let y = 0; y < S; y++) { ctx.setFillColor(col(BG, 0.25 + 0.7 * (y / S))); ctx.fillRect(new Rect(0, y, S, 1)); }
  // katana slash: white blade with a red edge, top-right to lower-left
  const sl = (o, w, c) => poly(ctx, [[S + 10, 30 + o], [S + 10, 30 + o + w], [-10, 84 + o + w * 0.4], [-10, 84 + o]], c);
  sl(-3, 9, col(ACCENT, 0.35)); sl(0, 3.2, col("#ffffff", 0.95)); sl(3.2, 1.6, col(ACCENT));
  smallKicker(ctx, sc, S);
  txt(ctx, "CH", 14, 92, 30, Font.heavySystemFont(8.5), col(ACCENT));
  txt(ctx, String(sc.last.num), 11, 98, 120, COND(36), col("#ffffff"));
  txt(ctx, sc.isNew ? "OUT NOW" : ago(sc.last.date), S - 13 - 80, 112, 80, Font.heavySystemFont(8), col("#ffffff", 0.6), "right");
  smallFooter(ctx, sc, S);
  return ctx.getImage();
}

// deterministic "random" so the picture doesn't jump around between refreshes
const rnd = (i) => { const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };

// A calico goldfish: white body with orange patches, sheer blue-white tail. `pal` picks the colouring.
function calico(ctx, cx, cy, ang, sc, pal) {
  const R = (x, y) => new Point(cx + (x * Math.cos(ang) - y * Math.sin(ang)) * sc, cy + (x * Math.sin(ang) + y * Math.cos(ang)) * sc);
  const shape = (pts, color) => { const p = new Path(); p.move(R(...pts[0])); for (let i = 1; i < pts.length; i += 3) p.addCurve(R(...pts[i + 2]), R(...pts[i]), R(...pts[i + 1])); p.closeSubpath(); ctx.addPath(p); ctx.setFillColor(color); ctx.fillPath(); };
  const dot = (x, y, r, c) => { const q = R(x, y); circle(ctx, q.x, q.y, r * sc, c); };
  const P = {
    calico: { body: "#f6f1ea", patch: "#ff7a2f", tail: "#d9ecff", tailA: 0.55, ray: "#8fc3ff" },
    orange: { body: "#ff7a2f", patch: "#ffb26b", tail: "#ffc08a", tailA: 0.6, ray: "#ffffff" },
    blue:   { body: "#9fd2ff", patch: "#ffffff", tail: "#b9e0ff", tailA: 0.45, ray: "#ffffff" },
  }[pal];
  // long veil tail (two lobes) + rays
  shape([[-7, 0], [-16, -2], [-26, -16], [-33, -13], [-27, -6], [-26, 0], [-17, -1]], col(P.tail, P.tailA));
  shape([[-7, 0], [-16, 2], [-26, 16], [-33, 13], [-27, 6], [-26, 0], [-17, 1]], col(P.tail, P.tailA));
  for (const yy of [-9, -4, 4, 9]) { const a = R(-9, yy * 0.2), b = R(-29, yy); const l = new Path(); l.move(a); l.addLine(b); ctx.addPath(l); ctx.setStrokeColor(col(P.ray, 0.35)); ctx.setLineWidth(0.5 * sc); ctx.strokePath(); }
  // fins
  shape([[1, -5], [-2, -12], [-7, -13], [-6, -9], [-5, -7], [-3, -6], [-1, -5]], col(P.tail, P.tailA + 0.15));
  shape([[1, 5], [-1, 9], [-5, 11], [-5, 8], [-4, 7], [-2, 6], [0, 5]], col(P.tail, P.tailA + 0.15));
  // body + patches
  shape([[10, 0], [9, -7], [-2, -7.5], [-9, -1], [-11, -0.5], [-11, 0.5], [-9, 1], [-2, 7.5], [9, 7], [10, 0]], col(P.body));
  dot(4, -2.5, 3.2, col(P.patch)); dot(-3, 1.5, 3.6, col(P.patch)); dot(-7, -2, 1.8, col(P.patch, 0.9));
  dot(6, -1.6, 1.1, col("#0b0f1a")); dot(3.5, -4, 1.2, col("#ffffff", 0.6));
}
async function drawSmallKoi(d) {
  const S = 170, ctx = ctxOf(S, S), sc = d.sc;
  // night water: indigo, lighter toward the top-right where the light falls
  for (let r = 240; r > 0; r -= 6) circle(ctx, 150, 10, r, col("#16305e", 0.05));
  ctx.setFillColor(col("#050a18", 0.35)); ctx.fillRect(new Rect(0, 0, S, S));
  // caustics: soft light patches
  for (let i = 0; i < 26; i++) { const x = rnd(i) * S, y = rnd(i + 50) * 120, r = 3 + rnd(i + 99) * 9; circle(ctx, x, y, r, col("#9fd2ff", 0.035 + rnd(i + 7) * 0.03)); }
  // ripples where the fish break the surface
  for (const [x, y, r] of [[118, 30, 10], [118, 30, 17], [118, 30, 25]]) circle(ctx, x, y, r, col("#bfe3ff", 0.12), false, 0.7);
  // a stream of goldfish curving up from the bottom-right, each facing along the curve
  const B = (t) => { const p0 = [150, 168], p1 = [172, 104], p2 = [128, 52], p3 = [92, -6]; const u = 1 - t;
    return [u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]; };
  const fish = [[0.34, 1.05, "calico", -14], [0.48, 0.8, "blue", 4], [0.6, 0.95, "orange", -18], [0.74, 0.8, "calico", 6], [0.88, 0.72, "blue", -10]];
  for (const [t, k, pal, off] of fish) {
    const [x, y] = B(t), [x2, y2] = B(Math.min(1, t + 0.02)), a = Math.atan2(y2 - y, x2 - x);
    calico(ctx, x + off * Math.cos(a + Math.PI / 2), y + off * Math.sin(a + Math.PI / 2), a, k, pal);
  }
  // bubbles
  for (let i = 0; i < 9; i++) circle(ctx, 60 + rnd(i + 3) * 100, 20 + rnd(i + 11) * 90, 1 + rnd(i + 5) * 1.8, col("#d9ecff", 0.35), false, 0.6);
  vgrad(ctx, 0, S, 112, S, "#050a18", 0, 0.92);
  txt(ctx, "カグラバチ", 12, 10, 130, Font.heavySystemFont(14.5), col("#ec4524"));   // the red logo, like the covers
  if (sc.isNew) { rr(ctx, S - 12 - 34, 11, 34, 15, 7.5, col("#ff7a2f")); txt(ctx, "NEW", S - 12 - 34, 13, 34, Font.heavySystemFont(8.5), col("#ffffff"), "center"); }
  txt(ctx, "CHAPTER", 14, 40, 80, Font.heavySystemFont(7.5), col("#9fd2ff"));
  txt(ctx, String(sc.last.num), 10, 46, 120, COND(46), col("#ffffff"));
  txt(ctx, sc.isNew ? "OUT NOW" : ago(sc.last.date), 14, 100, 90, Font.heavySystemFont(8), col("#ffffff", 0.55));
  smallFooter(ctx, sc, S);
  return ctx.getImage();
}

// ASANOHA: hemp-leaf pattern in thin gold on deep crimson, a black eclipse with a red rim behind the number
async function drawSmallAsanoha(d) {
  const S = 170, ctx = ctxOf(S, S), sc = d.sc;
  for (let y = 0; y < S; y++) { const t = y / S; ctx.setFillColor(col("#5c0c0a", 1 - t * 0.65)); ctx.fillRect(new Rect(0, y, S, 1)); }
  // triangle grid; every triangle gets its edges + spokes from its centre to the corners (the hemp-leaf star)
  const a = 24, h = a * Math.sqrt(3) / 2, segs = [];
  for (let j = -1; j * h < S + h; j++) for (let i = -2; i * a < S + a * 2; i++) {
    const x0 = i * a + (j % 2 ? a / 2 : 0), y0 = j * h;
    for (const up of [true, false]) {
      const t = up ? [[x0, y0 + h], [x0 + a, y0 + h], [x0 + a / 2, y0]] : [[x0 + a / 2, y0], [x0 + a * 1.5, y0], [x0 + a, y0 + h]];
      const c = [(t[0][0] + t[1][0] + t[2][0]) / 3, (t[0][1] + t[1][1] + t[2][1]) / 3];
      for (let k = 0; k < 3; k++) { segs.push([t[k], t[(k + 1) % 3]]); segs.push([c, t[k]]); }
    }
  }
  const path = new Path(); for (const [p, q] of segs) { path.move(new Point(p[0], p[1])); path.addLine(new Point(q[0], q[1])); }
  ctx.addPath(path); ctx.setStrokeColor(col("#e8c27a", 0.32)); ctx.setLineWidth(0.7); ctx.strokePath();
  // fade the pattern out toward the bottom
  vgrad(ctx, 0, S, 70, S, BG, 0, 0.95);
  // eclipse: black disc with a thin red ring + glow, behind the number
  const ex = 112, ey = 66;
  for (let r = 58; r > 46; r -= 2) circle(ctx, ex, ey, r, col(ACCENT, 0.05));
  circle(ctx, ex, ey, 45, col("#0a0304")); circle(ctx, ex, ey, 45, col(ACCENT), false, 2);
  circle(ctx, ex - 6, ey + 4, 43, col("#ffffff", 0.06), false, 0.8);
  // a thin vertical katana line through the eclipse
  rr(ctx, ex + 30, 6, 1.6, 112, 0.8, col("#ffffff", 0.85)); rr(ctx, ex + 31.6, 6, 0.8, 112, 0.4, col(ACCENT));
  rr(ctx, ex + 26, 22, 10, 3, 1, col("#e8c27a"));
  smallKicker(ctx, sc, S);
  txt(ctx, "CH", ex - 40, ey - 31, 80, Font.heavySystemFont(8), col(ACCENT), "center");
  txt(ctx, String(sc.last.num), ex - 60, ey - 24, 120, COND(40), col("#ffffff"), "center");
  txt(ctx, sc.isNew ? "OUT NOW" : ago(sc.last.date), ex - 50, ey + 22, 100, Font.heavySystemFont(7.5), col("#ffffff", 0.55), "center");
  smallFooter(ctx, sc, S);
  return ctx.getImage();
}

// ---- KINGYO II: built from the volume 11 cover's language ----
const VERM = "#ec4524", PAPER = "#f3eee6", INK = "#0c0a0b", GOLD = "#c9a65a";
// a glossy water droplet: dark core, white rim, highlight, tiny glint
function droplet(ctx, x, y, r) {
  circle(ctx, x, y, r, col("#000000", 0.35));
  circle(ctx, x, y, r, col("#ffffff", 0.85), false, Math.max(0.6, r * 0.12));
  const h = new Path(); h.addEllipse(new Rect(x - r * 0.62, y - r * 0.6, r * 0.55, r * 0.38)); ctx.addPath(h); ctx.setFillColor(col("#ffffff", 0.9)); ctx.fillPath();
  circle(ctx, x + r * 0.35, y + r * 0.4, Math.max(0.5, r * 0.1), col("#ffffff", 0.8));
}
// fat fancy goldfish (oranda/ranchu), facing `ang`; vermilion + white + black spots, big glossy eye
function fancyKingyo(ctx, cx, cy, ang, sc, seed) {
  const R = (x, y) => new Point(cx + (x * Math.cos(ang) - y * Math.sin(ang)) * sc, cy + (x * Math.sin(ang) + y * Math.cos(ang)) * sc);
  const shape = (pts, color) => { const p = new Path(); p.move(R(...pts[0])); for (let i = 1; i < pts.length; i += 3) p.addCurve(R(...pts[i + 2]), R(...pts[i]), R(...pts[i + 1])); p.closeSubpath(); ctx.addPath(p); ctx.setFillColor(color); ctx.fillPath(); };
  const dot = (x, y, r, c) => { const q = R(x, y); circle(ctx, q.x, q.y, r * sc, c); };
  // big flowing tail, sheer, with ink-wash ribs
  shape([[-9, 0], [-16, -6], [-30, -20], [-36, -12], [-31, -6], [-33, 0], [-20, -1]], col(PAPER, 0.55));
  shape([[-9, 0], [-16, 6], [-30, 20], [-36, 12], [-31, 6], [-33, 0], [-20, 1]], col(PAPER, 0.55));
  shape([[-10, 0], [-17, -4], [-26, -12], [-28, -6], [-25, -2], [-26, 2], [-17, 1]], col(VERM, 0.55));
  for (const yy of [-14, -8, -3, 3, 8, 14]) { const l = new Path(); l.move(R(-11, yy * 0.15)); l.addLine(R(-31, yy)); ctx.addPath(l); ctx.setStrokeColor(col(INK, 0.35)); ctx.setLineWidth(0.5 * sc); ctx.strokePath(); }
  // fins
  shape([[2, -9], [-2, -16], [-9, -17], [-8, -12], [-6, -10], [-3, -9], [0, -9]], col(VERM, 0.8));
  shape([[2, 9], [0, 14], [-5, 16], [-5, 12], [-3, 11], [-1, 10], [1, 9]], col(PAPER, 0.75));
  // round body (paper white)
  shape([[14, 0], [14, -9], [5, -12], [-3, -11.5], [-10, -11], [-14, -5], [-13, 0], [-12, 5], [-9, 11], [-3, 11.5], [5, 12], [14, 9], [14, 0]], col(PAPER));
  // vermilion mottling + ink spots (kept inside the body)
  const pr = [[2, -5, 5.5], [-6, 2, 6], [7, 5, 3.5], [-8, -6, 3.2], [9, -6, 3], [0, 7, 3]];
  pr.forEach(([x, y, r], i) => { if (rnd(seed + i) > 0.15) dot(x, y, r, col(VERM, 0.95)); });
  [[-3, -2, 1.4], [4, 2, 1.1], [-9, 4, 1.2], [1, -9, 0.9], [-5, 8, 1]].forEach(([x, y, r], i) => { if (rnd(seed + 20 + i) > 0.3) dot(x, y, r, col(INK, 0.9)); });
  // head cap (wen) + big glossy eye
  dot(10, -2, 4.6, col(VERM));
  dot(9, -4.2, 3.4, col(INK)); dot(8, -5.4, 1.3, col("#ffffff", 0.95)); dot(10.2, -3.2, 0.6, col("#ffffff", 0.7));
}
// the katana hilt (tsuka) running down the left edge, like the cover: dark wrap, gold diamonds, round gold guard
function hiltDown(ctx, x, y0, y1, w) {
  rr(ctx, x, y0, w, y1 - y0, w * 0.3, col("#3a2c2a")); rr(ctx, x + 1.5, y0, w - 3, y1 - y0, w * 0.25, col("#241b1a"));
  for (let y = y0 + 4; y < y1 - w * 0.6; y += w * 1.05) poly(ctx, [[x + w / 2, y], [x + w * 0.88, y + w * 0.5], [x + w / 2, y + w], [x + w * 0.12, y + w * 0.5]], col(GOLD, 0.9));
  rr(ctx, x - 1, y1 - 4, w + 2, 5, 1.5, col(GOLD));                                      // collar
  const t = new Path(); t.addEllipse(new Rect(x + w / 2 - 17, y1, 34, 9)); ctx.addPath(t); ctx.setFillColor(col(GOLD)); ctx.fillPath();
  const t2 = new Path(); t2.addEllipse(new Rect(x + w / 2 - 12, y1 + 2, 24, 5)); ctx.addPath(t2); ctx.setFillColor(col("#8a6d34")); ctx.fillPath();
}
async function drawSmallKingyo2(d) {
  const S = 170, ctx = ctxOf(S, S), sc = d.sc;
  ctx.setFillColor(col(INK)); ctx.fillRect(new Rect(0, 0, S, S));
  // grey ink wash
  for (let i = 0; i < 14; i++) { const x = rnd(i + 300) * S, y = rnd(i + 330) * S, r = 18 + rnd(i + 360) * 40; circle(ctx, x, y, r, col("#ffffff", 0.018 + rnd(i + 390) * 0.02)); }
  // the kingyo: a big one sweeping in from the bottom-right, a smaller one up top
  fancyKingyo(ctx, 140, 100, Math.PI * 1.1, 1.85, 1);
  fancyKingyo(ctx, 156, 36, Math.PI * 0.9, 0.95, 9);
  // water droplets + white splatter
  [[118, 20, 5], [160, 70, 4], [100, 118, 4.5], [76, 112, 2.8], [128, 62, 3], [52, 128, 2.4], [150, 128, 3.2]].forEach(([x, y, r]) => droplet(ctx, x, y, r));
  for (let i = 0; i < 30; i++) circle(ctx, 40 + rnd(i + 500) * 130, rnd(i + 540) * 150, 0.4 + rnd(i + 580) * 1.3, col("#ffffff", 0.55 + rnd(i) * 0.4));
  // katana hilt down the left, red logo across the top
  hiltDown(ctx, 9, -6, 96, 13);
  txt(ctx, "カグラバチ", 30, 6, 140, Font.heavySystemFont(21), col(VERM));
  // chapter: serif numeral like the cover, Japanese "chapter N" underneath
  txt(ctx, String(sc.last.num), 32, 38, 110, new Font("Georgia-Bold", 44), col("#ffffff"));
  txt(ctx, `“第${sc.last.num}話”  ·  ${sc.isNew ? "NEW" : ago(sc.last.date)}`, 34, 90, 120, Font.heavySystemFont(7.5), col("#ffffff", 0.85));
  vgrad(ctx, 0, S, 118, 136, INK, 0, 0.85); ctx.setFillColor(col(INK, 0.88)); ctx.fillRect(new Rect(0, 136, S, S - 136));
  smallFooter(ctx, sc, S);
  return ctx.getImage();
}

async function drawSmall(d) {
  if (SMALL_STYLE === "kingyo2") return drawSmallKingyo2(d);
  if (SMALL_STYLE === "koi") return drawSmallKoi(d);
  if (SMALL_STYLE === "asanoha") return drawSmallAsanoha(d);
  if (SMALL_STYLE === "kingyo") return drawSmallKingyo(d);
  if (SMALL_STYLE === "wave") return drawSmallWave(d);
  if (SMALL_STYLE === "eyes" && d.art.banner) return drawSmallEyes(d);
  if (SMALL_STYLE === "ink") return drawSmallInk(d);
  if (SMALL_STYLE === "rotate" && d.art.vols.length) return drawSmallRotate(d);
  return drawSmallCover(d);
}

async function drawSmallCover(d) {
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
