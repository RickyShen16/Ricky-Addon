#!/usr/bin/osascript -l JavaScript
// <xbar.title>Simkl Radar</xbar.title>
// <xbar.desc>Now watching + recently watched from Simkl, in the menu bar.</xbar.desc>
// <swiftbar.hideRunInTerminal>true</swiftbar.hideRunInTerminal>
// <swiftbar.hideDisablePlugin>true</swiftbar.hideDisablePlugin>
// SwiftBar plugin. Refreshes every 10 minutes (the ".10m" in the filename).
// Needs ~/.simkl-radar/simkl.js (installed by mac/install.sh).

const SHOW_TITLE = true;          // false = icon only in the menu bar
const WATCH_APP = "nuvio";        // "nuvio" | "simkl"
const THUMBS = true;              // poster thumbnails in the dropdown

function sh(cmd) { const a = Application.currentApplication(); a.includeStandardAdditions = true; return a.doShellScript(cmd); }
const q = (s) => "'" + String(s).replace(/'/g, "'\\''") + "'";
const clean = (s) => String(s).replace(/\|/g, "/");          // "|" is SwiftBar's separator
const pct = (s) => (s.finished ? 1 : s.total && s.watched != null ? Math.min(1, s.watched / s.total) : 0);
const left = (s) => (s.kind === "movie" || s.finished || s.total == null || s.watched == null ? null : Math.max(0, s.total - s.watched));
const bar = (p, n) => "▰".repeat(Math.round(p * n)) + "▱".repeat(n - Math.round(p * n));
const cut = (t, n) => (t.length > n ? t.slice(0, n - 1) + "…" : t);
const simklUrl = (s) => s.ids && s.ids.simkl
  ? "https://simkl.com/" + (s.kind === "movie" ? "movies" : s.kind === "anime" ? "anime" : "tv") + "/" + s.ids.simkl
  : "https://simkl.com/search/?q=" + encodeURIComponent(s.title);
const watchUrl = (s) => WATCH_APP === "nuvio" ? "nuvio://search?query=" + encodeURIComponent(s.title) : simklUrl(s);
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
// small poster as base64 PNG, cached in ~/.simkl-radar/thumbs
function thumb(home, poster) {
  if (!THUMBS || !poster) return "";
  try {
    const dir = home + "/.simkl-radar/thumbs", f = dir + "/" + poster.replace(/\//g, "_") + ".png";
    return "image=" + sh("mkdir -p " + q(dir) + "; [ -s " + q(f) + " ] || { curl -sS -m 15 -o " + q(f + ".jpg") + " " +
      q("https://simkl.in/posters/" + poster + "_m.jpg") + " && sips -s format png -z 54 36 " + q(f + ".jpg") + " --out " + q(f) +
      " >/dev/null && rm -f " + q(f + ".jpg") + "; }; base64 -i " + q(f) + " | tr -d '\\n'");
  } catch (e) { return ""; }
}

function run() {
  ObjC.import("Foundation");
  const home = $.NSHomeDirectory().js, core = home + "/.simkl-radar/simkl.js";
  const L = [];
  let d;
  try { d = JSON.parse(sh("osascript -l JavaScript " + q(core) + " data")); } catch (e) { d = { error: "fetch_failed" }; }

  if (d.error === "not_linked" || d.error) {
    L.push("Simkl | sfimage=play.tv");
    L.push("---");
    L.push(d.error === "not_linked" ? "Link your Simkl account" : "Couldn't reach Simkl");
    if (d.error === "not_linked") L.push("Link now… | bash=/usr/bin/osascript param1=-l param2=JavaScript param3=" + core + " param4=login terminal=true refresh=true");
    L.push("Refresh | refresh=true");
    return L.join("\n");
  }

  const [h, ...rest] = d.items;
  const tag = h.finished ? "✓" : h.next || Math.round(pct(h) * 100) + "%";
  L.push((SHOW_TITLE ? clean(cut(h.title, 20)) + "  " + tag : "") + " | sfimage=" + (h.finished ? "checkmark.circle" : "play.tv"));
  L.push("---");
  L.push((h.finished ? "JUST WATCHED" : "NOW WATCHING") + " | size=10 color=#8e8e93");
  L.push(clean(h.title) + " | size=15 " + thumb(home, h.poster) + " href=" + watchUrl(h));
  L.push(bar(pct(h), 16) + "  " + Math.round(pct(h) * 100) + "% | font=Menlo size=11");
  L.push(clean(sub(h)) + "  ·  " + ago(h.last) + " | size=12 color=#8e8e93");
  L.push((h.finished ? "Watch again" : "Resume") + (WATCH_APP === "nuvio" ? " in Nuvio" : "") + " | sfimage=play.fill href=" + watchUrl(h));
  L.push("Open in Simkl | sfimage=arrow.up.right.square href=" + simklUrl(h));
  L.push("---");
  L.push("RECENTLY WATCHED | size=10 color=#8e8e93");
  for (const s of rest.slice(0, 6)) {
    L.push(clean(cut(s.title, 28)) + "   " + clean(sub(s)) + " | " + thumb(home, s.poster) + " href=" + watchUrl(s));
    L.push("--Open in Simkl | href=" + simklUrl(s));
  }
  L.push("---");
  L.push((d.stale ? "Offline · " : "") + "Updated " + new Date(d.updated).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) + " | size=11 color=#8e8e93");
  L.push("Refresh | refresh=true sfimage=arrow.clockwise");
  L.push("Simkl.com | href=https://simkl.com sfimage=globe");
  return L.join("\n");
}
