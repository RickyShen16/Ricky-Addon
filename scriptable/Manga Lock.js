// ============================================
// MANGA LOCK — lock screen widgets (Scriptable)
// Tracks Kagurabachi from WeebCentral (+ your AniList progress
// for the unread count, if your AniList list is public).
// Rectangular = "big chapter number", Circular = minimal.
// Lock screen is single-tint: white at different opacities.
// Run it inside Scriptable to preview.
// ============================================

const SERIES = {
  id: "01J76XYGGM22WZP7T4TKA4ZFAF",          // WeebCentral series id
  name: "Kagurabachi",
  anilistId: null,                            // set if auto-match misses
};
const ANILIST_USERNAME = "MastaDeBlasta";     // list must be PUBLIC for unread to show
const CIRCLE_STYLE = 3;   // 1 ring + number · 2 number + dot · 3 progress ring · 4 "+N"
const PREVIEW = "rect";   // in-app preview: "rect" or "circle"

const UA = { "User-Agent": "MangaRadarWidget/3.0" };

// ---------- data ----------
const clean = (s) => (s || "").replace(/<!\[CDATA\[|\]\]>/g, "")
  .replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').trim();
const chNum = (s) => { const m = (s || "").match(/[\d.]+/); return m ? parseFloat(m[0]) : null; };
const norm = (t) => (t || "").toLowerCase().replace(/[^a-z0-9]+/g, "");

function timeAgo(date) {
  if (!date || isNaN(date)) return "";
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 3600) return Math.max(1, Math.floor(secs / 60)) + "M AGO";
  if (secs < 86400) return Math.floor(secs / 3600) + "H AGO";
  const days = Math.floor(secs / 86400);
  if (days < 30) return days + "D AGO";
  return Math.floor(days / 30) + "MO AGO";
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const dateLabel = (dt) => (dt && !isNaN(dt)) ? MONTHS[dt.getMonth()] + " " + dt.getDate() : "";

function parseLatest(xml) {
  const first = (xml.match(/<item>([\s\S]*?)<\/item>/) || [])[1];
  if (!first) return null;
  const get = (tag) => { const m = first.match(new RegExp("<" + tag + ">([\\s\\S]*?)</" + tag + ">")); return m ? clean(m[1]) : ""; };
  const title = get("title");
  const m = title.match(/((Chapter|Episode|Days|Ch\.?)\s*[\d.]+.*)$/i);
  return { num: chNum(m ? m[1] : title), date: new Date(get("pubDate")) };
}

async function fetchLatest() {
  try {
    const r = new Request("https://weebcentral.com/series/" + SERIES.id + "/rss");
    r.headers = UA; r.timeoutInterval = 15;
    return parseLatest(await r.loadString());
  } catch (e) { return null; }
}

// your AniList progress for this series, or null when private / not on your list
async function fetchProgress() {
  if (!ANILIST_USERNAME) return null;
  try {
    const r = new Request("https://graphql.anilist.co");
    r.method = "POST";
    r.headers = { "Content-Type": "application/json", "Accept": "application/json" };
    r.body = JSON.stringify({
      query: "query($name:String){MediaListCollection(userName:$name,type:MANGA){lists{entries{progress media{id title{romaji english native}}}}}}",
      variables: { name: ANILIST_USERNAME },
    });
    r.timeoutInterval = 12;
    const json = await r.loadJSON();
    const lists = (json && json.data && json.data.MediaListCollection && json.data.MediaListCollection.lists) || [];
    const want = norm(SERIES.name);
    for (const list of lists) for (const e of list.entries || []) {
      if (!e.media) continue;
      if (SERIES.anilistId != null && e.media.id === SERIES.anilistId) return e.progress;
      const t = e.media.title || {};
      const titles = [t.romaji, t.english, t.native].filter(Boolean).map(norm);
      if (titles.some((x) => x === want || x.includes(want))) return e.progress;
    }
  } catch (e) {}
  return null;
}

// ---------- drawing helpers ----------
const white = (a) => new Color("#ffffff", a);
const track = (s) => s.split("").join(" ");
const capW = (s, fs) => s.length * fs * 0.7;   // bold caps run ~0.7em wide on iOS
function rounded(ctx, x, y, w, h, r, color) {
  ctx.setFillColor(color);
  const p = new Path(); p.addRoundedRect(new Rect(x, y, w, h), r, r); ctx.addPath(p); ctx.fillPath();
}
function strokeRing(ctx, cx, cy, r, color, lw) {
  ctx.setStrokeColor(color); ctx.setLineWidth(lw);
  const p = new Path(); p.addEllipse(new Rect(cx - r, cy - r, r * 2, r * 2)); ctx.addPath(p); ctx.strokePath();
}
function arcRing(ctx, cx, cy, r, pct, lw) {
  if (pct <= 0) return;
  const seg = Math.max(2, Math.round(90 * Math.min(1, pct))), p = new Path();
  for (let i = 0; i <= seg; i++) {
    const a = (-90 + 360 * Math.min(1, pct) * (i / seg)) * Math.PI / 180;
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
const numSize = (num, maxW, maxFs) => Math.min(maxFs, Math.floor(maxW / (String(num).length * 0.7)));

// ---------- RECTANGULAR 172 x 76 — big chapter number ----------
//  CH      |  NEW CHAPTER
//  132     |  KAGURABACHI
//  5D AGO  |  (1 UNREAD)
//          |  ▬▬▬▬▬▬▬▬▬▬▬
function drawRect(d) {
  const W = 172, H = 76, ctx = newCtx(W, H);
  const known = d.unread != null;

  // left: chapter number + age
  ctx.setFont(Font.boldSystemFont(7.5)); ctx.setTextColor(white(0.65));
  ctx.drawText(track("CH"), new Point(2, 8));
  const fs = numSize(d.num, 52, 24);
  ctx.setFont(Font.boldSystemFont(fs)); ctx.setTextColor(white(1));
  ctx.drawText(String(d.num), new Point(2, 16));
  ctx.setFont(Font.boldSystemFont(8)); ctx.setTextColor(white(0.8));
  ctx.drawText(track(d.age), new Point(2, 52));

  rounded(ctx, 57.5, 8, 1.4, 60, 0.7, white(0.25));

  // right: kicker, title, pill, bar
  const x = 68, tw = W - x - 1;
  const kick = !known ? "LATEST CHAPTER" : (d.unread > 0 ? "NEW CHAPTER" : "CAUGHT UP");
  ctx.setFont(Font.boldSystemFont(7)); ctx.setTextColor(white(0.6));
  ctx.drawText(track(kick), new Point(x, 5));

  const title = SERIES.name.toUpperCase();
  let tfs = 12; while (tfs > 9 && capW(title, tfs) > tw - 2) tfs -= 1;
  ctx.setFont(Font.boldSystemFont(tfs)); ctx.setTextColor(white(1));
  ctx.drawText(title, new Point(x, 15));

  // AniList private/unmatched: show the release date in the pill instead of unread + bar
  const label = known ? (d.unread > 0 ? d.unread + " UNREAD" : "UP TO DATE") : (d.dateLabel || "");
  if (label) {
    const pw = Math.max(44, capW(label, 7.5) + 14);
    ctx.setStrokeColor(white(0.75)); ctx.setLineWidth(1);
    const pp = new Path(); pp.addRoundedRect(new Rect(x, 35, pw, 14), 7, 7); ctx.addPath(pp); ctx.strokePath();
    ctx.setTextAlignedCenter();
    ctx.setFont(Font.boldSystemFont(7.5)); ctx.setTextColor(white(1));
    ctx.drawTextInRect(track(label), new Rect(x, 37.2, pw, 11));
    ctx.setTextAlignedLeft();
    if (known) {
      rounded(ctx, x, 58, tw, 5, 2.5, white(0.25));
      rounded(ctx, x, 58, Math.max(5, tw * Math.min(1, d.read / d.num)), 5, 2.5, white(1));
    }
  }
  return ctx.getImage();
}

// ---------- CIRCULAR 76 x 76 — minimal ----------
function drawCircle(d) {
  const S = 76, c = S / 2, ctx = newCtx(S, S);
  const known = d.unread != null, pct = known ? Math.min(1, d.read / d.num) : 0;
  ctx.setTextAlignedCenter();
  const text = (str, fs, y, a) => {
    ctx.setFont(Font.boldSystemFont(fs)); ctx.setTextColor(white(a));
    ctx.drawTextInRect(str, new Rect(4, y, S - 8, fs + 6));
  };
  if (CIRCLE_STYLE === 1) {
    strokeRing(ctx, c, c, 32, white(0.3), 1.6);
    const fs = numSize(d.num, 42, 22);
    text(track("CH"), 6.4, c - fs * 0.62 - 9, 0.65); text(String(d.num), fs, c - fs * 0.62, 1);
  } else if (CIRCLE_STYLE === 2) {
    const fs = numSize(d.num, 46, 24);
    text(String(d.num), fs, c - fs * 0.68, 1);
    if (known && d.unread > 0) { ctx.setFillColor(white(1)); const p = new Path(); p.addEllipse(new Rect(c - 3, 55, 6, 6)); ctx.addPath(p); ctx.fillPath(); }
  } else if (CIRCLE_STYLE === 4) {
    if (known && d.unread > 0) text("+" + d.unread, 26, c - 22, 1);
    else text(String(d.num), numSize(d.num, 46, 24), c - 17, 1);
    text(track("CH " + d.num), 7, 52, 0.7);
  } else {                                     // 3: thin progress ring (default)
    strokeRing(ctx, c, c, 32, white(0.25), 2.2);
    arcRing(ctx, c, c, 32, known ? pct : 0, 2.2);
    const fs = numSize(d.num, 42, 22);
    text(track("CH"), 6.4, c - fs * 0.62 - 9, 0.65); text(String(d.num), fs, c - fs * 0.62, 1);
  }
  ctx.setTextAlignedLeft();
  return ctx.getImage();
}

// ---------- main ----------
const [latest, progress] = await Promise.all([fetchLatest(), fetchProgress()]);
const d = latest && latest.num != null ? {
  num: latest.num, age: timeAgo(latest.date), dateLabel: dateLabel(latest.date),
  read: typeof progress === "number" ? progress : null,
  unread: typeof progress === "number" ? Math.max(0, Math.round((latest.num - Math.min(progress, latest.num)) * 10) / 10) : null,
} : null;

if (config.runsInWidget) {
  const fam = config.widgetFamily;
  const w = new ListWidget();
  w.setPadding(0, 0, 0, 0);
  w.url = "tachimanga://";
  w.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000);
  if (!d) { const t = w.addText("No chapter found"); t.font = Font.boldSystemFont(10); }
  else if (fam === "accessoryInline") {
    w.addText("📕 " + SERIES.name + " Ch " + d.num + (d.unread ? " · " + d.unread + " new" : ""));
  } else {
    const im = w.addImage(fam === "accessoryCircular" ? drawCircle(d) : drawRect(d));
    im.centerAlignImage(); im.applyFittingContentMode();
  }
  Script.setWidget(w);
} else if (d) {
  const k = 4, isRect = PREVIEW === "rect", ww = isRect ? 172 : 76, hh = 76, pad = 24;
  const pv = new DrawContext();
  pv.size = new Size((ww + pad * 2) * k, (hh + pad * 2) * k); pv.opaque = true; pv.respectScreenScale = false;
  pv.setFillColor(new Color("#1b1517")); pv.fillRect(new Rect(0, 0, pv.size.width, pv.size.height));
  pv.drawImageInRect(isRect ? drawRect(d) : drawCircle(d), new Rect(pad * k, pad * k, ww * k, hh * k));
  await QuickLook.present(pv.getImage());
} else {
  const a = new Alert(); a.title = "Manga Lock"; a.message = "Couldn't read the WeebCentral feed."; a.addAction("OK"); await a.present();
}
Script.complete();
