// ============================================
// MANGA RADAR — SQUARE / SMALL v5 (iOS) 🔥
// Scriptable SMALL widget • WeebCentral RSS + AniList progress
// Compact roster, no hero spotlight. Real unread-chapter tracking,
// shown as a thumbnail-corner badge instead of inline text.
//
// SETUP: paste into Scriptable, name it "Manga Radar Square",
// add a SMALL Scriptable widget, set Script = Manga Radar Square.
// ============================================

// Your AniList username (public list — no token needed). Leave "" to skip
// AniList entirely; the widget falls back to plain "X AGO" like before.
const ANILIST_USERNAME = "MastaDeBlasta";

// DEBUG: set true, then RUN THE SCRIPT FROM INSIDE THE SCRIPTABLE APP
// (not as a widget). It copies the raw AniList match results to your
// clipboard + shows an alert, so we can see exactly what comes back and
// why a series did/didn't match. Set back to false for normal widget use.
const DEBUG = false;

// Each series: url = WeebCentral series page (for latest-chapter RSS),
// shortName = what to display (avoids ugly mid-word truncation).
//
// AniList matching is AUTOMATIC by title — no IDs to hunt down. It pulls
// your whole public manga list once, then fuzzy-matches each shortName
// against the romaji/english/native titles on that list.
// If a title is unusual (one-shots, spinoffs, alt-translations) and the
// auto-match misses, set anilistId manually (from the AniList URL, e.g.
// anilist.co/manga/30013/Kagurabachi -> 30013) to force it.
const SERIES = [
  {
    url: "https://weebcentral.com/series/01J76XYGGM22WZP7T4TKA4ZFAF/Kagurabachi",
    shortName: "Kagurabachi",
    anilistId: null,
  },
  {
    url: "https://weebcentral.com/series/01J76XYE3130E1W5HKTJ7VD912/Sakamoto-Days",
    shortName: "Sakamoto Days",
    anilistId: null,
  },
  {
    url: "https://weebcentral.com/series/01K4JBKB0VX8TCFSSF1MK2DTZZ/jujutsu-kaisen-modulo",
    shortName: "JJK: Modulo",
    anilistId: null, // spinoff title — if auto-match misses, set this manually
  },
];

// how many rows fit at this size
const MAX_ROWS = 3;

// ============================================
// (no need to edit below)
// ============================================

const UA = { "User-Agent": "MangaRadarWidget/3.0" };

function parseSeriesUrl(entry) {
  const m = entry.url.match(/series\/([A-Z0-9]+)\/?([^/?#]*)/i);
  const slug = m && m[2] ? decodeURIComponent(m[2]).toLowerCase() : "";
  return {
    id: m ? m[1] : "",
    key: slug,
    name: entry.shortName || slug.replace(/-/g, " ").toUpperCase(),
    anilistId: entry.anilistId || null,
  };
}

const ALL_SERIES = SERIES.map(parseSeriesUrl).filter((s) => s.id);

function clean(s) {
  return (s || "")
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"')
    .trim();
}

function chNum(s) {
  const m = (s || "").match(/[\d.]+/);
  return m ? parseFloat(m[0]) : null;
}

function timeAgo(date) {
  if (!date || isNaN(date)) return "—";
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 3600) return Math.max(1, Math.floor(secs / 60)) + "M AGO";
  if (secs < 86400) return Math.floor(secs / 3600) + "H AGO";
  const days = Math.floor(secs / 86400);
  if (days < 30) return days + "D AGO";
  return Math.floor(days / 30) + "MO AGO";
}

const isFresh = (d) => d && !isNaN(d) && Date.now() - d.getTime() < 86400000;

// ---------- AniList: pull your real reading progress (public list, no token) ----------
function normalizeTitle(t) {
  return (t || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

async function fetchAniListEntries(username) {
  if (!username) return [];
  try {
    const req = new Request("https://graphql.anilist.co");
    req.method = "POST";
    req.headers = { "Content-Type": "application/json", "Accept": "application/json" };
    req.body = JSON.stringify({
      query:
        "query($name:String){MediaListCollection(userName:$name,type:MANGA){lists{entries{progress media{id title{romaji english native}}}}}}",
      variables: { name: username },
    });
    req.timeoutInterval = 12;
    const json = await req.loadJSON();
    const out = [];
    const lists = json && json.data && json.data.MediaListCollection ? json.data.MediaListCollection.lists : [];
    for (const list of lists || []) {
      for (const entry of list.entries || []) {
        if (!entry.media) continue;
        const t = entry.media.title || {};
        out.push({
          id: entry.media.id,
          progress: entry.progress,
          titles: [t.romaji, t.english, t.native].filter(Boolean).map(normalizeTitle),
        });
      }
    }
    return out;
  } catch (e) {
    return []; // graceful degrade — widget still works without AniList
  }
}

// match a local series to an AniList entry: explicit id override first,
// then exact normalized-title match, then substring containment either way.
// Verbose: returns {progress, matchedTitle} so DEBUG can show what hit.
function matchAniListVerbose(s, entries) {
  if (s.anilistId != null) {
    const byId = entries.find((e) => e.id === s.anilistId);
    if (byId) return { progress: byId.progress, matchedTitle: "id:" + s.anilistId };
  }
  const norm = normalizeTitle(s.name);
  if (!norm) return { progress: undefined, matchedTitle: null };
  let exact = entries.find((e) => e.titles.includes(norm));
  if (exact) return { progress: exact.progress, matchedTitle: exact.titles[0] + " (exact)" };
  let partial = entries.find((e) => e.titles.some((t) => t.includes(norm) || norm.includes(t)));
  if (partial) return { progress: partial.progress, matchedTitle: partial.titles[0] + " (partial)" };
  return { progress: undefined, matchedTitle: null };
}

async function fetchSeries(s) {
  let chapters = [];
  try {
    const req = new Request("https://weebcentral.com/series/" + s.id + "/rss");
    req.headers = UA;
    req.timeoutInterval = 15;
    const xml = await req.loadString();
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
    chapters = items.slice(0, 2).map((it) => {
      const get = (tag) => {
        const m = it.match(new RegExp("<" + tag + ">([\\s\\S]*?)</" + tag + ">"));
        return m ? clean(m[1]) : "";
      };
      const title = get("title");
      const chM = title.match(/((Chapter|Episode|Days|Ch\.?)\s*[\d.]+.*)$/i);
      return { chapter: chM ? chM[1] : title, date: new Date(get("pubDate")) };
    });
  } catch (e) {}

  let coverImg = null;
  try {
    const imgReq = new Request("https://temp.compsci88.com/cover/fallback/" + s.id + ".jpg");
    imgReq.headers = UA;
    coverImg = await imgReq.loadImage();
  } catch (e) {}

  return { ...s, chapters, coverImg };
}

// fetch with small gaps (be gentle), AniList in parallel since it's a separate host
const sleep = (ms) => new Promise((r) => Timer.schedule(ms, false, r));
const anilistPromise = fetchAniListEntries(ANILIST_USERNAME);

const all = [];
for (const s of ALL_SERIES) {
  if (all.length > 0) await sleep(250);
  all.push(await fetchSeries(s));
}
const anilistEntries = await anilistPromise;

// attach unread state per series:
//   unread = AniList progress matched + chapter number parses -> real diff
//   null   = no AniList match for this series -> render falls back to "X AGO"
const debugRows = [];
for (const s of all) {
  const latestNum = s.chapters[0] ? chNum(s.chapters[0].chapter) : null;
  const match = matchAniListVerbose(s, anilistEntries);
  const progress = match.progress;
  if (latestNum != null && typeof progress === "number") {
    s.unread = Math.max(0, Math.round((latestNum - Math.min(progress, latestNum)) * 10) / 10);
  } else {
    s.unread = null;
  }
  debugRows.push(
    s.name + "\n  latest=" + latestNum + " progress=" + (progress == null ? "—" : progress) +
    " unread=" + (s.unread == null ? "NO MATCH" : s.unread) +
    "\n  matchedTitle=" + (match.matchedTitle || "—")
  );
}

if (DEBUG) {
  const report =
    "ANILIST USER: " + ANILIST_USERNAME +
    "\nentries pulled: " + anilistEntries.length +
    "\n\n" + debugRows.join("\n\n") +
    "\n\n--- all AniList titles ---\n" +
    anilistEntries.map((e) => "[" + e.progress + "] " + e.titles.join(" | ")).join("\n");
  Pasteboard.copy(report);
  const a = new Alert();
  a.title = "Manga Radar — AniList debug";
  a.message = "Pulled " + anilistEntries.length + " entries. Full report copied to clipboard — paste it back to Claude.";
  a.addAction("OK");
  await a.present();
}

// rank purely by recency — no series gets hero treatment
all.sort((a, b) => {
  const da = a.chapters[0] ? a.chapters[0].date.getTime() : 0;
  const db = b.chapters[0] ? b.chapters[0].date.getTime() : 0;
  return db - da;
});
const roster = all.slice(0, MAX_ROWS);
// ============================================================
// RENDER — SQUARE v5 (158x158). Subtle vertical-gradient card +
// 1px top highlight for depth (still flat, no blur). Thumbnails
// stay colour. Status moves to a thumbnail-corner badge — filled
// circle with the unread count, or a quiet ring+check when caught
// up — instead of inline text, so titles never get squeezed.
// Verified against PIL layout sim before shipping.
// ============================================================
const PT_W = 158, PT_H = 158;
const COL = {
  white: "#f4f5f9", grey: "#9698a0", faint: "#5c5e68",
  cardTop: "#16171d", cardBot: "#0c0d10", bg0: "#08080a", thumb: "#2c3040", badgeText: "#0a0a0c",
};

function fit(str, n) { if (!str) return ""; return str.length > n ? str.slice(0, n - 1) + "…" : str; }
function coverCrop(image, w, h, bias) {
  bias = bias == null ? 0.5 : bias;
  const iw = image.size.width, ih = image.size.height, sc = Math.max(w / iw, h / ih);
  const dw = iw * sc, dh = ih * sc;
  const c = new DrawContext(); c.size = new Size(w, h); c.respectScreenScale = true; c.opaque = false;
  c.drawImageInRect(image, new Rect((w - dw) / 2, (h - dh) * bias, dw, dh));
  return c.getImage();
}
function rounded(ctx, x, y, w, h, r, color) {
  ctx.setFillColor(color);
  const p = new Path(); p.addRoundedRect(new Rect(x, y, w, h), r, r); ctx.addPath(p); ctx.fillPath();
}
function strokeRoundRect(ctx, x, y, w, h, r, color, lw) {
  ctx.setStrokeColor(color); ctx.setLineWidth(lw);
  const p = new Path(); p.addRoundedRect(new Rect(x, y, w, h), r, r); ctx.addPath(p); ctx.strokePath();
}
function fillCircle(ctx, cx, cy, r, color) {
  ctx.setFillColor(color);
  const p = new Path(); p.addEllipse(new Rect(cx - r, cy - r, r * 2, r * 2)); ctx.addPath(p); ctx.fillPath();
}
function ringCircle(ctx, cx, cy, r, color, lw) {
  ctx.setStrokeColor(color); ctx.setLineWidth(lw);
  const p = new Path(); p.addEllipse(new Rect(cx - r, cy - r, r * 2, r * 2)); ctx.addPath(p); ctx.strokePath();
}
function strokeLine(ctx, x1, y1, x2, y2, color, lw) {
  ctx.setStrokeColor(color); ctx.setLineWidth(lw);
  const p = new Path(); p.move(new Point(x1, y1)); p.addLine(new Point(x2, y2)); ctx.addPath(p); ctx.strokePath();
}
function chNumOf(s) {
  const c = s.chapters && s.chapters[0] ? s.chapters[0].chapter : null;
  if (!c) return null;
  const m = String(c).match(/[\d.]+/); return m ? m[0] : null;
}

function renderCard() {
  const ctx = new DrawContext();
  ctx.size = new Size(PT_W, PT_H); ctx.respectScreenScale = true; ctx.opaque = false;

  // full-bleed gradient — iOS clips backgroundImage to the system corner
  // radius automatically, so no manual rounding/inset needed here.
  const steps = 40;
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const lerp = (a, b) => Math.round(a + (b - a) * t);
    const top = [0x16, 0x17, 0x1d], bot = [0x0a, 0x0a, 0x0d];
    const rgb = [lerp(top[0], bot[0]), lerp(top[1], bot[1]), lerp(top[2], bot[2])];
    const hex = "#" + rgb.map((v) => v.toString(16).padStart(2, "0")).join("");
    const bandH = PT_H / steps;
    ctx.setFillColor(new Color(hex));
    ctx.fillRect(new Rect(0, i * bandH, PT_W, bandH + 1));
  }

  // 1px top highlight — a touch of bevel, still flat (no blur)
  strokeLine(ctx, 18, 1, PT_W - 18, 1, new Color("#ffffff", 0.14), 1);

  const apad = 11;

  // brand mark — Futura-Bold, matching the large widget
  rounded(ctx, apad, apad, 3, 11, 1, new Color(COL.white));
  ctx.setFont(new Font("Futura-Bold", 8)); ctx.setTextColor(new Color(COL.white));
  ctx.drawText("MANGA RADAR", new Point(apad + 9, apad - 1));

  const rowTop = apad + 22, rowH = 38, thumbW = 30, thumbH = 36;
  const textX = apad + thumbW + 8, textW = PT_W - apad - textX;

  for (let i = 0; i < roster.length; i++) {
    const s = roster[i];
    const ry = rowTop + i * rowH;

    if (s.coverImg) {
      ctx.drawImageInRect(coverCrop(s.coverImg, thumbW, thumbH, 0.4), new Rect(apad, ry, thumbW, thumbH));
      strokeRoundRect(ctx, apad, ry, thumbW, thumbH, 5, new Color("#ffffff", 0.15), 1);
    } else {
      rounded(ctx, apad, ry, thumbW, thumbH, 5, new Color(COL.thumb));
    }

    const ty = ry + 2;
    ctx.setFont(Font.boldSystemFont(11)); ctx.setTextColor(new Color(COL.white));
    ctx.drawText(fit(s.name, 15), new Point(textX, ty));

    const ty2 = ty + 17;
    const cn = chNumOf(s);
    const chTxt = cn ? "Ch " + cn : "—";
    ctx.setFont(Font.boldSystemFont(9)); ctx.setTextColor(new Color(COL.grey));
    ctx.drawText(chTxt, new Point(textX, ty2));

    // unmatched (no AniList data) -> old inline fallback, since there's nothing to badge
    if (s.unread == null) {
      const ago = s.chapters[0] ? timeAgo(s.chapters[0].date).toUpperCase() : "";
      if (ago) {
        const chW = chTxt.length * 6.5;
        ctx.setFont(Font.mediumSystemFont(9)); ctx.setTextColor(new Color(COL.faint));
        ctx.drawText("·  " + ago, new Point(textX + chW + 5, ty2 + 1));
      }
    }

    // status badge on the thumbnail's top-right corner — app-icon-notification style
    const bcx = apad + thumbW, bcy = ry;
    if (s.unread != null && s.unread > 0) {
      fillCircle(ctx, bcx, bcy, 9, new Color(COL.white));
      const num = String(s.unread);
      ctx.setFont(Font.boldSystemFont(10)); ctx.setTextColor(new Color(COL.badgeText));
      ctx.setTextAlignedCenter();
      ctx.drawTextInRect(num, new Rect(bcx - 9, bcy - 7, 18, 14));
      ctx.setTextAlignedLeft();
    } else if (s.unread === 0) {
      ringCircle(ctx, bcx, bcy, 7, new Color(COL.faint), 1);
      strokeLine(ctx, bcx - 3, bcy, bcx - 1, bcy + 2.5, new Color(COL.faint), 1);
      strokeLine(ctx, bcx - 1, bcy + 2.5, bcx + 3.5, bcy - 3, new Color(COL.faint), 1);
    }
  }

  return ctx.getImage();
}
// ---------- output ----------
const TAP = "tachimanga://";
const w = new ListWidget();
w.setPadding(0, 0, 0, 0);
w.url = TAP;
if (!roster.length) {
  w.backgroundColor = new Color(COL.bg0);
  const e = w.addText("📕 No chapters found");
  e.font = Font.semiboldSystemFont(12); e.textColor = new Color(COL.grey);
} else {
  w.backgroundImage = renderCard();
}
w.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000);
if (config.runsInWidget) Script.setWidget(w);
else await w.presentSmall();
Script.complete();
