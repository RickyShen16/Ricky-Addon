// ============================================
// SIMKL RADAR — CONTINUE WATCHING (iOS) v15 📺
// Scriptable LARGE widget • Simkl API
// Hero = poster LEFT + metadata RIGHT (NOW WATCHING, NEXT,
// LEFT, progress). Rich list rows below. Verified to fit,
// no clipping. Tap → Nuvio search. Blue tracks.
//
// SETUP:
//  1. Paste into Scriptable, name it "Simkl Radar"
//  2. RUN IN APP (▶️). It copies a code + opens Simkl. On the
//     Simkl page: paste the code, tap CONNECT.
//  3. RUN THE SCRIPT AGAIN, tap "Check now" → it links. Done.
//  4. Add a LARGE Scriptable widget, set Script = Simkl Radar
// ============================================

const CLIENT_ID =
  "70a1d2b1c1b5c2ed32bd9bbd498b5cc8e00d2a0d0ddf0f29849472492b0889ce";

const TAP_URL = "simkl://"; // tap widget → open Simkl app

// ============================================
// (no need to edit below)
// ============================================

const API = "https://api.simkl.com";
const fm = FileManager.local();
const tokenPath = fm.joinPath(fm.documentsDirectory(), "simkl-token.txt");

function headers(token) {
  return {
    "Content-Type": "application/json",
    "Authorization": "Bearer " + token,
    "simkl-api-key": CLIENT_ID,
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Pragma": "no-cache",
  };
}

// ---------- PIN auth (runs in-app only) ----------

async function getPin() {
  const r = new Request(
    API + "/oauth/pin?client_id=" + CLIENT_ID +
    "&redirect=urn:ietf:wg:oauth:2.0:oob"
  );
  r.headers = { "simkl-api-key": CLIENT_ID };
  return await r.loadJSON();
}

async function pollPin(userCode) {
  const r = new Request(
    API + "/oauth/pin/" + userCode + "?client_id=" + CLIENT_ID
  );
  r.headers = { "simkl-api-key": CLIENT_ID };
  return await r.loadJSON();
}

async function doPinLogin() {
  // check if we're mid-flow (a pending pin was saved)
  const pendingPath = fm.joinPath(fm.documentsDirectory(), "simkl-pin.txt");

  if (fm.fileExists(pendingPath)) {
    // we already showed a code last run — try to claim the token now
    const userCode = fm.readString(pendingPath).trim();
    const checking = new Alert();
    checking.title = "Checking…";
    checking.message = "Looking for your approval of code " + userCode + ".";
    checking.addAction("Check now");
    checking.addAction("Start over with a new code");
    checking.addCancelAction("Cancel");
    const ch = await checking.presentAlert();
    if (ch === 1) { fm.remove(pendingPath); return await freshPin(pendingPath); }
    if (ch !== 0) return null;

    for (let i = 0; i < 8; i++) {
      const res = await pollPin(userCode);
      if (res && res.access_token) {
        fm.writeString(tokenPath, res.access_token);
        fm.remove(pendingPath);
        const ok = new Alert();
        ok.title = "Connected! ✅";
        ok.message = "Simkl is linked. Add the widget — it'll fill in shortly.";
        ok.addAction("Great");
        await ok.presentAlert();
        return res.access_token;
      }
      await new Promise((r) => Timer.schedule(1200, false, r));
    }
    const fail = new Alert();
    fail.title = "Not approved yet";
    fail.message =
      "I didn't see it go through. Make sure you tapped CONNECT on the Simkl page with code " +
      userCode + ", then run the script again and tap Check now.";
    fail.addAction("OK");
    await fail.presentAlert();
    return null;
  }

  // no pending pin → get a fresh one
  return await freshPin(pendingPath);
}

async function freshPin(pendingPath) {
  const pin = await getPin();
  const code = pin.user_code;
  fm.writeString(pendingPath, code);

  // show the code with a COPY option, then close so the page is usable
  const a = new Alert();
  a.title = "Your Simkl code:  " + code;
  a.message =
    "STEP 1 — Copy the code (tap Copy).\n" +
    "STEP 2 — Tap 'Open Simkl', paste/type the code, tap CONNECT.\n" +
    "STEP 3 — Run this script ONE more time and tap 'Check now'.";
  a.addAction("Copy code & open Simkl");
  a.addCancelAction("Cancel");
  const c = await a.presentAlert();
  if (c !== 0) { fm.remove(pendingPath); return null; }

  Pasteboard.copy(code);
  Safari.openInApp(pin.verification_url || "https://simkl.com/pin", false);
  // we do NOT block here — user finishes on the page, reruns script
  return null;
}

function loadToken() {
  if (fm.fileExists(tokenPath)) {
    const t = fm.readString(tokenPath).trim();
    if (t) return t;
  }
  return null;
}

// ---------- data ----------

async function getJSON(url, token) {
  // cache-buster: unique URL each call so iOS never serves a stale cached response
  const bust = (url.indexOf("?") >= 0 ? "&" : "?") + "_=" + Date.now();
  const r = new Request(url + bust);
  r.headers = headers(token);
  r.timeoutInterval = 20;
  return await r.loadJSON();
}

async function loadImage(url) {
  try {
    const r = new Request(url);
    r.timeoutInterval = 15;
    return await r.loadImage();
  } catch (e) { return null; }
}

// Simkl image base
const imgUrl = (path) =>
  path ? "https://wsrv.nl/?url=https://simkl.in/posters/" + path + "_m.webp&output=jpg" : null;
// fallback direct
const imgUrlDirect = (path) =>
  path ? "https://simkl.in/posters/" + path + "_m.jpg" : null;
// LANDSCAPE backdrop options (16:9). fanart is true landscape; poster _w is a
// landscape-cropped 600x338 version — so we always get a wide image for the hero.
const fanartUrl = (path) =>
  path ? "https://wsrv.nl/?url=https://simkl.in/fanart/" + path + "_w.webp&output=jpg&w=700" : null;
const posterWideUrl = (path) =>
  path ? "https://wsrv.nl/?url=https://simkl.in/posters/" + path + "_w.webp&output=jpg&w=700" : null;

// ---------- main ----------

let token = loadToken();

// If running in app and not linked → start PIN login
if (!config.runsInWidget && !token) {
  token = await doPinLogin();
}

// If running in app and already linked → offer relink option
if (!config.runsInWidget && token) {
  const a = new Alert();
  a.title = "Simkl Radar";
  a.message = "Already connected. What do you want to do?";
  a.addAction("Preview widget");
  a.addAction("Re-link account");
  a.addCancelAction("Cancel");
  const c = await a.presentSheet();
  if (c === 1) { fm.remove(tokenPath); token = await doPinLogin(); }
}

// Build widget
const C = {
  bg: "#08080e", white: "#f2f2f6", amber: "#ffd166", ember: "#ff8c5a",
  emberDeep: "#e63946", dim: "#9aa3b8", faint: "#5a5f70", green: "#4ade80",
  blue: "#5aa9ff",
};

if (!token) {
  // not linked — show a prompt card
  const w = new ListWidget();
  w.backgroundColor = new Color(C.bg);
  w.setPadding(20, 20, 20, 20);
  const t = w.addText("📺 SIMKL RADAR");
  t.font = new Font("Futura-Bold", 16); t.textColor = new Color(C.white);
  w.addSpacer(8);
  const m = w.addText("Tap to open Scriptable and run this script once to connect your Simkl account.");
  m.font = Font.mediumSystemFont(12); m.textColor = new Color(C.dim);
  w.url = "scriptable:///run/" + encodeURIComponent(Script.name());
  if (config.runsInWidget) Script.setWidget(w); else await w.presentLarge();
  Script.complete();
} else {
  // fetch continue-watching: all-items with status=watching
  let shows = [];
  try {
    // RECENTLY WATCHED feed = finished movies + watched episodes (shows/anime), newest first
    const showsW  = await getJSON(API + "/sync/all-items/shows/watching?extended=full",  token).catch(() => ({}));
    const showsD  = await getJSON(API + "/sync/all-items/shows/completed?extended=full",  token).catch(() => ({}));
    const animeW  = await getJSON(API + "/sync/all-items/anime/watching?extended=full",  token).catch(() => ({}));
    const animeD  = await getJSON(API + "/sync/all-items/anime/completed?extended=full",  token).catch(() => ({}));
    const moviesD = await getJSON(API + "/sync/all-items/movies/completed?extended=full", token).catch(() => ({}));
    const playbackMovies = await getJSON(API + "/sync/playback/movies?extended=full", token).catch(() => ([]));

    // in-progress shows/anime (recently watched episode, still has episodes left)
    const merge = (obj, kind) => {
      const arr = (obj && obj.shows) || (obj && obj.anime) || [];
      return arr.map((it) => {
        const show = it.show || it.anime || {};
        const total = show.total_episodes_count || it.total_episodes_count || null;
        const watched = it.watched_episodes_count != null ? it.watched_episodes_count : null;
        return {
          kind, finished: false,
          title: show.title || "Untitled",
          poster: show.poster || null,
          year: show.year, fanart: show.fanart || null,
          total, watched,
          nextEp: it.next_to_watch || it.next_episode || null,
          lastWatched: it.last_watched_at ? new Date(it.last_watched_at) : null,
          ids: show.ids || {},
        };
      });
    };
    // finished shows/anime
    const mergeDone = (obj, kind) => {
      const arr = (obj && obj.shows) || (obj && obj.anime) || [];
      return arr.map((it) => {
        const show = it.show || it.anime || {};
        const total = show.total_episodes_count || it.total_episodes_count || null;
        return {
          kind, finished: true,
          title: show.title || "Untitled",
          poster: show.poster || null,
          year: show.year, fanart: show.fanart || null,
          total, watched: total,
          nextEp: null,
          lastWatched: it.last_watched_at ? new Date(it.last_watched_at) : null,
          ids: show.ids || {},
        };
      });
    };
    // finished movies (the key addition — Bhoothakaalam etc.)
    const mergeMoviesDone = (obj) => {
      const arr = (obj && obj.movies) || [];
      return arr.map((it) => {
        const m = it.movie || {};
        return {
          kind: "movie", finished: true,
          title: m.title || "Untitled",
          poster: m.poster || null,
          year: m.year, runtime: m.runtime || null,
          total: 100, watched: 100,
          nextEp: null,
          lastWatched: it.last_watched_at ? new Date(it.last_watched_at) : null,
          ids: m.ids || {},
        };
      });
    };
    // live in-progress movie (if currently scrobbling) — newest of all
    const mergePlayback = (resp) => {
      const arr = Array.isArray(resp) ? resp : ((resp && resp.movies) || []);
      return arr.map((it) => {
        const m = it.movie || {};
        const prog = it.progress != null ? it.progress
          : (it.progress_percent != null ? it.progress_percent : 0);
        const rt = m.runtime || it.runtime || null;
        const minsLeft = (rt != null) ? Math.max(0, Math.round(rt * (1 - prog / 100))) : null;
        return {
          kind: "movie", finished: false, inProgress: true,
          title: m.title || "Untitled",
          poster: m.poster || null,
          year: m.year, runtime: rt,
          total: 100, watched: Math.round(prog), minsLeft,
          nextEp: null,
          lastWatched: it.paused_at ? new Date(it.paused_at)
            : (it.last_watched_at ? new Date(it.last_watched_at) : new Date()),
          ids: m.ids || {},
        };
      });
    };

    shows = [
      ...mergePlayback(playbackMovies),
      ...mergeMoviesDone(moviesD),
      ...merge(showsW, "tv"),
      ...mergeDone(showsD, "tv"),
      ...merge(animeW, "anime"),
      ...mergeDone(animeD, "anime"),
    ];
    // keep only actually-watched items, newest first, de-duped by title
    shows = shows.filter((s) => s.lastWatched);
    shows.sort((a, b) => b.lastWatched.getTime() - a.lastWatched.getTime());
    const seen = {};
    shows = shows.filter((s) => {
      const k = (s.kind + ":" + (s.title || "")).toLowerCase();
      if (seen[k]) return false; seen[k] = true; return true;
    });
  } catch (e) {
    shows = [];
  }

  // ============================================================
  // RENDER — entire widget as ONE full-bleed image (no clipping
  // possible). Coordinates in points; respectScreenScale renders
  // crisp at device scale. Aspect matches large widget (364x382).
  // ============================================================
  const PT_W = 364, PT_H = 382;

  function epLabel(s) {
    if (s.kind === "movie") return null;
    if (s.nextEp && s.nextEp.episode != null) {
      if (s.nextEp.season != null) return "S" + s.nextEp.season + " · E" + s.nextEp.episode;
      return "EP " + s.nextEp.episode;
    }
    if (s.watched != null) return "EP " + (s.watched + 1);
    return null;
  }
  function remaining(s) {
    if (s.kind === "movie") return null;
    if (s.total != null && s.watched != null) return Math.max(0, s.total - s.watched);
    return null;
  }
  function typeLabel(s) {
    return s.kind === "movie" ? "MOVIE" : s.kind === "anime" ? "ANIME" : "TV SERIES";
  }
  function fit(str, n) { if (!str) return ""; return str.length > n ? str.slice(0, n - 1) + "…" : str; }
  function nuvioUrl(title) { return "nuvio://search?query=" + encodeURIComponent(title); }
  const RUN_URL = "scriptable:///run/" + encodeURIComponent(Script.name());

  // colors
  const col = {
    bgTop: "#0d0e14", bgBot: "#07080c", card: new Color("#ffffff", 0.07),
    white: "#f5f6fa", dim: "#969cac", faint: "#5c6274",
    blue: "#4a86ff", track: "#282c3a", amber: "#ffc95c", ember: "#ff8a4c",
  };

  function rounded(ctx, x, y, w, h, r, color) {
    ctx.setFillColor(color);
    const p = new Path(); p.addRoundedRect(new Rect(x, y, w, h), r, r);
    ctx.addPath(p); ctx.fillPath();
  }

  // Crop+scale an image to exactly fill w×h (cover). The temp canvas
  // clips any overflow, so the result NEVER bleeds outside w×h.
  function coverCrop(image, w, h) {
    const iw = image.size.width, ih = image.size.height;
    const sc = Math.max(w / iw, h / ih);
    const dw = iw * sc, dh = ih * sc;
    const c = new DrawContext();
    c.size = new Size(w, h);
    c.respectScreenScale = true;
    c.opaque = false;
    c.drawImageInRect(image, new Rect((w - dw) / 2, (h - dh) / 2, dw, dh));
    return c.getImage();
  }

  // ---- medium drawing helpers ----
  function trk(s) { return (s || "").split("").join("\u2009"); }
  function advTrk(raw, fs) { return raw.length * fs * 0.75; }
  function playTri(ctx, x, y, w, h, col) {
    ctx.setFillColor(col);
    const p = new Path();
    p.move(new Point(x, y)); p.addLine(new Point(x, y + h)); p.addLine(new Point(x + w, y + h / 2));
    p.closeSubpath(); ctx.addPath(p); ctx.fillPath();
  }
  function checkGlyph(ctx, cx, cy, s, col) {
    const p = new Path();
    p.move(new Point(cx - s, cy));
    p.addLine(new Point(cx - s * 0.25, cy + s * 0.72));
    p.addLine(new Point(cx + s, cy - s * 0.72));
    ctx.addPath(p);
    ctx.setStrokeColor(col); ctx.setLineWidth(Math.max(3, s * 0.42)); ctx.strokePath();
  }
  function strokeCircle(ctx, cx, cy, r, col, lw) {
    ctx.setStrokeColor(col); ctx.setLineWidth(lw);
    const p = new Path(); p.addEllipse(new Rect(cx - r, cy - r, r * 2, r * 2)); ctx.addPath(p); ctx.strokePath();
  }
  function circImage(ctx, img, cx, cy, R, bg, bias) {
    bias = bias == null ? 0.20 : bias;
    const sz = R * 2;
    const iw = img.size.width, ih = img.size.height, sc = Math.max(sz / iw, sz / ih);
    const dw = iw * sc, dh = ih * sc;
    const tc = new DrawContext(); tc.size = new Size(sz, sz); tc.respectScreenScale = true; tc.opaque = false;
    tc.drawImageInRect(img, new Rect((sz - dw) / 2, (sz - dh) * bias, dw, dh));
    ctx.drawImageInRect(tc.getImage(), new Rect(cx - R, cy - R, sz, sz));
    const Lm = R * 0.46, Rm = R + Lm / 2;
    strokeCircle(ctx, cx, cy, Rm, bg, Lm);
  }
  function ringArc(ctx, cx, cy, r, pct, track, fill) {
    strokeCircle(ctx, cx, cy, r, track, 3);
    if (pct > 0) {
      const seg = Math.max(2, Math.round(72 * pct));
      const ap = new Path();
      for (let i = 0; i <= seg; i++) {
        const ang = (-90 + 360 * pct * (i / seg)) * Math.PI / 180;
        const px = cx + r * Math.cos(ang), py = cy + r * Math.sin(ang);
        if (i === 0) ap.move(new Point(px, py)); else ap.addLine(new Point(px, py));
      }
      ctx.setStrokeColor(fill); ctx.setLineWidth(3.5); ctx.addPath(ap); ctx.strokePath();
    }
  }
  function lineSeg(ctx, x1, y1, x2, y2, col, lw) {
    ctx.setStrokeColor(col); ctx.setLineWidth(lw);
    const p = new Path(); p.move(new Point(x1, y1)); p.addLine(new Point(x2, y2)); ctx.addPath(p); ctx.strokePath();
  }
  // crisp vertical divider: a filled rounded capsule (stroked 1px lines fray at
  // the ends on hi-DPI, which read as faint stray marks near the card corners)
  function vCapsule(ctx, x, y1, y2, col, w) {
    w = w || 1.5;
    rounded(ctx, x - w / 2, y1, w, y2 - y1, w / 2, col);
  }
  // measure text width by drawing into a throwaway context and trusting SF metrics.
  // Scriptable can't read pixel widths back, so we approximate with per-glyph
  // factors tuned for the SF bold face actually used on-device.
  function textWidth(str, fs) {
    if (!str) return 0;
    // SF Bold average advance ≈ 0.56·fs; widen for caps-heavy / tracked strings.
    let w = 0;
    for (const ch of str) {
      if (ch === " ") w += fs * 0.28;
      else if (/[ilIjtf.,!:;'|]/.test(ch)) w += fs * 0.30;
      else if (/[mwMW]/.test(ch)) w += fs * 0.85;
      else if (/[A-Z0-9]/.test(ch)) w += fs * 0.62;
      else w += fs * 0.54;
    }
    return w;
  }
  // pick font size + 1 or 2 lines so a long hero title never clips.
  // 1) largest font that fits on ONE line wins.
  // 2) else wrap to TWO lines at the best word break, largest font first.
  // 3) else smallest font, greedy fill, ellipsize the overflow.
  function layoutTitle(title, maxW) {
    title = (title || "").trim();
    const ladder = [23, 21, 19, 17, 15];
    for (const fs of ladder) {
      if (textWidth(title, fs) <= maxW) return { fs, lines: [title] };
    }
    const words = title.split(/\s+/);
    if (words.length >= 2) {
      for (const fs of ladder) {
        for (let i = words.length - 1; i >= 1; i--) {
          const l1 = words.slice(0, i).join(" "), l2 = words.slice(i).join(" ");
          if (textWidth(l1, fs) <= maxW && textWidth(l2, fs) <= maxW) return { fs, lines: [l1, l2] };
        }
      }
    }
    const fs = ladder[ladder.length - 1];
    if (words.length >= 2) {
      let l1 = "";
      for (const w of words) {
        const t = (l1 + " " + w).trim();
        if (textWidth(t, fs) <= maxW) l1 = t; else break;
      }
      if (!l1) l1 = words[0];
      let rest = title.slice(l1.length).trim();
      while (rest && textWidth(rest + "…", fs) > maxW) rest = rest.slice(0, -1);
      return { fs, lines: [l1, rest ? rest + "…" : ""] };
    }
    let t = title;
    while (t && textWidth(t + "…", fs) > maxW) t = t.slice(0, -1);
    return { fs, lines: [t + "…"] };
  }
  function clampChars(txt, fs, maxW, tracked) {
    const f = tracked ? 0.78 : 0.60;
    const maxc = Math.max(3, Math.floor(maxW / (fs * f)));
    if ((txt || "").length <= maxc) return txt || "";
    return (txt || "").slice(0, Math.max(1, maxc - 1)) + "…";
  }

  function renderCardMedium(hero, rows) {
    const C = { white: "#f2f2f6", grey: "#9698a0", faint: "#6e7079", line: "#2a2c34", card: "#0f1014", pill: "#262730", btn: "#282931", sub: "#c2c4cc" };
    const MW = 364, MH = 170;
    const ctx = new DrawContext();
    ctx.size = new Size(MW, MH); ctx.respectScreenScale = true; ctx.opaque = true;
    ctx.setFillColor(new Color("#000000")); ctx.fillRect(new Rect(0, 0, MW, MH));
    rounded(ctx, 6, 6, MW - 12, MH - 12, 22, new Color(C.card));
    ctx.setTextAlignedLeft();

    const isMovie = hero.kind === "movie";
    const isFin = !!hero.finished;
    const hasPct = !!(hero.total && hero.watched != null);
    let hpct = hasPct ? Math.min(1, hero.watched / hero.total) : 0;
    if (isFin) hpct = 1;

    // ===== LEFT: ring + poster =====
    const cx = 62, cy = 85, R = 40, ringR = 46;
    if (hero.img) circImage(ctx, hero.img, cx, cy, R, new Color(C.card), 0.18);
    else { ctx.setFillColor(new Color("#2c3040")); ctx.fillEllipse(new Rect(cx - R, cy - R, R * 2, R * 2)); }
    ringArc(ctx, cx, cy, ringR, hpct, new Color("#ffffff", 0.28), new Color(C.white));
    if (isFin) {
      checkGlyph(ctx, cx, cy + 2, 13, new Color(C.white));
    } else if (hasPct) {
      const num = String(Math.round(hpct * 100));
      const nw = num.length * 21 * 0.55, ox = cx - (nw + 11 * 0.62) / 2;
      ctx.setFont(Font.boldSystemFont(21)); ctx.setTextColor(new Color(C.white));
      ctx.drawText(num, new Point(ox, cy - 14));
      ctx.setFont(Font.boldSystemFont(11));
      ctx.drawText("%", new Point(ox + nw + 1, cy - 6));
    } else {
      playTri(ctx, cx - 7, cy - 9, 15, 18, new Color("#ffffff", 0.9));
    }

    // ===== MIDDLE =====
    const mx = 116, dvx = 220, midW = (dvx - 12) - mx;
    ctx.setFont(Font.boldSystemFont(9)); ctx.setTextColor(new Color(C.grey));
    const kick = isMovie ? (isFin ? "JUST WATCHED" : "NOW WATCHING")
      : (isFin ? "JUST FINISHED" : "NOW WATCHING");
    ctx.drawText(trk(kick), new Point(mx, 40));

    // hero title — auto fit: shrink to ONE line if it can, else wrap to TWO,
    // and let everything below flow down from wherever the title ends.
    const lay = layoutTitle(hero.title || "", midW);
    let yCur = lay.lines.length === 2 ? 51 : 54;
    ctx.setFont(Font.boldSystemFont(lay.fs)); ctx.setTextColor(new Color(C.white));
    for (const ln of lay.lines) {
      ctx.drawText(ln, new Point(mx, yCur));
      yCur += lay.fs + 1;
    }

    // sub block — reflows beneath the (possibly 2-line) title.
    let subY = yCur + 6, by;
    if (isMovie && isFin) {
      ctx.setFont(Font.boldSystemFont(9)); ctx.setTextColor(new Color(C.sub));
      ctx.drawText(trk("MOVIE"), new Point(mx, subY));
      if (hero.year) {
        ctx.setFont(Font.boldSystemFont(9)); ctx.setTextColor(new Color(C.grey));
        ctx.drawText(trk(String(hero.year)), new Point(mx, subY + 12));
        by = subY + 12 + 16;
      } else {
        by = subY + 16;
      }
    } else {
      let sub;
      if (isMovie) sub = (hero.minsLeft != null ? hero.minsLeft + " MIN LEFT" : "MOVIE");
      else if (isFin) sub = "COMPLETED";
      else {
        const ep = (typeof hero.nextEp === "string" && hero.nextEp) ? hero.nextEp : epLabel(hero);
        const rem = remaining(hero);
        sub = (ep || "—") + (rem != null ? "  ·  " + rem + " LEFT" : "");
      }
      ctx.setFont(Font.boldSystemFont(9)); ctx.setTextColor(new Color(C.sub));
      ctx.drawText(trk(clampChars(sub, 9, midW, true)), new Point(mx, subY));
      by = subY + 16;
    }
    // progress bar — clamped so a tall 2-line title can never push it into the footer
    if (by > 138) by = 138;
    rounded(ctx, mx, by, midW, 6, 3, new Color(C.pill));
    if (hpct > 0) rounded(ctx, mx, by, Math.max(6, midW * hpct), 6, 3, new Color(C.white));
    // (play button removed — widget is glanceable, not interactive per-item)

    // ===== divider — crisp filled capsule, inset from the curved corners =====
    vCapsule(ctx, dvx, 46, 140, new Color(C.line), 1.6);

    // ===== RIGHT: UP NEXT =====
    const rx = 228;
    ctx.setFont(Font.boldSystemFont(9)); ctx.setTextColor(new Color(C.grey));
    ctx.drawText(trk("UP NEXT"), new Point(rx, 30));
    const ry0 = 44, rowH = 36, edge = 346;
    for (let i = 0; i < rows.length && i < 3; i++) {
      const s = rows[i], yT = ry0 + i * rowH;
      const tw = 20, th = 28;
      if (s.img) ctx.drawImageInRect(coverCrop(s.img, tw, th), new Rect(rx, yT, tw, th));
      else { ctx.setFillColor(new Color("#2c3040")); ctx.fillRect(new Rect(rx, yT, tw, th)); }
      const txx = rx + tw + 8, twid = edge - txx;
      ctx.setFont(Font.boldSystemFont(10.5)); ctx.setTextColor(new Color(C.white));
      ctx.drawText(clampChars(s.title, 10.5, twid, false), new Point(txx, yT - 1));
      let rl;
      if (s.kind === "movie") rl = "MOVIE";
      else if (s.finished) rl = "DONE";
      else { const rem2 = remaining(s); rl = (rem2 != null ? rem2 : "—") + " EP LEFT"; }
      ctx.setFont(Font.boldSystemFont(7)); ctx.setTextColor(new Color(C.grey));
      ctx.drawText(trk(rl), new Point(txx, yT + 15));
      const bb = yT + 27, p2 = (s.total && s.watched != null) ? Math.min(1, s.watched / s.total) : 0;
      rounded(ctx, txx, bb, twid, 4, 2, new Color(C.pill));
      if (p2 > 0) rounded(ctx, txx, bb, Math.max(4, twid * p2), 4, 2, new Color(C.white));
    }

    // ===== footer =====
    strokeCircle(ctx, 22, 156, 4, new Color(C.faint), 1.2);
    ctx.setFont(Font.boldSystemFont(7)); ctx.setTextColor(new Color(C.faint));
    const now = new Date();
    const hh = now.getHours() % 12 || 12, mm = (now.getMinutes() < 10 ? "0" : "") + now.getMinutes();
    const ap = now.getHours() >= 12 ? "PM" : "AM";
    ctx.drawText(trk("SIMKL  ·  " + hh + ":" + mm + " " + ap), new Point(30, 151));

    return ctx.getImage();
  }
  async function presentScrollList(allShows) {
    for (const s of allShows) {
      if (!s.img) s.img = await loadImage(imgUrl(s.poster)) || await loadImage(imgUrlDirect(s.poster));
    }
    const t = new UITable();
    t.showSeparators = true;
    const head = new UITableRow();
    head.isHeader = true; head.height = 50;
    const ht = head.addText("Recently Watched", allShows.length + " items");
    ht.titleFont = Font.boldSystemFont(20);
    t.addRow(head);
    for (const s of allShows) {
      const row = new UITableRow();
      row.height = 70; row.dismissOnSelect = true;
      if (s.img) { const c = row.addImage(s.img); c.widthWeight = 14; }
      const rem = remaining(s);
      const sub = s.kind === "movie"
        ? ("Movie" + (s.year ? "  ·  " + s.year : ""))
        : ((s.finished ? "Completed" : (epLabel(s) ? "Next " + epLabel(s) : ""))
          + (!s.finished && rem != null ? "  ·  " + rem + " left" : ""));
      const cell = row.addText(s.title, sub);
      cell.titleFont = Font.boldSystemFont(17);
      cell.subtitleFont = Font.systemFont(12);
      cell.subtitleColor = new Color(col.dim);
      cell.widthWeight = 70;
      const prog = (s.total && s.watched != null) ? Math.round(100 * s.watched / s.total) : 0;
      const pc = row.addText(s.kind === "movie" ? "" : prog + "%", "");
      pc.titleFont = Font.boldSystemFont(15);
      pc.titleColor = new Color(col.blue);
      pc.widthWeight = 16; pc.rightAligned();
      row.onSelect = () => { Safari.open(nuvioUrl(s.title)); };
      t.addRow(row);
    }
    await t.present(true);
  }

  // ============================================================
  // MAIN OUTPUT — MEDIUM widget
  // ============================================================
  if (config.runsInApp) {
    await presentScrollList(shows);
    Script.complete();
  } else {
    const hero = shows[0] || null;
    const rows = shows.slice(1, 4);
    const toLoad = [hero, ...rows].filter(Boolean);
    for (const s of toLoad) {
      s.img = await loadImage(imgUrl(s.poster)) || await loadImage(imgUrlDirect(s.poster));
    }
    const w = new ListWidget();
    w.setPadding(0, 0, 0, 0);
    w.url = RUN_URL;
    w.backgroundColor = new Color("#000000");
    if (!hero) {
      const e = w.addText("Nothing watched yet 🍿");
      e.font = Font.semiboldSystemFont(13); e.textColor = new Color(col.dim);
    } else {
      w.backgroundImage = renderCardMedium(hero, rows);
    }
    w.refreshAfterDate = new Date(Date.now() + 10 * 60 * 1000);
    if (config.runsInWidget) Script.setWidget(w); else await w.presentMedium();
    Script.complete();
  }
}
