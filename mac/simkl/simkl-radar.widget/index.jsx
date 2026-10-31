// ============================================
// SIMKL RADAR — Übersicht desktop widget (large)
// Data comes from ~/.simkl-radar/simkl.js (see mac/README.md).
// Click the hero buttons or any card to open it in Nuvio / Simkl.
// ============================================
import { run } from "uebersicht";

// ---- settings ----
const ACCENT = "#ff4b3e";            // live dot, next-episode tick, progress glow
const POSITION = { top: 48, left: 48 };
const WATCH_APP = "nuvio";           // "nuvio" | "simkl"  (what ▶ Resume opens)

export const command = `osascript -l JavaScript "$HOME/.simkl-radar/simkl.js" data`;
export const refreshFrequency = 10 * 60 * 1000;
export const className = `top: ${POSITION.top}px; left: ${POSITION.left}px;`;

// ---- helpers ----
const posterUrl = (p) => (p ? `https://simkl.in/posters/${p}_m.jpg` : null);
const fanartUrl = (f) => (f ? `https://simkl.in/fanart/${f}_medium.jpg` : null);
const simklUrl = (s) =>
  s.ids && s.ids.simkl
    ? `https://simkl.com/${s.kind === "movie" ? "movies" : s.kind === "anime" ? "anime" : "tv"}/${s.ids.simkl}`
    : `https://simkl.com/search/?q=${encodeURIComponent(s.title)}`;
const watchUrl = (s) => (WATCH_APP === "nuvio" ? `nuvio://search?query=${encodeURIComponent(s.title)}` : simklUrl(s));
const open = (url) => run(`open ${JSON.stringify(url)}`);

// ---- drag to move (grab the bottom bar; double-click it to reset) ----
const POS_KEY = "simkl-radar-pos";
function savedPos() {
  try { return JSON.parse(localStorage.getItem(POS_KEY)) || { x: 0, y: 0 }; } catch (e) { return { x: 0, y: 0 }; }
}
const moveStyle = () => { const p = savedPos(); return { transform: `translate(${p.x}px, ${p.y}px)` }; };
function startDrag(e) {
  if (e.button !== 0) return;
  e.preventDefault();
  const card = e.currentTarget.closest(".sr");
  const start = savedPos(), sx = e.clientX, sy = e.clientY;
  const maxX = window.innerWidth - card.offsetWidth - POSITION.left, maxY = window.innerHeight - card.offsetHeight - POSITION.top;
  let cur = start;
  card.classList.add("sr-dragging");
  const move = (ev) => {
    cur = {
      x: Math.min(maxX, Math.max(-POSITION.left, start.x + ev.clientX - sx)),
      y: Math.min(maxY, Math.max(-POSITION.top, start.y + ev.clientY - sy)),
    };
    card.style.transform = `translate(${cur.x}px, ${cur.y}px)`;
  };
  const up = () => {
    window.removeEventListener("mousemove", move);
    window.removeEventListener("mouseup", up);
    card.classList.remove("sr-dragging");
    try { localStorage.setItem(POS_KEY, JSON.stringify(cur)); } catch (err) {}
  };
  window.addEventListener("mousemove", move);
  window.addEventListener("mouseup", up);
}
function resetPos(e) {
  try { localStorage.removeItem(POS_KEY); } catch (err) {}
  e.currentTarget.closest(".sr").style.transform = "translate(0px, 0px)";
}

const pct = (s) => (s.finished ? 1 : s.total && s.watched != null ? Math.min(1, s.watched / s.total) : 0);
const left = (s) => (s.kind === "movie" || s.finished || s.total == null || s.watched == null ? null : Math.max(0, s.total - s.watched));
const typeLabel = (s) => (s.kind === "movie" ? "MOVIE" : s.kind === "anime" ? "ANIME" : "TV SERIES");

function ago(iso) {
  if (!iso) return "";
  const m = Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d < 30 ? `${d}d ago` : `${Math.round(d / 30)}mo ago`;
}
const clock = (iso) =>
  new Date(iso || Date.now()).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const titleSize = (t) => (t.length <= 14 ? 46 : t.length <= 22 ? 38 : t.length <= 32 ? 31 : 26);

function sub(s) {
  if (s.kind === "movie") return s.finished ? "Movie · Watched" : `Movie · ${Math.round(pct(s) * 100)}%`;
  if (s.finished) return "Completed";
  const l = left(s);
  return [s.next, l != null ? `${l} left` : null].filter(Boolean).join(" · ");
}

// ---- pieces ----
function Ticks({ s }) {
  const n = s.total;
  if (s.kind === "movie" || !n || n > 40) {
    return (
      <div className="sr-bar">
        <i style={{ width: `${Math.max(2, pct(s) * 100)}%` }} />
      </div>
    );
  }
  const lit = s.finished ? n : Math.min(n, s.watched || 0);
  return (
    <div className="sr-ticks">
      {Array.from({ length: n }, (_, i) => (
        <b key={i} className={i < lit ? "on" : i === lit ? "next" : ""} />
      ))}
    </div>
  );
}

function Hero({ s }) {
  const p = Math.round(pct(s) * 100);
  const l = left(s);
  const kick = s.finished ? (s.kind === "movie" ? "JUST WATCHED" : "JUST FINISHED") : "NOW WATCHING";
  const meta = [
    s.year,
    s.kind === "movie" ? (s.runtime ? `${s.runtime} min` : null) : s.total ? `${s.total} episodes` : null,
    typeLabel(s),
  ].filter(Boolean);
  return (
    <div className="sr-hero">
      {s.fanart
        ? <div className="sr-hero-bg" style={{ backgroundImage: `url(${fanartUrl(s.fanart)})` }} />
        : s.poster && <div className="sr-hero-bg sr-hero-bg-poster" style={{ backgroundImage: `url(${posterUrl(s.poster)})` }} />}
      <div className="sr-hero-shade" />
      <div className="sr-hero-in">
        <div className="sr-poster" onClick={() => open(watchUrl(s))}>
          {s.poster ? <img src={posterUrl(s.poster)} /> : <div className="sr-poster-empty">{s.title[0]}</div>}
        </div>
        <div className="sr-info">
          <div className="sr-kick">
            {!s.finished && <span className="sr-live" />}
            {kick}
          </div>
          <div className="sr-title" style={{ fontSize: titleSize(s.title) }}>{s.title}</div>
          <div className="sr-meta">{meta.join("  ·  ")}</div>

          <div className="sr-prog">
            <div className="sr-pct">
              {s.finished ? "✓" : p}
              {!s.finished && <span>%</span>}
            </div>
            <div className="sr-prog-col">
              <Ticks s={s} />
              <div className="sr-prog-text">
                {s.next && <em>{s.next}</em>}
                {s.next && " up next"}
                {l != null && `  ·  ${l} left`}
                {s.finished && (s.kind === "movie" ? "Watched" : "Series completed")}
                {"  ·  "}{ago(s.last)}
              </div>
            </div>
          </div>

          <div className="sr-actions">
            <button className="sr-btn primary" onClick={() => open(watchUrl(s))}>
              <span className="sr-play" /> {s.finished ? "Watch again" : "Resume"}
            </button>
            <button className="sr-btn" onClick={() => open(simklUrl(s))}>Open in Simkl</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Card({ s }) {
  return (
    <div className="sr-card" onClick={() => open(watchUrl(s))}>
      <div className="sr-card-poster">{s.poster ? <img src={posterUrl(s.poster)} /> : null}</div>
      <div className={"sr-card-txt" + (s.finished ? " has-check" : "")}>
        <div className="sr-card-title">{s.title}</div>
        <div className="sr-card-sub">{sub(s)}</div>
        <div className="sr-card-bar">
          <i style={{ width: `${Math.max(3, pct(s) * 100)}%`, opacity: s.finished ? 0.45 : 1 }} />
        </div>
      </div>
      {s.finished && <div className="sr-card-check">✓</div>}
    </div>
  );
}

function Message({ title, body }) {
  return (
    <div className="sr sr-msg" style={moveStyle()}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="sr-kick" onMouseDown={startDrag} onDoubleClick={resetPos} style={{ cursor: "grab" }}>SIMKL RADAR</div>
      <div className="sr-msg-title">{title}</div>
      <div className="sr-msg-body">{body}</div>
    </div>
  );
}

// ---- render ----
export const render = ({ output, error }) => {
  let d;
  try { d = JSON.parse(output); } catch (e) { d = null; }
  if (error || !d) return <Message title="Couldn't load Simkl" body={String(error || "No data yet — it will retry in a few minutes.")} />;
  if (d.error === "not_linked")
    return <Message title="Link your Simkl account" body={<span>Run once in Terminal:<code>osascript -l JavaScript ~/.simkl-radar/simkl.js login</code></span>} />;
  if (d.error || !d.items || !d.items.length) return <Message title="Nothing watched yet" body="Watch something and it will show up here." />;

  const [hero, ...rest] = d.items;
  return (
    <div className="sr" style={moveStyle()}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="sr-ambient" style={{ backgroundImage: hero.fanart ? `url(${fanartUrl(hero.fanart)})` : hero.poster ? `url(${posterUrl(hero.poster)})` : "none" }} />
      <Hero s={hero} />
      <div className="sr-next">
        <div className="sr-label">RECENTLY WATCHED</div>
        <div className="sr-row">{rest.slice(0, 4).map((s) => <Card key={s.kind + s.title} s={s} />)}</div>
      </div>
      <div className="sr-foot" onMouseDown={startDrag} onDoubleClick={resetPos} title="Drag to move · double-click to reset">
        <span className="sr-logo">S</span> SIMKL RADAR <span className="sr-grip">⠿ drag</span>
        <span className="sr-foot-r">
          {d.stale && <span className="sr-stale">offline · </span>}Updated {clock(d.updated)}
        </span>
      </div>
    </div>
  );
};

const CSS = `
.sr{position:relative;width:880px;border-radius:30px;overflow:hidden;color:#f5f5f7;
  font-family:-apple-system,"SF Pro Display","Helvetica Neue",Helvetica,Arial,sans-serif;
  background:rgba(14,12,16,.62);-webkit-backdrop-filter:blur(40px) saturate(160%);backdrop-filter:blur(40px) saturate(160%);
  box-shadow:0 30px 80px rgba(0,0,0,.55),inset 0 0 0 1px rgba(255,255,255,.09);-webkit-font-smoothing:antialiased}
.sr-ambient{position:absolute;inset:-60px;background-size:cover;background-position:center;filter:blur(60px) saturate(140%);opacity:.35;z-index:0}
.sr-hero{position:relative;height:340px;z-index:1}
.sr-hero-bg{position:absolute;inset:0;background-size:cover;background-position:center 78%;
  -webkit-mask-image:linear-gradient(180deg,#000 55%,transparent);mask-image:linear-gradient(180deg,#000 55%,transparent)}
.sr-hero-shade{position:absolute;inset:0;background:
  linear-gradient(90deg,rgba(10,8,12,.95) 0%,rgba(10,8,12,.82) 38%,rgba(10,8,12,.4) 72%,rgba(10,8,12,.25) 100%);
  -webkit-mask-image:linear-gradient(180deg,#000 55%,transparent);mask-image:linear-gradient(180deg,#000 55%,transparent)}
.sr-hero-in{position:relative;display:flex;gap:34px;padding:38px 40px 0 40px;height:100%;box-sizing:border-box}
.sr-poster{flex:none;width:176px;height:264px;border-radius:16px;overflow:hidden;cursor:pointer;
  box-shadow:0 22px 50px rgba(0,0,0,.65),0 0 0 1px rgba(255,255,255,.12);transition:transform .25s ease}
.sr-poster:hover{transform:translateY(-3px) scale(1.02)}
.sr-poster img{width:100%;height:100%;object-fit:cover;display:block}
.sr-poster-empty{width:100%;height:100%;display:grid;place-items:center;font-size:80px;font-weight:800;background:#2a2630;color:#fff4}
.sr-info{flex:1;min-width:0;display:flex;flex-direction:column;padding-top:4px}
.sr-kick{display:flex;align-items:center;gap:9px;font-size:11px;font-weight:700;letter-spacing:.22em;color:rgba(255,255,255,.62)}
.sr-live{width:8px;height:8px;border-radius:50%;background:${ACCENT};box-shadow:0 0 0 0 ${ACCENT}aa;animation:sr-pulse 2s infinite}
@keyframes sr-pulse{0%{box-shadow:0 0 0 0 ${ACCENT}99}70%{box-shadow:0 0 0 9px ${ACCENT}00}100%{box-shadow:0 0 0 0 ${ACCENT}00}}
.sr-title{margin-top:10px;font-weight:800;letter-spacing:-.025em;line-height:1.02;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;text-shadow:0 2px 24px rgba(0,0,0,.5)}
.sr-meta{margin-top:10px;font-size:13px;font-weight:600;letter-spacing:.04em;color:rgba(255,255,255,.55)}
.sr-prog{display:flex;align-items:center;gap:20px;margin-top:auto}
.sr-pct{font-size:58px;font-weight:800;letter-spacing:-.04em;line-height:1;font-variant-numeric:tabular-nums}
.sr-pct span{font-size:22px;font-weight:700;color:rgba(255,255,255,.6);margin-left:2px;vertical-align:top;position:relative;top:6px}
.sr-prog-col{flex:1;min-width:0}
.sr-ticks{display:flex;gap:3px;height:12px}
.sr-ticks b{flex:1;border-radius:3px;background:rgba(255,255,255,.16)}
.sr-ticks b.on{background:linear-gradient(180deg,#fff,#d9d9df)}
.sr-ticks b.next{background:transparent;box-shadow:inset 0 0 0 1.5px ${ACCENT};animation:sr-blink 2s infinite}
@keyframes sr-blink{50%{box-shadow:inset 0 0 0 1.5px ${ACCENT}55}}
.sr-bar{height:10px;border-radius:5px;background:rgba(255,255,255,.16);overflow:hidden}
.sr-bar i{display:block;height:100%;border-radius:5px;background:linear-gradient(90deg,#fff,#ececf1);box-shadow:0 0 18px ${ACCENT}66}
.sr-prog-text{margin-top:10px;font-size:13px;font-weight:600;color:rgba(255,255,255,.62);white-space:pre}
.sr-prog-text em{font-style:normal;color:#fff;font-weight:800;padding:2px 8px;border-radius:7px;background:rgba(255,255,255,.12);
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.2);margin-right:2px}
.sr-actions{display:flex;gap:10px;margin:22px 0 36px}
.sr-btn{all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:9px;padding:10px 18px;border-radius:999px;
  font-size:13px;font-weight:700;color:#fff;background:rgba(255,255,255,.1);box-shadow:inset 0 0 0 1px rgba(255,255,255,.18);
  -webkit-backdrop-filter:blur(20px);backdrop-filter:blur(20px);transition:background .2s,transform .15s}
.sr-btn:hover{background:rgba(255,255,255,.18)}
.sr-btn:active{transform:scale(.96)}
.sr-btn.primary{background:#f5f5f7;color:#111;box-shadow:0 8px 24px rgba(0,0,0,.35)}
.sr-btn.primary:hover{background:#fff}
.sr-play{width:0;height:0;border-left:9px solid currentColor;border-top:6px solid transparent;border-bottom:6px solid transparent}
.sr-next{position:relative;z-index:1;padding:8px 40px 0}
.sr-label{font-size:11px;font-weight:700;letter-spacing:.22em;color:rgba(255,255,255,.5);margin-bottom:12px}
.sr-row{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.sr-card{position:relative;display:flex;gap:12px;padding:10px;border-radius:16px;cursor:pointer;
  background:rgba(255,255,255,.06);box-shadow:inset 0 0 0 1px rgba(255,255,255,.08);transition:background .2s,transform .2s}
.sr-card:hover{background:rgba(255,255,255,.12);transform:translateY(-2px)}
.sr-card-poster{flex:none;width:52px;height:78px;border-radius:9px;overflow:hidden;background:#2a2630;box-shadow:0 6px 16px rgba(0,0,0,.4)}
.sr-card-poster img{width:100%;height:100%;object-fit:cover;display:block}
.sr-card-txt{flex:1;min-width:0;display:flex;flex-direction:column}
.sr-card-txt.has-check .sr-card-title{padding-right:22px}
.sr-hero-bg-poster{background-position:center 25%;filter:blur(28px) saturate(150%) brightness(.75);transform:scale(1.25)}
.sr-card-title{font-size:13.5px;font-weight:700;line-height:1.2;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.sr-card-sub{margin-top:4px;font-size:11.5px;font-weight:600;color:rgba(255,255,255,.55)}
.sr-card-bar{margin-top:auto;height:4px;border-radius:2px;background:rgba(255,255,255,.14);overflow:hidden}
.sr-card-bar i{display:block;height:100%;background:#fff;border-radius:2px}
.sr-card-check{position:absolute;top:8px;right:9px;width:18px;height:18px;border-radius:50%;display:grid;place-items:center;
  font-size:10px;font-weight:900;color:#111;background:rgba(255,255,255,.85)}
.sr-foot{position:relative;z-index:1;display:flex;align-items:center;gap:8px;padding:18px 40px 20px;
  font-size:10.5px;font-weight:700;letter-spacing:.2em;color:rgba(255,255,255,.4)}
.sr-logo{width:18px;height:18px;border-radius:6px;display:grid;place-items:center;letter-spacing:0;font-size:11px;font-weight:900;color:#111;background:rgba(255,255,255,.75)}
.sr-foot{cursor:grab;user-select:none;-webkit-user-select:none}
.sr-grip{margin-left:6px;padding:2px 7px;border-radius:6px;letter-spacing:.08em;color:rgba(255,255,255,.35);background:rgba(255,255,255,.06);opacity:0;transition:opacity .2s}
.sr-foot:hover .sr-grip{opacity:1}
.sr-dragging{cursor:grabbing;box-shadow:0 40px 100px rgba(0,0,0,.7),inset 0 0 0 1px rgba(255,255,255,.18)}
.sr-dragging .sr-foot{cursor:grabbing}
.sr-foot-r{margin-left:auto;letter-spacing:.06em}
.sr-stale{color:${ACCENT}}
.sr-msg{padding:36px 40px;width:520px;box-sizing:border-box}
.sr-msg-title{margin-top:10px;font-size:26px;font-weight:800}
.sr-msg-body{margin-top:10px;font-size:14px;line-height:1.5;color:rgba(255,255,255,.65)}
.sr-msg-body code{display:block;margin-top:10px;padding:10px 12px;border-radius:10px;background:rgba(0,0,0,.35);font:12px ui-monospace,Menlo,monospace;color:#fff}
`;
